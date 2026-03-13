/**
 * Shared types for the tiered memory system.
 *
 * Three tiers:
 *   session  – ephemeral, scoped to one conversation
 *   agent    – persistent per-agent facts and preferences
 *   shared   – cross-agent global knowledge base
 */

export type MemoryTier = "session" | "agent" | "shared";

export type TieredMemoryEntry = {
  id: string;
  tier: MemoryTier;
  key: string;
  value: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  /** Agent that created the entry (null for shared tier). */
  agentId?: string;
  /** Optional session id for session-tier entries. */
  sessionId?: string;
};

export type TieredMemorySearchResult = {
  entry: TieredMemoryEntry;
  score: number;
};

export type TieredMemoryStoreOptions = {
  expiresAt?: number;
  metadata?: Record<string, unknown>;
  /** Agent that owns the entry (for agent-tier scoping). */
  agentId?: string;
  /** Session that owns the entry (for session-tier scoping). */
  sessionId?: string;
};

export type TieredMemorySearchOptions = {
  maxResults?: number;
  minScore?: number;
  /** Restrict search to specific tiers. Defaults to all tiers. */
  tiers?: MemoryTier[];
  /** Restrict results to this agent (agent-tier isolation). */
  agentId?: string;
  /** Restrict results to this session (session-tier isolation). */
  sessionId?: string;
};

export interface TieredMemoryStore {
  /** Store or update a key-value entry in the given tier. */
  store(
    tier: MemoryTier,
    key: string,
    value: string,
    opts?: TieredMemoryStoreOptions,
  ): TieredMemoryEntry;

  /** Retrieve a single entry by tier and key. */
  retrieve(tier: MemoryTier, key: string): TieredMemoryEntry | null;

  /** Full-text search across one or more tiers. */
  search(query: string, opts?: TieredMemorySearchOptions): TieredMemorySearchResult[];

  /** Remove expired or stale entries from a tier. */
  prune(tier: MemoryTier, opts?: { before?: number }): number;

  /** Delete a specific entry. */
  delete(tier: MemoryTier, key: string): boolean;

  /** List all entries for a tier (with optional pagination). */
  list(tier: MemoryTier, opts?: { limit?: number; offset?: number }): TieredMemoryEntry[];

  /** Close resources. */
  close(): void;
}
