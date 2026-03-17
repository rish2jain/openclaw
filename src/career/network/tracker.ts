/**
 * Interaction tracker — logs contact interactions, surfaces stale connections,
 * and suggests reconnections at companies of interest.
 */

import type { InteractionRecord, NetworkPerson, RelationshipEdge } from "./types.js";

// ── Public types ──────────────────────────────────────────────────────

export type SerializedInteractions = {
  records: InteractionRecord[];
};

export type InteractionTracker = {
  /** Store a new interaction record. */
  logInteraction: (record: InteractionRecord) => void;

  /** Retrieve all interactions for a person, newest first. */
  getInteractions: (personId: string) => InteractionRecord[];

  /**
   * Return people whose most recent interaction is older than
   * `thresholdDays` days ago (or who have no interactions at all).
   */
  getStaleConnections: (persons: NetworkPerson[], thresholdDays: number) => NetworkPerson[];

  /**
   * Suggest people to reconnect with: stale connections at companies the
   * user cares about, sorted by strongest relationship first.
   */
  suggestReconnections: (
    persons: NetworkPerson[],
    edges: RelationshipEdge[],
    targetCompanies: string[],
  ) => NetworkPerson[];

  /** Serialize all interaction records for persistence. */
  toJSON: () => SerializedInteractions;

  /** Restore interaction records from persisted data. */
  fromJSON: (data: SerializedInteractions) => void;
};

// ── Factory ───────────────────────────────────────────────────────────

/**
 * Create an interaction tracker backed by an in-memory store.
 *
 * For persistence, callers can serialise the records returned by
 * `getInteractions` and replay them via `logInteraction` on startup.
 */
export function createInteractionTracker(): InteractionTracker {
  /** personId → InteractionRecord[] (sorted newest-first on read). */
  const store = new Map<string, InteractionRecord[]>();

  const logInteraction = (record: InteractionRecord): void => {
    let list = store.get(record.personId);
    if (!list) {
      list = [];
      store.set(record.personId, list);
    }
    list.push(record);
  };

  const getInteractions = (personId: string): InteractionRecord[] => {
    const list = store.get(personId);
    if (!list || list.length === 0) {
      return [];
    }
    // Return a copy sorted newest-first
    return [...list].toSorted((a, b) => b.date - a.date);
  };

  const getStaleConnections = (
    persons: NetworkPerson[],
    thresholdDays: number,
  ): NetworkPerson[] => {
    const cutoff = Date.now() - thresholdDays * 86_400_000;
    const result: NetworkPerson[] = [];

    for (const p of persons) {
      const latest = latestInteractionDate(store, p.id);
      if (latest === null || latest < cutoff) {
        result.push(p);
      }
    }

    return result;
  };

  const suggestReconnections = (
    persons: NetworkPerson[],
    edges: RelationshipEdge[],
    targetCompanies: string[],
  ): NetworkPerson[] => {
    if (targetCompanies.length === 0) {
      return [];
    }

    const targets = new Set(targetCompanies.map((c) => c.toLowerCase()));

    // Build personId → max edge strength
    const maxStrength = new Map<string, number>();
    for (const e of edges) {
      for (const pid of [e.fromId, e.toId]) {
        const cur = maxStrength.get(pid) ?? 0;
        if (e.connectionStrength > cur) {
          maxStrength.set(pid, e.connectionStrength);
        }
      }
    }

    // Default stale threshold: 90 days (shorter than audit's 180 to be
    // proactive about reconnections).
    const cutoff = Date.now() - 90 * 86_400_000;
    const candidates: Array<{ person: NetworkPerson; strength: number }> = [];

    for (const p of persons) {
      if (!p.company) {
        continue;
      }
      if (!targets.has(p.company.toLowerCase())) {
        continue;
      }

      const latest = latestInteractionDate(store, p.id);
      if (latest !== null && latest >= cutoff) {
        continue;
      } // Not stale

      candidates.push({
        person: p,
        strength: maxStrength.get(p.id) ?? 0,
      });
    }

    // Sort by strongest relationship first
    candidates.sort((a, b) => b.strength - a.strength);
    return candidates.map((c) => c.person);
  };

  const toJSON = (): SerializedInteractions => {
    const records: InteractionRecord[] = [];
    for (const list of store.values()) {
      records.push(...list);
    }
    return { records };
  };

  const fromJSON = (data: SerializedInteractions): void => {
    store.clear();
    for (const record of data.records) {
      logInteraction(record);
    }
  };

  return {
    logInteraction,
    getInteractions,
    getStaleConnections,
    suggestReconnections,
    toJSON,
    fromJSON,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Find the most recent interaction date for a person, or null if none.
 */
function latestInteractionDate(
  store: Map<string, InteractionRecord[]>,
  personId: string,
): number | null {
  const list = store.get(personId);
  if (!list || list.length === 0) {
    return null;
  }
  let max = list[0].date;
  for (let i = 1; i < list.length; i++) {
    if (list[i].date > max) {
      max = list[i].date;
    }
  }
  return max;
}
