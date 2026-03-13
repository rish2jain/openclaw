/**
 * Session Memory — ephemeral tier scoped to a single conversation.
 *
 * Entries are automatically expired when the session ends or after a
 * configurable TTL.  Good for scratch context, working hypotheses,
 * and short-lived tool state.
 */

import type {
  MemoryTier,
  TieredMemoryEntry,
  TieredMemorySearchOptions,
  TieredMemorySearchResult,
  TieredMemoryStore,
  TieredMemoryStoreOptions,
} from "./types.js";

const DEFAULT_SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export class SessionMemory {
  private readonly backend: TieredMemoryStore;
  private readonly sessionId: string;
  private readonly ttlMs: number;
  private readonly tier: MemoryTier = "session";

  constructor(params: { store: TieredMemoryStore; sessionId: string; ttlMs?: number }) {
    this.backend = params.store;
    this.sessionId = params.sessionId;
    this.ttlMs = params.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  /** Store a value with automatic session-scoped TTL. */
  store(key: string, value: string, opts?: TieredMemoryStoreOptions): TieredMemoryEntry {
    const expiresAt = opts?.expiresAt ?? Date.now() + this.ttlMs;
    const metadata = {
      ...opts?.metadata,
      sessionId: this.sessionId,
    };
    return this.backend.store(this.tier, this.scopedKey(key), value, {
      ...opts,
      expiresAt,
      metadata,
    });
  }

  /** Retrieve a value stored in this session. */
  retrieve(key: string): TieredMemoryEntry | null {
    return this.backend.retrieve(this.tier, this.scopedKey(key));
  }

  /** Search session-tier entries only. */
  search(
    query: string,
    opts?: Omit<TieredMemorySearchOptions, "tiers">,
  ): TieredMemorySearchResult[] {
    return this.backend.search(query, { ...opts, tiers: [this.tier] });
  }

  /** Remove all expired session entries. */
  prune(): number {
    return this.backend.prune(this.tier);
  }

  /** Delete a specific session entry. */
  delete(key: string): boolean {
    return this.backend.delete(this.tier, this.scopedKey(key));
  }

  /** Clear all entries for this session. */
  clearSession(): number {
    const entries = this.backend.list(this.tier, { limit: 10_000 });
    let count = 0;
    for (const entry of entries) {
      if (entry.key.startsWith(`${this.sessionId}:`)) {
        this.backend.delete(this.tier, entry.key);
        count += 1;
      }
    }
    return count;
  }

  /** List entries in this session. */
  list(opts?: { limit?: number; offset?: number }): TieredMemoryEntry[] {
    const all = this.backend.list(this.tier, { limit: opts?.limit ?? 100, offset: opts?.offset });
    return all.filter((entry) => entry.key.startsWith(`${this.sessionId}:`));
  }

  /** Prefix key with session ID for namespace isolation. */
  private scopedKey(key: string): string {
    return `${this.sessionId}:${key}`;
  }
}
