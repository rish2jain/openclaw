/**
 * SQLite-backed tiered memory store.
 *
 * Single database with a unified `tiered_memory` table partitioned by a
 * `tier` column. FTS5 is optional — when unavailable the store falls back
 * to LIKE-based search.
 */

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { requireNodeSqlite } from "../sqlite.js";
import type {
  MemoryTier,
  TieredMemoryEntry,
  TieredMemorySearchOptions,
  TieredMemorySearchResult,
  TieredMemoryStore,
  TieredMemoryStoreOptions,
} from "./types.js";

const log = createSubsystemLogger("memory:tiered");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS tiered_memory (
    id TEXT PRIMARY KEY,
    tier TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER,
    agent_id TEXT,
    session_id TEXT,
    UNIQUE(tier, key)
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_tiered_memory_tier ON tiered_memory(tier);
  CREATE INDEX IF NOT EXISTS idx_tiered_memory_tier_key ON tiered_memory(tier, key);
  CREATE INDEX IF NOT EXISTS idx_tiered_memory_expires ON tiered_memory(expires_at)
    WHERE expires_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_tiered_memory_agent ON tiered_memory(agent_id)
    WHERE agent_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_tiered_memory_session ON tiered_memory(session_id)
    WHERE session_id IS NOT NULL;
`;

const FTS_TABLE = "tiered_memory_fts";

const CREATE_FTS = `
  CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
    value,
    id UNINDEXED,
    tier UNINDEXED,
    key UNINDEXED
  );
`;

type RowShape = {
  id: string;
  tier: string;
  key: string;
  value: string;
  metadata: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  agent_id: string | null;
  session_id: string | null;
};

function rowToEntry(row: RowShape): TieredMemoryEntry {
  const entry: TieredMemoryEntry = {
    id: row.id,
    tier: row.tier as MemoryTier,
    key: row.key,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.metadata) {
    try {
      entry.metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      // Silently ignore malformed metadata
    }
  }
  if (row.expires_at !== null) {
    entry.expiresAt = row.expires_at;
  }
  if (row.agent_id !== null) {
    entry.agentId = row.agent_id;
  }
  if (row.session_id !== null) {
    entry.sessionId = row.session_id;
  }
  return entry;
}

export class SqliteTieredMemoryStore implements TieredMemoryStore {
  private readonly db: DatabaseSync;
  private readonly ftsAvailable: boolean;
  private closed = false;

  constructor(params: { dbPath: string; agentId?: string; sessionId?: string }) {
    const { DatabaseSync: SqliteDb } = requireNodeSqlite();
    this.db = new SqliteDb(params.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 3000;");
    this.db.exec(CREATE_TABLE);
    this.db.exec(CREATE_INDEXES);
    this.ftsAvailable = this.tryCreateFts();
    log.debug("tiered store opened", {
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
      log.info(`FTS5 unavailable for tiered memory, falling back to LIKE search: ${message}`);
      return false;
    }
  }

  store(
    tier: MemoryTier,
    key: string,
    value: string,
    opts?: TieredMemoryStoreOptions,
  ): TieredMemoryEntry {
    this.ensureOpen();
    const now = Date.now();
    const id = randomUUID();
    const metaJson = opts?.metadata ? JSON.stringify(opts.metadata) : null;

    // Upsert: insert or replace on (tier, key) unique constraint
    const existing = this.retrieve(tier, key);
    if (existing) {
      this.db
        .prepare(
          `UPDATE tiered_memory
           SET value = ?, metadata = ?, updated_at = ?, expires_at = ?
           WHERE tier = ? AND key = ?`,
        )
        .run(value, metaJson, now, opts?.expiresAt ?? null, tier, key);

      if (this.ftsAvailable) {
        this.db.prepare(`UPDATE ${FTS_TABLE} SET value = ? WHERE id = ?`).run(value, existing.id);
      }

      return {
        ...existing,
        value,
        metadata: opts?.metadata,
        updatedAt: now,
        expiresAt: opts?.expiresAt,
      };
    }

    this.db
      .prepare(
        `INSERT INTO tiered_memory (id, tier, key, value, metadata, created_at, updated_at, expires_at, agent_id, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, tier, key, value, metaJson, now, now, opts?.expiresAt ?? null, null, null);

    if (this.ftsAvailable) {
      this.db
        .prepare(`INSERT INTO ${FTS_TABLE} (value, id, tier, key) VALUES (?, ?, ?, ?)`)
        .run(value, id, tier, key);
    }

    return {
      id,
      tier,
      key,
      value,
      metadata: opts?.metadata,
      createdAt: now,
      updatedAt: now,
      expiresAt: opts?.expiresAt,
    };
  }

  retrieve(tier: MemoryTier, key: string): TieredMemoryEntry | null {
    this.ensureOpen();
    const row = this.db
      .prepare("SELECT * FROM tiered_memory WHERE tier = ? AND key = ?")
      .get(tier, key) as RowShape | undefined;
    if (!row) {
      return null;
    }
    return rowToEntry(row);
  }

  search(query: string, opts?: TieredMemorySearchOptions): TieredMemorySearchResult[] {
    this.ensureOpen();
    const cleaned = query.trim();
    if (!cleaned) {
      return [];
    }
    const maxResults = opts?.maxResults ?? 10;
    const minScore = opts?.minScore ?? 0;
    const tiers = opts?.tiers ?? (["session", "agent", "shared"] as MemoryTier[]);

    if (this.ftsAvailable) {
      return this.searchFts(cleaned, tiers, maxResults, minScore);
    }
    return this.searchLike(cleaned, tiers, maxResults, minScore);
  }

  private searchFts(
    query: string,
    tiers: MemoryTier[],
    maxResults: number,
    minScore: number,
  ): TieredMemorySearchResult[] {
    // Build FTS query from tokens
    const tokens = query
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((t) => t.trim())
      .filter(Boolean);
    if (!tokens || tokens.length === 0) {
      return this.searchLike(query, tiers, maxResults, minScore);
    }
    const ftsQuery = tokens.map((t) => `"${t.replaceAll('"', "")}"`).join(" OR ");

    const tierPlaceholders = tiers.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT f.id, f.tier, f.key, f.value, rank
         FROM ${FTS_TABLE} f
         WHERE ${FTS_TABLE} MATCH ?
           AND f.tier IN (${tierPlaceholders})
         ORDER BY rank
         LIMIT ?`,
      )
      .all(ftsQuery, ...tiers, maxResults) as Array<{
      id: string;
      tier: string;
      key: string;
      value: string;
      rank: number;
    }>;

    const results: TieredMemorySearchResult[] = [];
    for (const row of rows) {
      // BM25 rank is negative; more negative = more relevant
      const score = row.rank < 0 ? -row.rank / (1 + -row.rank) : 1 / (1 + row.rank);
      if (score < minScore) {
        continue;
      }
      const full = this.db.prepare("SELECT * FROM tiered_memory WHERE id = ?").get(row.id) as
        | RowShape
        | undefined;
      if (full) {
        results.push({ entry: rowToEntry(full), score });
      }
    }
    return results;
  }

  private searchLike(
    query: string,
    tiers: MemoryTier[],
    maxResults: number,
    _minScore: number,
  ): TieredMemorySearchResult[] {
    const tierPlaceholders = tiers.map(() => "?").join(", ");
    const pattern = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM tiered_memory
         WHERE tier IN (${tierPlaceholders})
           AND (value LIKE ? OR key LIKE ?)
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(...tiers, pattern, pattern, Date.now(), maxResults) as RowShape[];

    return rows.map((row) => ({
      entry: rowToEntry(row),
      score: 0.5, // LIKE-based search has no ranking
    }));
  }

  prune(tier: MemoryTier, opts?: { before?: number }): number {
    this.ensureOpen();
    const now = opts?.before ?? Date.now();

    // Get IDs to prune for FTS cleanup
    const rows = this.db
      .prepare(
        `SELECT id FROM tiered_memory
         WHERE tier = ? AND expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .all(tier, now) as Array<{ id: string }>;

    if (rows.length === 0) {
      return 0;
    }

    if (this.ftsAvailable) {
      const idPlaceholders = rows.map(() => "?").join(", ");
      const ids = rows.map((r) => r.id);
      this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE id IN (${idPlaceholders})`).run(...ids);
    }

    const result = this.db
      .prepare(
        `DELETE FROM tiered_memory
         WHERE tier = ? AND expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .run(tier, now);

    const pruned = (result as { changes?: number }).changes ?? rows.length;
    log.debug(`pruned ${pruned} expired entries from tier=${tier}`);
    return pruned;
  }

  delete(tier: MemoryTier, key: string): boolean {
    this.ensureOpen();
    const existing = this.retrieve(tier, key);
    if (!existing) {
      return false;
    }

    if (this.ftsAvailable) {
      this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE id = ?`).run(existing.id);
    }

    this.db.prepare("DELETE FROM tiered_memory WHERE tier = ? AND key = ?").run(tier, key);
    return true;
  }

  list(tier: MemoryTier, opts?: { limit?: number; offset?: number }): TieredMemoryEntry[] {
    this.ensureOpen();
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    const rows = this.db
      .prepare(
        `SELECT * FROM tiered_memory
         WHERE tier = ?
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(tier, Date.now(), limit, offset) as RowShape[];
    return rows.map(rowToEntry);
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
      throw new Error("TieredMemoryStore is closed");
    }
  }
}
