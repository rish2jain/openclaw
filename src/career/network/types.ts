/**
 * Types for the professional network graph — connections, relationships,
 * audit reports, intro paths, and the graph container itself.
 */

// ── Core entities ──────────────────────────────────────────────────────

export type NetworkPerson = {
  id: string;
  name: string;
  company?: string;
  title?: string;
  linkedinUrl?: string;
  email?: string;
  tags: string[];
  addedAt: number;
};

export type RelationshipType = "knows" | "worked_with" | "studied_with";

export type RelationshipEdge = {
  fromId: string;
  toId: string;
  type: RelationshipType;
  /** Composite score in [0, 1]. */
  connectionStrength: number;
  lastInteraction?: number;
  /** Company names, school names, or other shared orgs. */
  sharedHistory: string[];
  /** User-provided override in [0, 1] that biases the composite score. */
  manualBoost: number;
};

// ── Interaction tracking ───────────────────────────────────────────────

export type InteractionChannel = "dm" | "group" | "email" | "meeting";

export type InteractionRecord = {
  personId: string;
  channel: InteractionChannel;
  date: number;
  type: "dm" | "group" | "email" | "meeting";
  notes?: string;
};

// ── Warm intro paths ──────────────────────────────────────────────────

export type IntroPathStep = {
  personId: string;
};

export type IntroPath = {
  /** Ordered chain of people from source to target (inclusive). */
  steps: IntroPathStep[];
  /** Weakest connectionStrength along the path — determines path quality. */
  minStrength: number;
  /** Human-readable intro approach suggestion. */
  suggestedApproach: string;
};

// ── Network audit ─────────────────────────────────────────────────────

export type ClusterInfo = {
  /** Cluster identifier (arbitrary int). */
  clusterId: number;
  /** Person IDs in the cluster. */
  members: string[];
};

export type BridgeConnection = {
  personId: string;
  /** Cluster IDs this person bridges. */
  clusters: number[];
};

export type NetworkAuditReport = {
  totalConnections: number;
  byIndustry: Map<string, number>;
  byCompany: Map<string, number>;
  bySeniority: Map<string, number>;
  clusters: ClusterInfo[];
  bridgeConnections: BridgeConnection[];
  /** High-value connections (strength > 0.5) with no interaction in 180+ days. */
  staleHighValue: NetworkPerson[];
};

// ── Graph container ───────────────────────────────────────────────────

export type NetworkGraph = {
  persons: Map<string, NetworkPerson>;
  edges: RelationshipEdge[];

  addPerson: (person: NetworkPerson) => void;
  removePerson: (id: string) => void;
  addEdge: (edge: RelationshipEdge) => void;
  getNeighbors: (id: string) => NetworkPerson[];
  getPersonsByCompany: (company: string) => NetworkPerson[];
};

/**
 * Create a new empty NetworkGraph.
 */
export function createNetworkGraph(): NetworkGraph {
  const persons = new Map<string, NetworkPerson>();
  const edges: RelationshipEdge[] = [];

  // Adjacency index: personId → Set<personId>
  const adjacency = new Map<string, Set<string>>();

  function ensureAdj(id: string): Set<string> {
    let s = adjacency.get(id);
    if (!s) {
      s = new Set();
      adjacency.set(id, s);
    }
    return s;
  }

  const addPerson = (person: NetworkPerson): void => {
    persons.set(person.id, person);
    ensureAdj(person.id);
  };

  const removePerson = (id: string): void => {
    persons.delete(id);
    const neighbors = adjacency.get(id);
    if (neighbors) {
      for (const nId of neighbors) {
        adjacency.get(nId)?.delete(id);
      }
    }
    adjacency.delete(id);
    // Remove edges involving this person
    let i = edges.length;
    while (i--) {
      if (edges[i].fromId === id || edges[i].toId === id) {
        edges.splice(i, 1);
      }
    }
  };

  const addEdge = (edge: RelationshipEdge): void => {
    edges.push(edge);
    ensureAdj(edge.fromId).add(edge.toId);
    ensureAdj(edge.toId).add(edge.fromId);
  };

  const getNeighbors = (id: string): NetworkPerson[] => {
    const neighbors = adjacency.get(id);
    if (!neighbors) {
      return [];
    }
    const result: NetworkPerson[] = [];
    for (const nId of neighbors) {
      const p = persons.get(nId);
      if (p) {
        result.push(p);
      }
    }
    return result;
  };

  const getPersonsByCompany = (company: string): NetworkPerson[] => {
    const lower = company.toLowerCase();
    const result: NetworkPerson[] = [];
    for (const p of persons.values()) {
      if (p.company && p.company.toLowerCase() === lower) {
        result.push(p);
      }
    }
    return result;
  };

  return {
    persons,
    edges,
    addPerson,
    removePerson,
    addEdge,
    getNeighbors,
    getPersonsByCompany,
  };
}
