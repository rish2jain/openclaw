import { describe, it, expect } from "vitest";
import { findIntroPaths, generateApproachSuggestion } from "./pathfinder.js";
import {
  createNetworkGraph,
  type NetworkPerson,
  type RelationshipEdge,
  type IntroPath,
} from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makePerson(id: string, name: string, company?: string): NetworkPerson {
  return { id, name, company, tags: [], addedAt: Date.now() };
}

function makeEdge(fromId: string, toId: string, strength: number): RelationshipEdge {
  return {
    fromId,
    toId,
    type: "knows",
    connectionStrength: strength,
    sharedHistory: [],
    manualBoost: 0,
  };
}

function buildGraph(persons: NetworkPerson[], edges: RelationshipEdge[]) {
  const graph = createNetworkGraph();
  for (const p of persons) {
    graph.addPerson(p);
  }
  for (const e of edges) {
    graph.addEdge(e);
  }
  return graph;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("findIntroPaths", () => {
  describe("basic pathfinding", () => {
    it("returns empty when target is the source itself", () => {
      const graph = buildGraph([makePerson("a", "Alice")], []);
      expect(findIntroPaths(graph, "a", "a")).toEqual([]);
    });

    it("returns empty when target does not exist", () => {
      const graph = buildGraph([makePerson("a", "Alice")], []);
      expect(findIntroPaths(graph, "a", "nonexistent")).toEqual([]);
    });

    it("returns empty when no path exists", () => {
      const graph = buildGraph(
        [makePerson("a", "Alice"), makePerson("b", "Bob")],
        [], // No edges
      );
      expect(findIntroPaths(graph, "a", "b")).toEqual([]);
    });

    it("finds direct connection (1 hop)", () => {
      const graph = buildGraph(
        [makePerson("a", "Alice"), makePerson("b", "Bob")],
        [makeEdge("a", "b", 0.8)],
      );
      const paths = findIntroPaths(graph, "a", "b");
      expect(paths).toHaveLength(1);
      expect(paths[0].steps).toHaveLength(2);
      expect(paths[0].steps[0].personId).toBe("a");
      expect(paths[0].steps[1].personId).toBe("b");
      expect(paths[0].minStrength).toBe(0.8);
    });

    it("finds 2-hop path through intermediary", () => {
      const graph = buildGraph(
        [makePerson("a", "Alice"), makePerson("m", "Mallory"), makePerson("b", "Bob")],
        [makeEdge("a", "m", 0.9), makeEdge("m", "b", 0.7)],
      );
      const paths = findIntroPaths(graph, "a", "b");
      expect(paths).toHaveLength(1);
      expect(paths[0].steps).toHaveLength(3);
      expect(paths[0].minStrength).toBe(0.7);
    });

    it("finds 3-hop path", () => {
      const graph = buildGraph(
        [
          makePerson("a", "Alice"),
          makePerson("m1", "Mid1"),
          makePerson("m2", "Mid2"),
          makePerson("b", "Bob"),
        ],
        [makeEdge("a", "m1", 0.9), makeEdge("m1", "m2", 0.6), makeEdge("m2", "b", 0.8)],
      );
      const paths = findIntroPaths(graph, "a", "b", 3);
      expect(paths).toHaveLength(1);
      expect(paths[0].steps).toHaveLength(4);
      expect(paths[0].minStrength).toBe(0.6);
    });
  });

  describe("hop limit enforcement", () => {
    it("respects maxHops=1 (direct only)", () => {
      const graph = buildGraph(
        [makePerson("a", "Alice"), makePerson("m", "Mid"), makePerson("b", "Bob")],
        [makeEdge("a", "m", 0.9), makeEdge("m", "b", 0.8)],
      );
      const paths = findIntroPaths(graph, "a", "b", 1);
      // b is 2 hops away, but maxHops=1 so no path
      expect(paths).toHaveLength(0);
    });

    it("finds paths within default maxHops=3", () => {
      const persons = [
        makePerson("a", "Alice"),
        makePerson("m1", "Mid1"),
        makePerson("m2", "Mid2"),
        makePerson("b", "Bob"),
      ];
      const edges = [makeEdge("a", "m1", 0.9), makeEdge("m1", "m2", 0.8), makeEdge("m2", "b", 0.7)];
      const graph = buildGraph(persons, edges);
      const paths = findIntroPaths(graph, "a", "b"); // default maxHops=3
      expect(paths.length).toBeGreaterThan(0);
    });

    it("does not find 4-hop path with default maxHops=3", () => {
      const persons = [
        makePerson("a", "A"),
        makePerson("m1", "M1"),
        makePerson("m2", "M2"),
        makePerson("m3", "M3"),
        makePerson("b", "B"),
      ];
      const edges = [
        makeEdge("a", "m1", 0.9),
        makeEdge("m1", "m2", 0.8),
        makeEdge("m2", "m3", 0.7),
        makeEdge("m3", "b", 0.6),
      ];
      const graph = buildGraph(persons, edges);
      const paths = findIntroPaths(graph, "a", "b", 3);
      // 4 hops needed, only 3 allowed
      expect(paths).toHaveLength(0);
    });
  });

  describe("ranking and limiting", () => {
    it("sorts paths by minStrength descending", () => {
      // Two parallel paths: strong and weak
      const graph = buildGraph(
        [
          makePerson("a", "Alice"),
          makePerson("s", "Strong"),
          makePerson("w", "Weak"),
          makePerson("b", "Bob"),
        ],
        [
          makeEdge("a", "s", 0.9),
          makeEdge("s", "b", 0.8),
          makeEdge("a", "w", 0.3),
          makeEdge("w", "b", 0.2),
        ],
      );
      const paths = findIntroPaths(graph, "a", "b");
      expect(paths.length).toBeGreaterThanOrEqual(2);
      expect(paths[0].minStrength).toBeGreaterThanOrEqual(paths[1].minStrength);
    });

    it("returns at most 5 paths", () => {
      // Build a graph with many parallel paths
      const persons: NetworkPerson[] = [makePerson("a", "Alice"), makePerson("b", "Bob")];
      const edges: RelationshipEdge[] = [];

      for (let i = 0; i < 10; i++) {
        const mid = `m${i}`;
        persons.push(makePerson(mid, `Mid${i}`));
        edges.push(makeEdge("a", mid, 0.5 + i * 0.05));
        edges.push(makeEdge(mid, "b", 0.5 + i * 0.03));
      }

      const graph = buildGraph(persons, edges);
      const paths = findIntroPaths(graph, "a", "b");
      expect(paths.length).toBeLessThanOrEqual(5);
    });

    it("tracks minimum strength correctly along the path", () => {
      // Path: a(0.9)->m(0.3)->b : weakest = 0.3
      const graph = buildGraph(
        [makePerson("a", "A"), makePerson("m", "M"), makePerson("b", "B")],
        [makeEdge("a", "m", 0.9), makeEdge("m", "b", 0.3)],
      );
      const paths = findIntroPaths(graph, "a", "b");
      expect(paths[0].minStrength).toBe(0.3);
    });
  });

  describe("company-based targeting", () => {
    it("resolves target by company name when not a person ID", () => {
      const graph = buildGraph(
        [
          makePerson("a", "Alice"),
          makePerson("b", "Bob", "Google"),
          makePerson("c", "Carol", "Google"),
        ],
        [makeEdge("a", "b", 0.8), makeEdge("a", "c", 0.6)],
      );
      const paths = findIntroPaths(graph, "a", "Google");
      expect(paths.length).toBeGreaterThanOrEqual(2);
    });

    it("prefers person ID over company name when both match", () => {
      // "b" is both a person ID and not a company name
      const graph = buildGraph(
        [makePerson("a", "Alice"), makePerson("b", "Bob", "SomeCo")],
        [makeEdge("a", "b", 0.8)],
      );
      const paths = findIntroPaths(graph, "a", "b");
      expect(paths).toHaveLength(1);
      expect(paths[0].steps[1].personId).toBe("b");
    });

    it("returns empty for company with no employees in graph", () => {
      const graph = buildGraph(
        [makePerson("a", "Alice"), makePerson("b", "Bob", "Google")],
        [makeEdge("a", "b", 0.8)],
      );
      const paths = findIntroPaths(graph, "a", "Nonexistent Corp");
      expect(paths).toEqual([]);
    });
  });

  describe("cycle prevention", () => {
    it("does not revisit nodes (no cycles)", () => {
      // Triangle graph: a-b-c-a
      const graph = buildGraph(
        [makePerson("a", "A"), makePerson("b", "B"), makePerson("c", "C")],
        [makeEdge("a", "b", 0.8), makeEdge("b", "c", 0.7), makeEdge("c", "a", 0.6)],
      );
      const paths = findIntroPaths(graph, "a", "c");
      // Should find a->b->c, not a->b->a->...
      for (const path of paths) {
        const ids = path.steps.map((s) => s.personId);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
      }
    });
  });
});

// ── generateApproachSuggestion ───────────────────────────────────────

describe("generateApproachSuggestion", () => {
  const persons = new Map<string, NetworkPerson>([
    ["a", makePerson("a", "Alice")],
    ["m", makePerson("m", "Mallory")],
    ["b", makePerson("b", "Bob")],
  ]);

  it("returns direct connection message for 2-step path", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "b" }],
      minStrength: 0.9,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("Reach out directly");
    expect(suggestion).toContain("Bob");
  });

  it("suggests asking intermediary for 3-step path", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "m" }, { personId: "b" }],
      minStrength: 0.7,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("Ask Mallory");
    expect(suggestion).toContain("Bob");
    expect(suggestion).toContain("2-hop");
  });

  it("labels strong paths (>= 0.7)", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "m" }, { personId: "b" }],
      minStrength: 0.8,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("strong");
  });

  it("labels moderate paths (0.4-0.7)", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "m" }, { personId: "b" }],
      minStrength: 0.5,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("moderate");
  });

  it("labels tentative paths (< 0.4)", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "m" }, { personId: "b" }],
      minStrength: 0.2,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("tentative");
  });

  it("labels path as strong at minStrength 0.7 (inclusive)", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "m" }, { personId: "b" }],
      minStrength: 0.7,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("strong");
  });

  it("labels path as moderate at minStrength 0.4 (inclusive)", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "m" }, { personId: "b" }],
      minStrength: 0.4,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("moderate");
  });

  it("handles single-step path gracefully", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }],
      minStrength: 1.0,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("Direct connection");
  });

  it("falls back to person ID when person not in map", () => {
    const path: IntroPath = {
      steps: [{ personId: "a" }, { personId: "unknown" }],
      minStrength: 0.5,
      suggestedApproach: "",
    };
    const suggestion = generateApproachSuggestion(path, persons);
    expect(suggestion).toContain("unknown");
  });
});
