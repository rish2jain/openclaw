/**
 * Agent Memory — persistent per-agent memory tier.
 *
 * Stores facts, preferences, and learned behaviors that persist across
 * sessions for a specific agent.  No automatic expiry unless explicitly
 * configured per entry.
 */

import type {
  MemoryTier,
  TieredMemoryEntry,
  TieredMemorySearchOptions,
  TieredMemorySearchResult,
  TieredMemoryStore,
  TieredMemoryStoreOptions,
} from "./types.js";

export class AgentMemory {
  private readonly backend: TieredMemoryStore;
  private readonly agentId: string;
  private readonly tier: MemoryTier = "agent";

  constructor(params: { store: TieredMemoryStore; agentId: string }) {
    this.backend = params.store;
    this.agentId = params.agentId;
  }

  /** Store a persistent agent-scoped fact or preference. */
  store(key: string, value: string, opts?: TieredMemoryStoreOptions): TieredMemoryEntry {
    const metadata = {
      ...opts?.metadata,
      agentId: this.agentId,
    };
    return this.backend.store(this.tier, this.scopedKey(key), value, {
      ...opts,
      metadata,
    });
  }

  /** Retrieve a stored agent memory entry. */
  retrieve(key: string): TieredMemoryEntry | null {
    return this.backend.retrieve(this.tier, this.scopedKey(key));
  }

  /** Search agent-tier entries (scoped to this agent). */
  search(
    query: string,
    opts?: Omit<TieredMemorySearchOptions, "tiers" | "agentId">,
  ): TieredMemorySearchResult[] {
    return this.backend.search(query, {
      ...opts,
      tiers: [this.tier],
      agentId: this.agentId,
    });
  }

  /** Prune expired agent entries (most agent entries have no expiry). */
  prune(): number {
    return this.backend.prune(this.tier);
  }

  /** Delete a specific agent memory entry. */
  delete(key: string): boolean {
    return this.backend.delete(this.tier, this.scopedKey(key));
  }

  /** List all agent memory entries. */
  list(opts?: { limit?: number; offset?: number }): TieredMemoryEntry[] {
    const all = this.backend.list(this.tier, opts);
    return all.filter((entry) => entry.key.startsWith(`${this.agentId}:`));
  }

  /**
   * Store a learned behavior — a special entry type with structured metadata
   * indicating this was learned from interaction patterns.
   */
  learnBehavior(
    key: string,
    behavior: string,
    context?: { source?: string; confidence?: number },
  ): TieredMemoryEntry {
    return this.store(key, behavior, {
      metadata: {
        type: "learned_behavior",
        source: context?.source ?? "interaction",
        confidence: context?.confidence ?? 0.7,
        learnedAt: Date.now(),
      },
    });
  }

  /**
   * Store a fact — a piece of knowledge the agent has verified or been told.
   */
  storeFact(key: string, fact: string, source?: string): TieredMemoryEntry {
    return this.store(key, fact, {
      metadata: {
        type: "fact",
        source: source ?? "user",
        verifiedAt: Date.now(),
      },
    });
  }

  /**
   * Store a preference — user or agent preference for behavior/style.
   */
  storePreference(key: string, preference: string): TieredMemoryEntry {
    return this.store(key, preference, {
      metadata: {
        type: "preference",
      },
    });
  }

  /** Namespace key with agent ID. */
  private scopedKey(key: string): string {
    return `${this.agentId}:${key}`;
  }
}
