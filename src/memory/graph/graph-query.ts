/**
 * Graph Query — query entities by relationship paths.
 *
 * Supports traversal queries like "who works on project X" by following
 * labeled edges through the entity graph.  Uses BFS with configurable
 * depth limits to avoid runaway traversals.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { GraphStore } from "./graph-store.js";
import type {
  EntityNode,
  EntityRelationship,
  GraphPathResult,
  RelationshipQueryResult,
} from "./types.js";

const log = createSubsystemLogger("memory:graph:query");

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_RESULTS = 50;
const DEFAULT_OVER_FETCH_MULTIPLIER = 3;

export type TraversalOptions = {
  /** Maximum traversal depth (default: 3). */
  maxDepth?: number;
  /** Maximum results to return (default: 50). */
  maxResults?: number;
  /** Filter edges by label during traversal. */
  edgeLabel?: string;
  /** Direction of traversal. */
  direction?: "out" | "in" | "both";
  /** Minimum edge weight to follow (0-1). */
  minWeight?: number;
  /** If set, called for each visited node; return true to stop traversal early. */
  stopWhen?: (node: EntityNode) => boolean;
};

/**
 * Query the graph for direct relationships from a node.
 *
 * Example: "who works on <nodeId>" — find all entities connected
 * to the given node with "works_on" edges.
 */
export function queryRelationships(
  store: GraphStore,
  nodeId: string,
  opts?: {
    label?: string;
    direction?: "out" | "in" | "both";
    limit?: number;
    minWeight?: number;
  },
): RelationshipQueryResult[] {
  const direction = opts?.direction ?? "both";
  const limit = opts?.limit ?? DEFAULT_MAX_RESULTS;
  const minWeight = opts?.minWeight ?? 0; // Match traverseGraph default so filtering is consistent.
  const results: RelationshipQueryResult[] = [];

  if (direction === "out" || direction === "both") {
    const edges = store.getOutgoingEdges(nodeId, opts?.label);
    for (const edge of edges) {
      if (results.length >= limit) {
        break;
      }
      if (edge.weight < minWeight) {
        continue;
      }
      const source = store.getNode(edge.sourceId);
      const target = store.getNode(edge.targetId);
      if (source && target) {
        results.push({ source, relationship: edge, target });
      }
    }
  }

  if (direction === "in" || direction === "both") {
    const edges = store.getIncomingEdges(nodeId, opts?.label);
    for (const edge of edges) {
      if (results.length >= limit) {
        break;
      }
      if (edge.weight < minWeight) {
        continue;
      }
      const source = store.getNode(edge.sourceId);
      const target = store.getNode(edge.targetId);
      if (source && target) {
        results.push({ source, relationship: edge, target });
      }
    }
  }

  return results;
}

/**
 * Find entities reachable from a starting node via BFS traversal.
 *
 * Example: "what topics are related to project X" — traverse through
 * relationship edges to find connected topic entities.
 */
export function traverseGraph(
  store: GraphStore,
  startNodeId: string,
  opts?: TraversalOptions,
): EntityNode[] {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxResults = opts?.maxResults ?? DEFAULT_MAX_RESULTS;
  const direction = opts?.direction ?? "out";
  const minWeight = opts?.minWeight ?? 0;

  const visited = new Set<string>([startNodeId]);
  const results: EntityNode[] = [];

  // BFS queue: [nodeId, currentDepth]
  const queue: Array<[string, number]> = [[startNodeId, 0]];

  let stopTraversal = false;
  while (queue.length > 0 && results.length < maxResults && !stopTraversal) {
    const entry = queue.shift();
    if (!entry) {
      break;
    }
    const [currentId, depth] = entry;

    if (depth >= maxDepth) {
      continue;
    }

    const neighbors = getFilteredNeighborEdges(store, currentId, {
      direction,
      label: opts?.edgeLabel,
      minWeight,
    });

    for (const { nodeId, edge: _ } of neighbors) {
      if (visited.has(nodeId)) {
        continue;
      }
      visited.add(nodeId);

      const node = store.getNode(nodeId);
      if (node) {
        results.push(node);
        if (opts?.stopWhen?.(node)) {
          stopTraversal = true;
          break;
        }
        if (results.length >= maxResults) {
          break;
        }
        queue.push([nodeId, depth + 1]);
      }
    }
  }

  return results;
}

/**
 * Find the shortest path between two nodes using BFS.
 * Returns null if no path exists within the depth limit.
 */
export function findPath(
  store: GraphStore,
  fromNodeId: string,
  toNodeId: string,
  opts?: { maxDepth?: number },
): GraphPathResult | null {
  const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH * 2;

  if (fromNodeId === toNodeId) {
    const node = store.getNode(fromNodeId);
    if (!node) {
      return null;
    }
    return { nodes: [node], edges: [] };
  }

  // BFS with parent tracking
  const visited = new Set<string>([fromNodeId]);
  const parent = new Map<string, { nodeId: string; edge: EntityRelationship }>();
  const queue: Array<[string, number]> = [[fromNodeId, 0]];

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) {
      break;
    }
    const [currentId, depth] = entry;

    if (depth >= maxDepth) {
      continue;
    }

    const edges = [...store.getOutgoingEdges(currentId), ...store.getIncomingEdges(currentId)];

    for (const edge of edges) {
      const nextId = edge.sourceId === currentId ? edge.targetId : edge.sourceId;
      if (visited.has(nextId)) {
        continue;
      }
      visited.add(nextId);
      parent.set(nextId, { nodeId: currentId, edge });

      if (nextId === toNodeId) {
        return reconstructPath(store, fromNodeId, toNodeId, parent);
      }

      queue.push([nextId, depth + 1]);
    }
  }

  log.debug(`no path found from ${fromNodeId} to ${toNodeId} within depth ${maxDepth}`);
  return null;
}

/**
 * Find all entities of a given type connected to a node, regardless
 * of how many hops away.
 *
 * Example: "find all people connected to project X"
 */
export function findConnectedByType(
  store: GraphStore,
  startNodeId: string,
  targetType: string,
  opts?: { maxDepth?: number; maxResults?: number; overFetchMultiplier?: number },
): EntityNode[] {
  const maxResults = opts?.maxResults ?? DEFAULT_MAX_RESULTS;
  const overFetchMultiplier = Math.max(
    1,
    opts?.overFetchMultiplier ?? DEFAULT_OVER_FETCH_MULTIPLIER,
  );
  let targetTypeCount = 0;

  const all = traverseGraph(store, startNodeId, {
    maxDepth: opts?.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxResults: maxResults * overFetchMultiplier,
    direction: "both",
    stopWhen: (node) => {
      if (node.type === targetType) {
        targetTypeCount++;
        return targetTypeCount >= maxResults;
      }
      return false;
    },
  });

  return all.filter((node) => node.type === targetType).slice(0, maxResults);
}

// --- Internal helpers ---

function getFilteredNeighborEdges(
  store: GraphStore,
  nodeId: string,
  opts: { direction: "out" | "in" | "both"; label?: string; minWeight: number },
): Array<{ nodeId: string; edge: EntityRelationship }> {
  const results: Array<{ nodeId: string; edge: EntityRelationship }> = [];

  if (opts.direction === "out" || opts.direction === "both") {
    const edges = store.getOutgoingEdges(nodeId, opts.label);
    for (const edge of edges) {
      if (edge.weight >= opts.minWeight) {
        results.push({ nodeId: edge.targetId, edge });
      }
    }
  }

  if (opts.direction === "in" || opts.direction === "both") {
    const edges = store.getIncomingEdges(nodeId, opts.label);
    for (const edge of edges) {
      if (edge.weight >= opts.minWeight) {
        results.push({ nodeId: edge.sourceId, edge });
      }
    }
  }

  return results;
}

function reconstructPath(
  store: GraphStore,
  fromNodeId: string,
  toNodeId: string,
  parentMap: Map<string, { nodeId: string; edge: EntityRelationship }>,
): GraphPathResult | null {
  const nodes: EntityNode[] = [];
  const edges: EntityRelationship[] = [];

  let currentId = toNodeId;
  while (currentId !== fromNodeId) {
    const node = store.getNode(currentId);
    if (!node) {
      return null;
    }
    nodes.unshift(node);

    const parentInfo = parentMap.get(currentId);
    if (!parentInfo) {
      return null;
    }
    edges.unshift(parentInfo.edge);
    currentId = parentInfo.nodeId;
  }

  const startNode = store.getNode(fromNodeId);
  if (!startNode) {
    return null;
  }
  nodes.unshift(startNode);

  return { nodes, edges };
}
