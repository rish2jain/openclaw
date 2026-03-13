/**
 * Network audit — distribution analysis, cluster detection, bridge
 * identification, and stale-high-value flagging.
 */

import type {
  NetworkPerson,
  RelationshipEdge,
  NetworkAuditReport,
  ClusterInfo,
  BridgeConnection,
} from "./types.js";

const STALE_MS = 180 * 86_400_000;
const HIGH_VALUE_THRESHOLD = 0.5;

/**
 * Generate a comprehensive network audit report.
 */
export function generateNetworkAudit(
  persons: NetworkPerson[],
  edges: RelationshipEdge[],
): NetworkAuditReport {
  const byCompany = groupByCompany(persons);
  const byIndustry = groupByIndustry(persons);
  const bySeniority = groupBySeniority(persons);
  const clusters = detectClusters(persons, edges);
  const bridges = findBridges(persons, edges, clusters);
  const stale = findStaleHighValue(persons, edges);

  return {
    totalConnections: persons.length,
    byCompany,
    byIndustry,
    bySeniority,
    clusters,
    bridgeConnections: bridges,
    staleHighValue: stale,
  };
}

// ── Distribution helpers ──────────────────────────────────────────────

function groupByCompany(persons: NetworkPerson[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of persons) {
    const key = p.company ?? "Unknown";
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

/**
 * Infer a rough industry from company name or title keywords.
 * This is a heuristic — it groups by recognisable sector keywords.
 */
function groupByIndustry(persons: NetworkPerson[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of persons) {
    const industry = inferIndustry(p);
    m.set(industry, (m.get(industry) ?? 0) + 1);
  }
  return m;
}

function groupBySeniority(persons: NetworkPerson[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of persons) {
    const level = inferSeniority(p.title ?? "");
    m.set(level, (m.get(level) ?? 0) + 1);
  }
  return m;
}

// ── Industry inference ────────────────────────────────────────────────

/* prettier-ignore */
const INDUSTRY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(software|engineer|developer|devops|sre|backend|frontend|fullstack)\b/i, "Technology"],
  [/\b(finance|banking|investment|venture|capital|fintech)\b/i, "Finance"],
  [/\b(consult|advisory|strateg)/i, "Consulting"],  [/\b(health|medical|pharma|biotech)\b/i, "Healthcare"],
  [/\b(market|brand|advertis|growth|seo)\b/i, "Marketing"],  [/\b(legal|law|attorney|counsel)\b/i, "Legal"],
  [/\b(educat|university|professor|academ)\b/i, "Education"],  [/\b(design|ux|ui|creative)\b/i, "Design"],
  [/\b(sales|account executive|business development)\b/i, "Sales"],
  [/\b(product manager|product lead)\b/i, "Product"],  [/\b(data|analytics|machine learning|ai|ml)\b/i, "Data & AI"],
  [/\b(hr|human resources|talent|recruit)\b/i, "Human Resources"],
];

function inferIndustry(person: NetworkPerson): string {
  const text = [person.company ?? "", person.title ?? ""].join(" ");
  for (const [re, label] of INDUSTRY_KEYWORDS) {
    if (re.test(text)) {
      return label;
    }
  }
  return "Other";
}

// ── Seniority inference ───────────────────────────────────────────────

const SENIORITY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(ceo|cto|cfo|coo|cmo|cpo|founder|co-founder|president|chairman)\b/i, "C-Suite / Founder"],
  [/\b(vp|vice president|svp|evp)\b/i, "VP"],
  [/\b(director|head of)\b/i, "Director"],
  [/\b(senior|staff|principal|lead)\b/i, "Senior"],
  [/\b(manager|supervisor)\b/i, "Manager"],
  [/\b(junior|jr|associate|intern|entry)\b/i, "Junior"],
];

function inferSeniority(title: string): string {
  for (const [re, label] of SENIORITY_PATTERNS) {
    if (re.test(title)) {
      return label;
    }
  }
  return "Individual Contributor";
}

// ── Cluster detection (Union-Find) ────────────────────────────────────

/**
 * Simple union-find (disjoint set) for connected-component detection.
 */
class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor(ids: string[]) {
    this.parent = new Map();
    this.rank = new Map();
    for (const id of ids) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
    }
  }

  find(x: string): string {
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) {
      return;
    }
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) {
      this.parent.set(ra, rb);
    } else if (rankA > rankB) {
      this.parent.set(rb, ra);
    } else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }

  /** Return all clusters as root → member-ids. */
  clusters(): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      let list = m.get(root);
      if (!list) {
        list = [];
        m.set(root, list);
      }
      list.push(id);
    }
    return m;
  }
}

function detectClusters(persons: NetworkPerson[], edges: RelationshipEdge[]): ClusterInfo[] {
  const ids = persons.map((p) => p.id);
  const uf = new UnionFind(ids);

  for (const e of edges) {
    uf.union(e.fromId, e.toId);
  }

  const raw = uf.clusters();
  const result: ClusterInfo[] = [];
  let nextId = 0;

  for (const members of raw.values()) {
    if (members.length > 0) {
      result.push({ clusterId: nextId++, members });
    }
  }

  // Sort largest clusters first
  result.sort((a, b) => b.members.length - a.members.length);
  return result;
}

// ── Bridge detection ──────────────────────────────────────────────────

/**
 * A bridge is a person who has neighbors in multiple distinct clusters.
 */
function findBridges(
  persons: NetworkPerson[],
  edges: RelationshipEdge[],
  clusters: ClusterInfo[],
): BridgeConnection[] {
  // Build a personId → clusterId lookup
  const clusterOf = new Map<string, number>();
  for (const c of clusters) {
    for (const mid of c.members) {
      clusterOf.set(mid, c.clusterId);
    }
  }

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  const ensure = (id: string): Set<string> => {
    let s = adj.get(id);
    if (!s) {
      s = new Set();
      adj.set(id, s);
    }
    return s;
  };
  for (const e of edges) {
    ensure(e.fromId).add(e.toId);
    ensure(e.toId).add(e.fromId);
  }

  const bridges: BridgeConnection[] = [];

  for (const p of persons) {
    const neighbors = adj.get(p.id);
    if (!neighbors) {
      continue;
    }

    const touchedClusters = new Set<number>();
    const myCid = clusterOf.get(p.id);
    if (myCid !== undefined) {
      touchedClusters.add(myCid);
    }

    for (const nId of neighbors) {
      const cid = clusterOf.get(nId);
      if (cid !== undefined) {
        touchedClusters.add(cid);
      }
    }

    if (touchedClusters.size > 1) {
      bridges.push({
        personId: p.id,
        clusters: [...touchedClusters],
      });
    }
  }

  return bridges;
}

// ── Stale high-value ──────────────────────────────────────────────────

function findStaleHighValue(persons: NetworkPerson[], edges: RelationshipEdge[]): NetworkPerson[] {
  const now = Date.now();

  // For each person, find their strongest inbound/outbound edge
  const strongEdges = new Map<string, RelationshipEdge>();
  for (const e of edges) {
    if (e.connectionStrength > HIGH_VALUE_THRESHOLD) {
      // Track for both endpoints
      for (const pid of [e.fromId, e.toId]) {
        const existing = strongEdges.get(pid);
        if (!existing || e.connectionStrength > existing.connectionStrength) {
          strongEdges.set(pid, e);
        }
      }
    }
  }

  const personMap = new Map(persons.map((p) => [p.id, p]));
  const result: NetworkPerson[] = [];

  for (const [pid, edge] of strongEdges) {
    const lastInt = edge.lastInteraction;
    if (lastInt !== undefined && now - lastInt > STALE_MS) {
      const p = personMap.get(pid);
      if (p) {
        result.push(p);
      }
    }
  }

  return result;
}
