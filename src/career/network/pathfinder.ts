/**
 * Warm-introduction BFS pathfinder.
 *
 * Finds multi-hop introduction paths through a professional network graph
 * and ranks them by weakest-link connection strength.
 */

import type {
  NetworkGraph,
  NetworkPerson,
  IntroPath,
  IntroPathStep,
  RelationshipEdge,
} from "./types.js";

// ── Constants ─────────────────────────────────────────────────────────

const DEFAULT_MAX_HOPS = 3;
const TOP_N = 5;

// ── Public API ────────────────────────────────────────────────────────

/**
 * Find warm-intro paths from `fromId` to a specific person or to anyone at a
 * target company. The `targetCompanyOrPersonId` is first checked as a person
 * ID; if not found, it is treated as a company name.
 *
 * Returns up to 5 paths sorted by descending minStrength.
 */
export function findIntroPaths(
  graph: NetworkGraph,
  fromId: string,
  targetCompanyOrPersonId: string,
  maxHops: number = DEFAULT_MAX_HOPS,
): IntroPath[] {
  const targets = resolveTargets(graph, targetCompanyOrPersonId);
  if (targets.size === 0 || targets.has(fromId)) {
    return [];
  }

  const adj = buildAdjacency(graph.edges);

  // BFS — each entry tracks the path and weakest edge seen so far.
  type Entry = { path: string[]; minStr: number };
  const queue: Entry[] = [{ path: [fromId], minStr: 1.0 }];
  const found: IntroPath[] = [];

  // Track the best (highest) minStrength with which we've reached each node.
  // If we arrive at a node with equal or worse minStrength, skip it — the
  // earlier BFS entry already explores a path that is at least as strong.
  // This prevents O(N!) queue growth in dense graphs while preserving optimal
  // path discovery for sparse ones.
  const bestMinStrength = new Map<string, number>([[fromId, 1.0]]);

  while (queue.length > 0) {
    const { path, minStr } = queue.shift()!;
    const current = path[path.length - 1];
    const neighbors = adj.get(current);
    if (!neighbors) {
      continue;
    }

    for (const [nId, strength] of neighbors) {
      if (path.includes(nId)) {
        continue;
      } // no cycles

      const newMin = Math.min(minStr, strength);

      // Prune: skip if we already reached this node with equal or better strength.
      const prev = bestMinStrength.get(nId);
      if (prev !== undefined && prev >= newMin) {
        continue;
      }
      bestMinStrength.set(nId, newMin);

      const newPath = [...path, nId];

      if (targets.has(nId)) {
        found.push({
          steps: newPath.map(toStep),
          minStrength: newMin,
          suggestedApproach: "",
        });
        continue;
      }

      // hops used = edges traversed = newPath.length - 1
      if (newPath.length - 1 < maxHops) {
        queue.push({ path: newPath, minStr: newMin });
      }
    }
  }

  found.sort((a, b) => b.minStrength - a.minStrength);
  const top = found.slice(0, TOP_N);

  for (const p of top) {
    p.suggestedApproach = generateApproachSuggestion(p, graph.persons);
  }

  return top;
}

// ── Approach suggestion ───────────────────────────────────────────────

/**
 * Generate a human-readable warm-intro suggestion for a given path.
 */
export function generateApproachSuggestion(
  path: IntroPath,
  persons: Map<string, NetworkPerson>,
): string {
  const ids = path.steps.map((s) => s.personId);
  if (ids.length < 2) {
    return "Direct connection — reach out directly.";
  }

  const name = (id: string): string => persons.get(id)?.name ?? id;
  const target = name(ids[ids.length - 1]);

  if (ids.length === 2) {
    return `Reach out directly to ${target} — you are already connected.`;
  }

  const intermediaries = ids.slice(1, -1).map(name);
  const first = intermediaries[0];
  const chain = intermediaries.join(" → ");
  const hops = ids.length - 1;
  const pct = (path.minStrength * 100).toFixed(0);

  const label =
    path.minStrength >= 0.7 ? "strong" : path.minStrength >= 0.4 ? "moderate" : "tentative";

  return (
    `Ask ${first} to introduce you to ${target} ` +
    `(${hops}-hop path via ${chain}). ` +
    `Path strength: ${label} (${pct}%). ` +
    `Personalise your ask — mention shared context so the request feels natural.`
  );
}

// ── Internal helpers ──────────────────────────────────────────────────

function toStep(personId: string): IntroPathStep {
  return { personId };
}

/**
 * Resolve target to a set of person IDs. If the string matches an existing
 * person ID, return that. Otherwise treat it as a company name.
 */
function resolveTargets(graph: NetworkGraph, target: string): Set<string> {
  if (graph.persons.has(target)) {
    return new Set([target]);
  }
  return new Set(graph.getPersonsByCompany(target).map((p) => p.id));
}

/**
 * Build a bidirectional adjacency map: personId → [[neighborId, strength]].
 */
function buildAdjacency(edges: RelationshipEdge[]): Map<string, Array<[string, number]>> {
  const m = new Map<string, Array<[string, number]>>();

  const add = (from: string, to: string, s: number): void => {
    let list = m.get(from);
    if (!list) {
      list = [];
      m.set(from, list);
    }
    list.push([to, s]);
  };

  for (const e of edges) {
    add(e.fromId, e.toId, e.connectionStrength);
    add(e.toId, e.fromId, e.connectionStrength);
  }

  return m;
}
