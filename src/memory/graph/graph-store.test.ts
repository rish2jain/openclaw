import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GraphStore } from "./graph-store.js";

describe("GraphStore", () => {
  let dbPath: string;
  let store: GraphStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "graph-store-test-"));
    dbPath = path.join(tmpDir, "test.sqlite");
    store = new GraphStore({ dbPath });
  });

  afterEach(() => {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("node operations", () => {
    it("addNode creates a node", () => {
      const node = store.addNode({ name: "Alice", type: "person" });
      expect(node.id).toBeTruthy();
      expect(node.name).toBe("Alice");
      expect(node.type).toBe("person");
    });

    it("getNode retrieves by id", () => {
      const created = store.addNode({ name: "Bob", type: "person" });
      const retrieved = store.getNode(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("Bob");
    });

    it("findNodeByName finds by name", () => {
      store.addNode({ name: "OpenClaw", type: "project" });
      const found = store.findNodeByName("OpenClaw");
      expect(found).not.toBeNull();
      expect(found!.type).toBe("project");
    });

    it("findNodeByName filters by type", () => {
      store.addNode({ name: "Test", type: "project" });
      store.addNode({ name: "Test", type: "topic" });
      const project = store.findNodeByName("Test", "project");
      expect(project!.type).toBe("project");
    });

    it("updateNode updates properties", () => {
      const node = store.addNode({ name: "Alice", type: "person" });
      const updated = store.updateNode(node.id, {
        properties: { role: "engineer" },
      });
      expect(updated!.properties.role).toBe("engineer");
    });

    it("deleteNode removes node", () => {
      const node = store.addNode({ name: "ToDelete", type: "concept" });
      expect(store.deleteNode(node.id)).toBe(true);
      expect(store.getNode(node.id)).toBeNull();
    });

    it("searchNodes finds by name query", () => {
      store.addNode({ name: "TypeScript Migration", type: "project" });
      store.addNode({ name: "Python Backend", type: "project" });
      const results = store.searchNodes("TypeScript");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].entity.name).toBe("TypeScript Migration");
    });
  });

  describe("edge operations", () => {
    it("addEdge creates a relationship", () => {
      const alice = store.addNode({ name: "Alice", type: "person" });
      const project = store.addNode({ name: "OpenClaw", type: "project" });
      const edge = store.addEdge({
        sourceId: alice.id,
        targetId: project.id,
        label: "works_on",
      });
      expect(edge.label).toBe("works_on");
      expect(edge.sourceId).toBe(alice.id);
      expect(edge.targetId).toBe(project.id);
    });

    it("addEdge upserts on same source+target+label", () => {
      const a = store.addNode({ name: "A", type: "concept" });
      const b = store.addNode({ name: "B", type: "concept" });
      store.addEdge({ sourceId: a.id, targetId: b.id, label: "related_to", weight: 0.5 });
      const updated = store.addEdge({
        sourceId: a.id,
        targetId: b.id,
        label: "related_to",
        weight: 0.9,
      });
      expect(updated.weight).toBe(0.9);

      // Only one edge should exist
      const edges = store.getOutgoingEdges(a.id);
      expect(edges).toHaveLength(1);
    });

    it("getOutgoingEdges returns edges from a node", () => {
      const a = store.addNode({ name: "A", type: "person" });
      const b = store.addNode({ name: "B", type: "project" });
      const c = store.addNode({ name: "C", type: "project" });
      store.addEdge({ sourceId: a.id, targetId: b.id, label: "works_on" });
      store.addEdge({ sourceId: a.id, targetId: c.id, label: "manages" });

      const edges = store.getOutgoingEdges(a.id);
      expect(edges).toHaveLength(2);
    });

    it("getIncomingEdges returns edges to a node", () => {
      const a = store.addNode({ name: "A", type: "person" });
      const b = store.addNode({ name: "B", type: "person" });
      const project = store.addNode({ name: "P", type: "project" });
      store.addEdge({ sourceId: a.id, targetId: project.id, label: "works_on" });
      store.addEdge({ sourceId: b.id, targetId: project.id, label: "works_on" });

      const edges = store.getIncomingEdges(project.id);
      expect(edges).toHaveLength(2);
    });

    it("deleteNode cascades to edges", () => {
      const a = store.addNode({ name: "A", type: "person" });
      const b = store.addNode({ name: "B", type: "project" });
      store.addEdge({ sourceId: a.id, targetId: b.id, label: "works_on" });

      store.deleteNode(a.id);
      const edges = store.getIncomingEdges(b.id);
      expect(edges).toHaveLength(0);
    });
  });

  describe("neighbor queries", () => {
    it("getNeighbors returns connected nodes", () => {
      const center = store.addNode({ name: "Center", type: "concept" });
      const n1 = store.addNode({ name: "N1", type: "concept" });
      const n2 = store.addNode({ name: "N2", type: "concept" });
      store.addEdge({ sourceId: center.id, targetId: n1.id, label: "related" });
      store.addEdge({ sourceId: n2.id, targetId: center.id, label: "related" });

      const neighbors = store.getNeighbors(center.id);
      expect(neighbors).toHaveLength(2);
      const names = new Set(neighbors.map((n) => n.name));
      expect(names.has("N1")).toBe(true);
      expect(names.has("N2")).toBe(true);
    });

    it("getNeighbors filters by direction", () => {
      const a = store.addNode({ name: "A", type: "person" });
      const b = store.addNode({ name: "B", type: "project" });
      store.addEdge({ sourceId: a.id, targetId: b.id, label: "works_on" });

      const outNeighbors = store.getNeighbors(a.id, { direction: "out" });
      expect(outNeighbors).toHaveLength(1);
      expect(outNeighbors[0].name).toBe("B");

      const inNeighbors = store.getNeighbors(a.id, { direction: "in" });
      expect(inNeighbors).toHaveLength(0);
    });
  });

  it("stats returns counts", () => {
    store.addNode({ name: "A", type: "person" });
    store.addNode({ name: "B", type: "project" });
    const stats = store.stats();
    expect(stats.nodes).toBe(2);
    expect(stats.edges).toBe(0);
  });
});
