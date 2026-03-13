/**
 * SQLite-backed graph storage for entities and relationships.
 *
 * Uses two core tables (nodes + edges) with FTS5 for entity name search
 * when available, falling back to LIKE-based search on Debian/systems
 * without the FTS5 extension.
 */

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { requireNodeSqlite } from "../sqlite.js";
import type { EntityNode, EntityRelationship, EntityType } from "./types.js";

const log = createSubsystemLogger("memory:graph");

const CREATE_NODES = `
  CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    agent_id TEXT
  );
`;

const CREATE_EDGES = `
  CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    properties TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_graph_nodes_name ON graph_nodes(name);
  CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type);
  CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_graph_edges_label ON graph_edges(label);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_edges_unique
    ON graph_edges(source_id, target_id, label);
`;

const FTS_TABLE = "graph_nodes_fts";

const CREATE_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
    name,
    id UNINDEXED,
    type UNINDEXED
  );
`;

type NodeRow = {
  id: string;
  name: string;
  type: string;
  properties: string;
  created_at: number;
  updated_at: number;
  agent_id: string | null;
};

type EdgeRow = {
  id: string;
  source_id: string;
  target_id: string;
  label: string;
  weight: number;
  properties: string;
  created_at: number;
  updated_at: number;
};

function rowToNode(row: NodeRow): EntityNode {
  let properties: Record<string, unknown> = {};
  try {
    properties = JSON.parse(row.properties) as Record<string, unknown>;
  } catch {
    // Ignore malformed JSON
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type as EntityType,
    properties,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    agentId: row.agent_id ?? undefined,
  };
}

function rowToEdge(row: EdgeRow): EntityRelationship {
  let properties: Record<string, unknown> = {};
  try {
    properties = JSON.parse(row.properties) as Record<string, unknown>;
  } catch {
    // Ignore malformed JSON
  }
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    label: row.label,
    weight: row.weight,
    properties,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class GraphStore {
  private readonly db: DatabaseSync;
  private readonly ftsAvailable: boolean;
  private closed = false;

  constructor(params: { dbPath: string }) {
    const { DatabaseSync: SqliteDb } = requireNodeSqlite();
    this.db = new SqliteDb(params.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 3000;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(CREATE_NODES);
    this.db.exec(CREATE_EDGES);
    this.db.exec(CREATE_INDEXES);
    this.ftsAvailable = this.tryCreateFts();

    log.debug("graph store opened", {
      path: params.dbPath,
      fts: this.ftsAvailable,
    });
  }

  private tryCreateFts(): boolean {
    try {
      this.db.exec(CREATE_FTS);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.info(`FTS5 unavailable for graph store, using LIKE fallback: ${message}`);
      return false;
    }
  }

  // --- Node operations ---

  addNode(params: {
    name: string;
    type: EntityType;
    properties?: Record<string, unknown>;
    agentId?: string;
  }): EntityNode {
    this.ensureOpen();
    const now = Date.now();
    const id = randomUUID();
    const propsJson = JSON.stringify(params.properties ?? {});

    this.db
      .prepare(
        `INSERT INTO graph_nodes (id, name, type, properties, created_at, updated_at, agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, params.name, params.type, propsJson, now, now, params.agentId ?? null);

    if (this.ftsAvailable) {
      this.db
        .prepare(`INSERT INTO ${FTS_TABLE} (name, id, type) VALUES (?, ?, ?)`)
        .run(params.name, id, params.type);
    }

    return {
      id,
      name: params.name,
      type: params.type,
      properties: params.properties ?? {},
      createdAt: now,
      updatedAt: now,
      agentId: params.agentId,
    };
  }

  getNode(id: string): EntityNode | null {
    this.ensureOpen();
    const row = this.db.prepare("SELECT * FROM graph_nodes WHERE id = ?").get(id) as
      | NodeRow
      | undefined;
    return row ? rowToNode(row) : null;
  }

  findNodeByName(name: string, type?: EntityType): EntityNode | null {
    this.ensureOpen();
    const sql = type
      ? "SELECT * FROM graph_nodes WHERE name = ? AND type = ? LIMIT 1"
      : "SELECT * FROM graph_nodes WHERE name = ? LIMIT 1";
    const row = (type ? this.db.prepare(sql).get(name, type) : this.db.prepare(sql).get(name)) as
      | NodeRow
      | undefined;
    return row ? rowToNode(row) : null;
  }

  updateNode(
    id: string,
    updates: { name?: string; properties?: Record<string, unknown> },
  ): EntityNode | null {
    this.ensureOpen();
    const existing = this.getNode(id);
    if (!existing) {
      return null;
    }

    const newName = updates.name ?? existing.name;
    const newProps = updates.properties
      ? { ...existing.properties, ...updates.properties }
      : existing.properties;
    const now = Date.now();

    this.db
      .prepare(`UPDATE graph_nodes SET name = ?, properties = ?, updated_at = ? WHERE id = ?`)
      .run(newName, JSON.stringify(newProps), now, id);

    if (this.ftsAvailable && updates.name) {
      this.db.prepare(`UPDATE ${FTS_TABLE} SET name = ? WHERE id = ?`).run(newName, id);
    }

    return { ...existing, name: newName, properties: newProps, updatedAt: now };
  }

  deleteNode(id: string): boolean {
    this.ensureOpen();
    if (this.ftsAvailable) {
      this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE id = ?`).run(id);
    }
    // CASCADE will handle edges
    const result = this.db.prepare("DELETE FROM graph_nodes WHERE id = ?").run(id);
    return ((result as { changes?: number }).changes ?? 0) > 0;
  }

  searchNodes(
    query: string,
    opts?: { type?: EntityType; limit?: number },
  ): Array<{ entity: EntityNode; score: number }> {
    this.ensureOpen();
    const limit = opts?.limit ?? 20;

    if (this.ftsAvailable) {
      return this.searchNodesFts(query, opts?.type, limit);
    }
    return this.searchNodesLike(query, opts?.type, limit);
  }

  private searchNodesFts(
    query: string,
    type: EntityType | undefined,
    limit: number,
  ): Array<{ entity: EntityNode; score: number }> {
    const tokens = query
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((t) => t.trim())
      .filter(Boolean);
    if (!tokens || tokens.length === 0) {
      return this.searchNodesLike(query, type, limit);
    }
    const ftsQuery = tokens.map((t) => `"${t.replaceAll('"', "")}"`).join(" OR ");

    const sql = type
      ? `SELECT f.id, f.name, f.type, rank
         FROM ${FTS_TABLE} f
         WHERE ${FTS_TABLE} MATCH ? AND f.type = ?
         ORDER BY rank LIMIT ?`
      : `SELECT f.id, f.name, f.type, rank
         FROM ${FTS_TABLE} f
         WHERE ${FTS_TABLE} MATCH ?
         ORDER BY rank LIMIT ?`;

    const rows = (
      type
        ? this.db.prepare(sql).all(ftsQuery, type, limit)
        : this.db.prepare(sql).all(ftsQuery, limit)
    ) as Array<{ id: string; rank: number }>;

    return rows
      .map((row) => {
        const node = this.getNode(row.id);
        if (!node) {
          return null;
        }
        const score = row.rank < 0 ? -row.rank / (1 + -row.rank) : 1 / (1 + row.rank);
        return { entity: node, score };
      })
      .filter((r): r is { entity: EntityNode; score: number } => r !== null);
  }

  private searchNodesLike(
    query: string,
    type: EntityType | undefined,
    limit: number,
  ): Array<{ entity: EntityNode; score: number }> {
    const pattern = `%${query}%`;
    const sql = type
      ? `SELECT * FROM graph_nodes WHERE name LIKE ? AND type = ? ORDER BY updated_at DESC LIMIT ?`
      : `SELECT * FROM graph_nodes WHERE name LIKE ? ORDER BY updated_at DESC LIMIT ?`;
    const rows = (
      type
        ? this.db.prepare(sql).all(pattern, type, limit)
        : this.db.prepare(sql).all(pattern, limit)
    ) as NodeRow[];
    return rows.map((row) => ({ entity: rowToNode(row), score: 0.5 }));
  }

  // --- Edge operations ---

  addEdge(params: {
    sourceId: string;
    targetId: string;
    label: string;
    weight?: number;
    properties?: Record<string, unknown>;
  }): EntityRelationship {
    this.ensureOpen();
    const now = Date.now();
    const id = randomUUID();
    const weight = params.weight ?? 1.0;
    const propsJson = JSON.stringify(params.properties ?? {});

    // Upsert: if edge already exists with same source+target+label, update it
    const existing = this.db
      .prepare(
        `SELECT * FROM graph_edges
         WHERE source_id = ? AND target_id = ? AND label = ?`,
      )
      .get(params.sourceId, params.targetId, params.label) as EdgeRow | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE graph_edges
           SET weight = ?, properties = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(weight, propsJson, now, existing.id);
      return {
        ...rowToEdge(existing),
        weight,
        properties: params.properties ?? {},
        updatedAt: now,
      };
    }

    this.db
      .prepare(
        `INSERT INTO graph_edges (id, source_id, target_id, label, weight, properties, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, params.sourceId, params.targetId, params.label, weight, propsJson, now, now);

    return {
      id,
      sourceId: params.sourceId,
      targetId: params.targetId,
      label: params.label,
      weight,
      properties: params.properties ?? {},
      createdAt: now,
      updatedAt: now,
    };
  }

  getEdge(id: string): EntityRelationship | null {
    this.ensureOpen();
    const row = this.db.prepare("SELECT * FROM graph_edges WHERE id = ?").get(id) as
      | EdgeRow
      | undefined;
    return row ? rowToEdge(row) : null;
  }

  deleteEdge(id: string): boolean {
    this.ensureOpen();
    const result = this.db.prepare("DELETE FROM graph_edges WHERE id = ?").run(id);
    return ((result as { changes?: number }).changes ?? 0) > 0;
  }

  /** Get all outgoing edges from a node. */
  getOutgoingEdges(nodeId: string, label?: string): EntityRelationship[] {
    this.ensureOpen();
    const sql = label
      ? "SELECT * FROM graph_edges WHERE source_id = ? AND label = ?"
      : "SELECT * FROM graph_edges WHERE source_id = ?";
    const rows = (
      label ? this.db.prepare(sql).all(nodeId, label) : this.db.prepare(sql).all(nodeId)
    ) as EdgeRow[];
    return rows.map(rowToEdge);
  }

  /** Get all incoming edges to a node. */
  getIncomingEdges(nodeId: string, label?: string): EntityRelationship[] {
    this.ensureOpen();
    const sql = label
      ? "SELECT * FROM graph_edges WHERE target_id = ? AND label = ?"
      : "SELECT * FROM graph_edges WHERE target_id = ?";
    const rows = (
      label ? this.db.prepare(sql).all(nodeId, label) : this.db.prepare(sql).all(nodeId)
    ) as EdgeRow[];
    return rows.map(rowToEdge);
  }

  /** Get all nodes connected to a node (neighbors). */
  getNeighbors(
    nodeId: string,
    opts?: { label?: string; direction?: "out" | "in" | "both" },
  ): EntityNode[] {
    this.ensureOpen();
    const direction = opts?.direction ?? "both";
    const seen = new Set<string>();
    const results: EntityNode[] = [];

    if (direction === "out" || direction === "both") {
      const edges = this.getOutgoingEdges(nodeId, opts?.label);
      for (const edge of edges) {
        if (!seen.has(edge.targetId)) {
          seen.add(edge.targetId);
          const node = this.getNode(edge.targetId);
          if (node) {
            results.push(node);
          }
        }
      }
    }

    if (direction === "in" || direction === "both") {
      const edges = this.getIncomingEdges(nodeId, opts?.label);
      for (const edge of edges) {
        if (!seen.has(edge.sourceId)) {
          seen.add(edge.sourceId);
          const node = this.getNode(edge.sourceId);
          if (node) {
            results.push(node);
          }
        }
      }
    }

    return results;
  }

  // --- Stats ---

  stats(): { nodes: number; edges: number; ftsAvailable: boolean } {
    this.ensureOpen();
    const nodes = this.db.prepare("SELECT COUNT(*) as c FROM graph_nodes").get() as { c: number };
    const edges = this.db.prepare("SELECT COUNT(*) as c FROM graph_edges").get() as { c: number };
    return {
      nodes: nodes.c,
      edges: edges.c,
      ftsAvailable: this.ftsAvailable,
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.db.close();
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("GraphStore is closed");
    }
  }
}
