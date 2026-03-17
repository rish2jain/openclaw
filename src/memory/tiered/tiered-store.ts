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

/** SQLite default SQLITE_MAX_VARIABLE_NUMBER; chunk IN lists to stay under limit. */
const MAX_IN_PARAMS = 999;

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const metaPreview =
        row.metadata.length > 200 ? `${row.metadata.slice(0, 200)}...` : row.metadata;
      log.warn("malformed tiered_memory metadata", {
        id: row.id,
        key: row.key,
        metadata: metaPreview,
        error: msg,
      });
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

/** Escape SQL LIKE special characters (%, _, \) so the pattern matches literally. */
function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export class SqliteTieredMemoryStore implements TieredMemoryStore {
  private readonly db: DatabaseSync;
  private readonly ftsAvailable: boolean;
  private readonly agentId: string | undefined;
  private readonly sessionId: string | undefined;
  private closed = false;

  constructor(params: { dbPath: string; agentId?: string; sessionId?: string }) {
    const { DatabaseSync: SqliteDb } = requireNodeSqlite();
    this.db = new SqliteDb(params.dbPath);
    this.agentId = params.agentId;
    this.sessionId = params.sessionId;
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
    const agentId = opts?.agentId ?? this.agentId ?? null;
    const sessionId = opts?.sessionId ?? this.sessionId ?? null;

    const runUpsert = (): RowShape => {
      this.db
        .prepare(
          `INSERT INTO tiered_memory (id, tier, key, value, metadata, created_at, updated_at, expires_at, agent_id, session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(tier, key) DO UPDATE SET
             value = excluded.value,
             metadata = excluded.metadata,
             updated_at = excluded.updated_at,
             expires_at = excluded.expires_at,
             agent_id = excluded.agent_id,
             session_id = excluded.session_id`,
        )
        .run(id, tier, key, value, metaJson, now, now, opts?.expiresAt ?? null, agentId, sessionId);
      return this.db
        .prepare("SELECT * FROM tiered_memory WHERE tier = ? AND key = ?")
        .get(tier, key) as RowShape;
    };

    let row: RowShape;
    if (this.ftsAvailable) {
      try {
        this.db.exec("BEGIN");
        row = runUpsert();
        const entryId = row.id;
        if (row.id === id) {
          this.db
            .prepare(`INSERT INTO ${FTS_TABLE} (value, id, tier, key) VALUES (?, ?, ?, ?)`)
            .run(value, entryId, tier, key);
        } else {
          this.db.prepare(`UPDATE ${FTS_TABLE} SET value = ? WHERE id = ?`).run(value, entryId);
        }
        this.db.exec("COMMIT");
      } catch (err) {
        try {
          this.db.exec("ROLLBACK");
        } catch (rollbackErr) {
          log.debug("ROLLBACK failed", { error: rollbackErr });
        }
        throw err;
      }
    } else {
      row = runUpsert();
    }

    const entryId = row.id;
    return {
      id: entryId,
      tier,
      key,
      value,
      metadata: opts?.metadata,
      createdAt: row.created_at,
      updatedAt: now,
      expiresAt: opts?.expiresAt ?? row.expires_at ?? undefined,
      ...(row.agent_id != null && { agentId: row.agent_id }),
      ...(row.session_id != null && { sessionId: row.session_id }),
    };
  }

  retrieve(tier: MemoryTier, key: string): TieredMemoryEntry | null {
    this.ensureOpen();
    const now = Date.now();
    const row = this.db
      .prepare(
        "SELECT * FROM tiered_memory WHERE tier = ? AND key = ? AND (expires_at IS NULL OR expires_at > ?)",
      )
      .get(tier, key, now) as RowShape | undefined;
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
    const agentId = opts?.agentId;
    const sessionId = opts?.sessionId;

    if (this.ftsAvailable) {
      return this.searchFts(cleaned, tiers, maxResults, minScore, agentId, sessionId);
    }
    return this.searchLike(cleaned, tiers, maxResults, minScore, agentId, sessionId);
  }

  private searchFts(
    query: string,
    tiers: MemoryTier[],
    maxResults: number,
    minScore: number,
    agentId?: string,
    sessionId?: string,
  ): TieredMemorySearchResult[] {
    // Build FTS query from tokens
    const tokens = query
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((t) => t.trim())
      .filter(Boolean);
    if (!tokens || tokens.length === 0) {
      return this.searchLike(query, tiers, maxResults, minScore, agentId, sessionId);
    }
    const ftsQuery = tokens.map((t) => `"${t.replaceAll('"', "")}"`).join(" OR ");

    const tierPlaceholders = tiers.map(() => "?").join(", ");
    const conditions: string[] = [`${FTS_TABLE} MATCH ?`, `f.tier IN (${tierPlaceholders})`];
    const params: (string | number | null)[] = [ftsQuery, ...tiers];
    // Always join tiered_memory so we can filter by expires_at (exclude expired entries).
    const joinClause = `JOIN tiered_memory m ON m.id = f.id`;
    conditions.push("(m.expires_at IS NULL OR m.expires_at > ?)");
    params.push(Date.now());
    if (agentId != null) {
      conditions.push("m.agent_id = ?");
      params.push(agentId);
    }
    if (sessionId != null) {
      conditions.push("m.session_id = ?");
      params.push(sessionId);
    }
    params.push(maxResults);
    const rows = this.db
      .prepare(
        `SELECT f.id, f.tier, f.key, f.value, rank
         FROM ${FTS_TABLE} f ${joinClause}
         WHERE ${conditions.join(" AND ")}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...params) as Array<{
      id: string;
      tier: string;
      key: string;
      value: string;
      rank: number;
    }>;

    // Collect (id, score) for rows that pass minScore; then batch-fetch full rows to avoid N+1.
    const qualifying: Array<{ id: string; score: number }> = [];
    for (const row of rows) {
      const score = row.rank < 0 ? -row.rank / (1 + -row.rank) : 1 / (1 + row.rank);
      if (score >= minScore) {
        qualifying.push({ id: row.id, score });
      }
    }
    if (qualifying.length === 0) {
      return [];
    }

    const idToFull = new Map<string, RowShape>();
    for (let i = 0; i < qualifying.length; i += MAX_IN_PARAMS) {
      const chunk = qualifying.slice(i, i + MAX_IN_PARAMS);
      const placeholders = chunk.map(() => "?").join(", ");
      const ids = chunk.map((q) => q.id);
      const fullRows = this.db
        .prepare(`SELECT * FROM tiered_memory WHERE id IN (${placeholders})`)
        .all(...ids) as RowShape[];
      for (const full of fullRows) {
        idToFull.set(full.id, full);
      }
    }

    const results: TieredMemorySearchResult[] = [];
    for (const { id, score } of qualifying) {
      const full = idToFull.get(id);
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
    agentId?: string,
    sessionId?: string,
  ): TieredMemorySearchResult[] {
    const tierPlaceholders = tiers.map(() => "?").join(", ");
    const escaped = escapeLike(query);
    const pattern = `%${escaped}%`;
    const conditions: string[] = [
      `tier IN (${tierPlaceholders})`,
      `(value LIKE ? ESCAPE '\\' OR key LIKE ? ESCAPE '\\')`,
      "(expires_at IS NULL OR expires_at > ?)",
    ];
    const params: (string | number | null)[] = [...tiers, pattern, pattern, Date.now()];
    if (agentId != null) {
      conditions.push("agent_id = ?");
      params.push(agentId);
    }
    if (sessionId != null) {
      conditions.push("session_id = ?");
      params.push(sessionId);
    }
    params.push(maxResults);
    const rows = this.db
      .prepare(
        `SELECT * FROM tiered_memory
         WHERE ${conditions.join(" AND ")}
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(...params) as RowShape[];

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

    try {
      this.db.exec("BEGIN");
      if (this.ftsAvailable) {
        const ids = rows.map((r) => r.id);
        for (let i = 0; i < ids.length; i += MAX_IN_PARAMS) {
          const chunkIds = ids.slice(i, i + MAX_IN_PARAMS);
          const idPlaceholders = chunkIds.map(() => "?").join(", ");
          this.db
            .prepare(`DELETE FROM ${FTS_TABLE} WHERE id IN (${idPlaceholders})`)
            .run(...chunkIds);
        }
      }
      const result = this.db
        .prepare(
          `DELETE FROM tiered_memory
           WHERE tier = ? AND expires_at IS NOT NULL AND expires_at <= ?`,
        )
        .run(tier, now);
      this.db.exec("COMMIT");
      const pruned = (result as { changes?: number }).changes ?? rows.length;
      log.debug(`pruned ${pruned} expired entries from tier=${tier}`);
      return pruned;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch (rollbackErr) {
        log.debug("ROLLBACK failed", { error: rollbackErr });
      }
      throw err;
    }
  }

  delete(tier: MemoryTier, key: string): boolean {
    this.ensureOpen();
    const existing = this.retrieve(tier, key);
    if (!existing) {
      return false;
    }

    try {
      this.db.exec("BEGIN");
      if (this.ftsAvailable) {
        this.db.prepare(`DELETE FROM ${FTS_TABLE} WHERE id = ?`).run(existing.id);
      }
      this.db.prepare("DELETE FROM tiered_memory WHERE tier = ? AND key = ?").run(tier, key);
      this.db.exec("COMMIT");
      return true;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK");
      } catch (rollbackErr) {
        log.debug("ROLLBACK failed", { error: rollbackErr });
      }
      throw err;
    }
  }

  list(
    tier: MemoryTier,
    opts?: { limit?: number; offset?: number; prefix?: string },
  ): TieredMemoryEntry[] {
    this.ensureOpen();
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    const prefix = opts?.prefix;
    const now = Date.now();
    let baseQuery = `SELECT * FROM tiered_memory
               WHERE tier = ?
                 AND (expires_at IS NULL OR expires_at > ?)`;
    const params: (string | number)[] = [tier, now];
    if (prefix !== undefined && prefix !== "") {
      baseQuery += ` AND key LIKE ? ESCAPE '\\'`;
      params.push(escapeLike(prefix) + "%");
    }
    baseQuery += `
               ORDER BY updated_at DESC, key DESC
               LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = this.db.prepare(baseQuery).all(...params) as RowShape[];
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
