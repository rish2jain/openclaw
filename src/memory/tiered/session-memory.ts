/**
 * Session Memory — ephemeral tier scoped to a single conversation.
 *
 * Entries are automatically expired when the session ends or after a
 * configurable TTL.  Good for scratch context, working hypotheses,
 * and short-lived tool state.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type {
  MemoryTier,
  TieredMemoryEntry,
  TieredMemorySearchOptions,
  TieredMemorySearchResult,
  TieredMemoryStore,
  TieredMemoryStoreOptions,
} from "./types.js";

const log = createSubsystemLogger("memory:session");
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

  /** Search session-tier entries only (scoped to this session). */
  search(
    query: string,
    opts?: Omit<TieredMemorySearchOptions, "tiers" | "sessionId">,
  ): TieredMemorySearchResult[] {
    return this.backend.search(query, {
      ...opts,
      tiers: [this.tier],
      sessionId: this.sessionId,
    });
  }

  /** Remove all expired session entries. */
  prune(): number {
    return this.backend.prune(this.tier);
  }

  /** Delete a specific session entry. */
  delete(key: string): boolean {
    return this.backend.delete(this.tier, this.scopedKey(key));
  }

  /** Clear all entries for this session (pages until no matching entries). */
  clearSession(): number {
    const pageSize = 1000;
    let count = 0;
    for (;;) {
      const entries = this.backend.list(this.tier, { limit: pageSize });
      const sessionEntries = entries.filter((e) => e.key.startsWith(`${this.sessionId}:`));
      for (const entry of sessionEntries) {
        const ok = this.backend.delete(this.tier, entry.key);
        if (!ok) {
          log.warn(
            `session clear: delete failed (tier=${this.tier} sessionId=${this.sessionId} key=${entry.key}), stopping to avoid infinite retry`,
          );
          return count;
        }
        count += 1;
      }
      if (sessionEntries.length === 0) {
        break;
      }
    }
    return count;
  }

  /** List entries in this session. Honors limit/offset after filtering by this session. */
  list(opts?: { limit?: number; offset?: number }): TieredMemoryEntry[] {
    return this.backend.list(this.tier, {
      limit: opts?.limit ?? 100,
      offset: opts?.offset ?? 0,
      prefix: `${this.sessionId}:`,
    });
  }

  /** Prefix key with session ID for namespace isolation. */
  private scopedKey(key: string): string {
    return `${this.sessionId}:${key}`;
  }
}
