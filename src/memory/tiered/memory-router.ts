/**
 * Memory Router — routes memory operations to the appropriate tier
 * based on content type, scope, and explicit tier hints.
 *
 * The router serves as the primary entry point for memory operations,
 * determining which tier should handle a given request.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { AgentMemory } from "./agent-memory.js";
import { SessionMemory } from "./session-memory.js";
import { SharedMemory } from "./shared-memory.js";
import { SqliteTieredMemoryStore } from "./tiered-store.js";
import type {
  MemoryTier,
  TieredMemoryEntry,
  TieredMemorySearchOptions,
  TieredMemorySearchResult,
  TieredMemoryStore,
  TieredMemoryStoreOptions,
} from "./types.js";

const log = createSubsystemLogger("memory:router");

/** Hints for the router to auto-detect the correct tier. */
export type MemoryRouterHints = {
  /** Explicit tier override — bypasses auto-detection. */
  tier?: MemoryTier;
  /** Whether the data is ephemeral (session) or long-lived. */
  ephemeral?: boolean;
  /** Whether the data should be shared across agents. */
  shared?: boolean;
  /** Category hints for classification. */
  category?: "preference" | "fact" | "behavior" | "context" | "scratch";
};

/**
 * Simple heuristics to classify content into a tier when no explicit
 * tier is provided.  These are intentionally conservative — defaulting
 * to agent-tier when uncertain.
 */
function inferTier(key: string, _value: string, hints?: MemoryRouterHints): MemoryTier {
  if (hints?.tier) {
    return hints.tier;
  }
  if (hints?.ephemeral) {
    return "session";
  }
  if (hints?.shared) {
    return "shared";
  }

  // Classify by category hint
  if (hints?.category === "scratch" || hints?.category === "context") {
    return "session";
  }

  // Key-based heuristics for common patterns
  const lowerKey = key.toLowerCase();
  if (
    lowerKey.startsWith("scratch:") ||
    lowerKey.startsWith("temp:") ||
    lowerKey.startsWith("wip:")
  ) {
    return "session";
  }
  if (
    lowerKey.startsWith("global:") ||
    lowerKey.startsWith("org:") ||
    lowerKey.startsWith("shared:")
  ) {
    return "shared";
  }

  // Default: agent-scoped persistent memory
  return "agent";
}

export class MemoryRouter {
  private readonly backend: TieredMemoryStore;
  private readonly agentId: string;
  private readonly sessionId: string;
  readonly session: SessionMemory;
  readonly agent: AgentMemory;
  readonly shared: SharedMemory;

  constructor(params: {
    dbPath: string;
    agentId: string;
    sessionId: string;
    sessionTtlMs?: number;
  }) {
    this.agentId = params.agentId;
    this.sessionId = params.sessionId;
    this.backend = new SqliteTieredMemoryStore({ dbPath: params.dbPath });
    this.session = new SessionMemory({
      store: this.backend,
      sessionId: params.sessionId,
      ttlMs: params.sessionTtlMs,
    });
    this.agent = new AgentMemory({
      store: this.backend,
      agentId: params.agentId,
    });
    this.shared = new SharedMemory({ store: this.backend });

    log.debug("memory router initialized", {
      agentId: params.agentId,
      sessionId: params.sessionId,
    });
  }

  /**
   * Auto-routed store: determines the appropriate tier using heuristics
   * and stores the entry there.
   */
  store(
    key: string,
    value: string,
    opts?: TieredMemoryStoreOptions & { hints?: MemoryRouterHints },
  ): TieredMemoryEntry {
    const tier = inferTier(key, value, opts?.hints);
    const storeOpts = { ...opts };
    if (tier === "agent") {
      storeOpts.agentId = opts?.agentId ?? this.agentId;
    } else if (tier === "session") {
      storeOpts.sessionId = opts?.sessionId ?? this.sessionId;
    }
    return this.backend.store(tier, key, value, storeOpts);
  }

  /**
   * Search across all tiers, merging results by relevance score.
   * Session results get a slight boost for recency.
   */
  search(query: string, opts?: TieredMemorySearchOptions): TieredMemorySearchResult[] {
    const maxResults = opts?.maxResults ?? 10;
    const results = this.backend.search(query, { ...opts, maxResults: maxResults * 2 });

    // Apply tier-based score adjustments
    const adjusted = results.map((result) => {
      let adjustedScore = result.score;
      // Slight boost for session-tier results (recency matters)
      if (result.entry.tier === "session") {
        adjustedScore *= 1.1;
      }
      return { ...result, score: Math.min(1, adjustedScore) };
    });

    // Re-sort by adjusted score and limit
    return adjusted.toSorted((a, b) => b.score - a.score).slice(0, maxResults);
  }

  /** Prune expired entries across all tiers. */
  pruneAll(): { session: number; agent: number; shared: number } {
    return {
      session: this.backend.prune("session"),
      agent: this.backend.prune("agent"),
      shared: this.backend.prune("shared"),
    };
  }

  /** Close the underlying store. */
  close(): void {
    this.backend.close();
  }
}
