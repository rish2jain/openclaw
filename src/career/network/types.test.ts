import { describe, it, expect } from "vitest";
import { createNetworkGraph, type NetworkPerson, type RelationshipEdge } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makePerson(id: string, company?: string): NetworkPerson {
  return { id, name: `Person ${id}`, company, tags: [], addedAt: Date.now() };
}

function makeEdge(fromId: string, toId: string, strength = 0.5): RelationshipEdge {
  return {
    fromId,
    toId,
    type: "knows",
    connectionStrength: strength,
    sharedHistory: [],
    manualBoost: 0,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("createNetworkGraph", () => {
  describe("addPerson / getPersons", () => {
    it("starts empty", () => {
      const graph = createNetworkGraph();
      expect(graph.persons.size).toBe(0);
    });

    it("adds and retrieves persons", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      expect(graph.persons.size).toBe(2);
      expect(graph.persons.get("a")?.name).toBe("Person a");
    });

    it("exposes persons as the live internal Map", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      const ref = graph.persons;
      graph.addPerson(makePerson("b"));
      expect(ref.size).toBe(2); // same reference
    });
  });

  describe("removePerson", () => {
    it("removes person from graph", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      graph.removePerson("a");
      expect(graph.persons.size).toBe(1);
      expect(graph.persons.has("a")).toBe(false);
    });

    it("removes edges involving the person", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      graph.addPerson(makePerson("c"));
      graph.addEdge(makeEdge("a", "b"));
      graph.addEdge(makeEdge("b", "c"));

      graph.removePerson("b");
      const edges = [...graph.edges];
      expect(edges).toHaveLength(0);
    });

    it("updates adjacency for remaining neighbors", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      graph.addEdge(makeEdge("a", "b"));

      graph.removePerson("b");
      expect(graph.getNeighbors("a")).toHaveLength(0);
    });

    it("does nothing for non-existent person", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.removePerson("nonexistent"); // Should not throw
      expect(graph.persons.size).toBe(1);
    });
  });

  describe("addEdge / getEdges", () => {
    it("adds and retrieves edges", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      graph.addEdge(makeEdge("a", "b"));

      const edges = [...graph.edges];
      expect(edges).toHaveLength(1);
      expect(edges[0].fromId).toBe("a");
      expect(edges[0].toId).toBe("b");
    });

    it("getEdges returns a copy", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      graph.addEdge(makeEdge("a", "b"));

      const snapshot = [...graph.edges];
      graph.addEdge(makeEdge("a", "b")); // Another edge
      expect(snapshot).toHaveLength(1); // snapshot unchanged
    });
  });

  describe("getNeighbors", () => {
    it("returns empty for person with no edges", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      expect(graph.getNeighbors("a")).toEqual([]);
    });

    it("returns empty for unknown person", () => {
      const graph = createNetworkGraph();
      expect(graph.getNeighbors("unknown")).toEqual([]);
    });

    it("returns bidirectional neighbors from a single edge", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      graph.addEdge(makeEdge("a", "b"));

      const neighborsA = graph.getNeighbors("a");
      const neighborsB = graph.getNeighbors("b");
      expect(neighborsA).toHaveLength(1);
      expect(neighborsA[0].id).toBe("b");
      expect(neighborsB).toHaveLength(1);
      expect(neighborsB[0].id).toBe("a");
    });

    it("returns multiple neighbors", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a"));
      graph.addPerson(makePerson("b"));
      graph.addPerson(makePerson("c"));
      graph.addEdge(makeEdge("a", "b"));
      graph.addEdge(makeEdge("a", "c"));

      const neighbors = graph.getNeighbors("a");
      expect(neighbors).toHaveLength(2);
    });
  });

  describe("getPersonsByCompany", () => {
    it("returns persons matching company name (case-insensitive)", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a", "Google"));
      graph.addPerson(makePerson("b", "google"));
      graph.addPerson(makePerson("c", "Meta"));

      const results = graph.getPersonsByCompany("google");
      expect(results).toHaveLength(2);
    });

    it("returns empty when no persons match", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a", "Google"));
      expect(graph.getPersonsByCompany("Apple")).toEqual([]);
    });

    it("excludes persons without company set", () => {
      const graph = createNetworkGraph();
      graph.addPerson(makePerson("a")); // no company
      expect(graph.getPersonsByCompany("Google")).toEqual([]);
    });
  });
});
