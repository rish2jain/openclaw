/**
 * Shared Memory — cross-agent global knowledge base.
 *
 * Entries in this tier are accessible to all agents and represent
 * global facts, shared context, and organization-wide knowledge.
 * No namespace scoping — all agents read and write the same pool.
 */

import type {
  MemoryTier,
  TieredMemoryEntry,
  TieredMemorySearchOptions,
  TieredMemorySearchResult,
  TieredMemoryStore,
  TieredMemoryStoreOptions,
} from "./types.js";

export class SharedMemory {
  private readonly backend: TieredMemoryStore;
  private readonly tier: MemoryTier = "shared";

  constructor(params: { store: TieredMemoryStore }) {
    this.backend = params.store;
  }

  /** Store a globally accessible knowledge entry. */
  store(key: string, value: string, opts?: TieredMemoryStoreOptions): TieredMemoryEntry {
    return this.backend.store(this.tier, key, value, opts);
  }

  /** Retrieve a shared memory entry by key. */
  retrieve(key: string): TieredMemoryEntry | null {
    return this.backend.retrieve(this.tier, key);
  }

  /** Search shared-tier entries. */
  search(
    query: string,
    opts?: Omit<TieredMemorySearchOptions, "tiers">,
  ): TieredMemorySearchResult[] {
    return this.backend.search(query, { ...opts, tiers: [this.tier] });
  }

  /** Prune expired shared entries. */
  prune(): number {
    return this.backend.prune(this.tier);
  }

  /** Delete a specific shared entry. */
  delete(key: string): boolean {
    return this.backend.delete(this.tier, key);
  }

  /** List all shared memory entries. */
  list(opts?: { limit?: number; offset?: number }): TieredMemoryEntry[] {
    return this.backend.list(this.tier, opts);
  }

  /**
   * Publish a cross-agent announcement or finding that all agents should
   * be aware of.
   */
  publish(
    key: string,
    value: string,
    opts?: { publishedBy?: string; category?: string },
  ): TieredMemoryEntry {
    return this.store(key, value, {
      metadata: {
        type: "published",
        publishedBy: opts?.publishedBy,
        category: opts?.category,
        publishedAt: Date.now(),
      },
    });
  }
}
