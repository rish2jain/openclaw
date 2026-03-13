import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EntityGraph } from "./entity-graph.js";

describe("EntityGraph", () => {
  let dbPath: string;
  let graph: EntityGraph;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "entity-graph-test-"));
    dbPath = path.join(tmpDir, "test.sqlite");
    graph = new EntityGraph({ dbPath });
  });

  afterEach(() => {
    graph.close();
  });

  it("upsertEntity creates new entities", () => {
    const entity = graph.upsertEntity({ name: "Alice", type: "person" });
    expect(entity.name).toBe("Alice");
    expect(entity.type).toBe("person");
  });

  it("upsertEntity updates existing entities", () => {
    graph.upsertEntity({ name: "Project X", type: "project" });
    const updated = graph.upsertEntity({
      name: "Project X",
      type: "project",
      properties: { status: "active" },
    });
    expect(updated.properties.status).toBe("active");
  });

  it("relateByName creates entities and relationship", () => {
    const result = graph.relateByName({
      sourceName: "Alice",
      sourceType: "person",
      targetName: "OpenClaw",
      targetType: "project",
      label: "works_on",
      weight: 0.9,
    });

    expect(result.source.name).toBe("Alice");
    expect(result.target.name).toBe("OpenClaw");
    expect(result.relationship.label).toBe("works_on");
    expect(result.relationship.weight).toBe(0.9);
  });

  it("getRelationships returns direct connections", () => {
    const alice = graph.upsertEntity({ name: "Alice", type: "person" });
    const project = graph.upsertEntity({ name: "Project", type: "project" });
    graph.relate({ sourceId: alice.id, targetId: project.id, label: "works_on" });

    const rels = graph.getRelationships(alice.id);
    expect(rels).toHaveLength(1);
    expect(rels[0].target.name).toBe("Project");
  });

  it("traverse finds reachable nodes", () => {
    const a = graph.upsertEntity({ name: "A", type: "concept" });
    const b = graph.upsertEntity({ name: "B", type: "concept" });
    const c = graph.upsertEntity({ name: "C", type: "concept" });
    graph.relate({ sourceId: a.id, targetId: b.id, label: "links_to" });
    graph.relate({ sourceId: b.id, targetId: c.id, label: "links_to" });

    const reachable = graph.traverse(a.id, { maxDepth: 3 });
    expect(reachable).toHaveLength(2);
    const names = new Set(reachable.map((n) => n.name));
    expect(names.has("B")).toBe(true);
    expect(names.has("C")).toBe(true);
  });

  it("findPath finds shortest path", () => {
    const a = graph.upsertEntity({ name: "A", type: "concept" });
    const b = graph.upsertEntity({ name: "B", type: "concept" });
    const c = graph.upsertEntity({ name: "C", type: "concept" });
    graph.relate({ sourceId: a.id, targetId: b.id, label: "connects" });
    graph.relate({ sourceId: b.id, targetId: c.id, label: "connects" });

    const graphPath = graph.findPath(a.id, c.id);
    expect(graphPath).not.toBeNull();
    expect(graphPath!.nodes).toHaveLength(3);
    expect(graphPath!.edges).toHaveLength(2);
    expect(graphPath!.nodes[0].name).toBe("A");
    expect(graphPath!.nodes[2].name).toBe("C");
  });

  it("findPath returns null when no path exists", () => {
    const a = graph.upsertEntity({ name: "Isolated1", type: "concept" });
    const b = graph.upsertEntity({ name: "Isolated2", type: "concept" });
    const result = graph.findPath(a.id, b.id);
    expect(result).toBeNull();
  });

  it("findConnectedByType filters by entity type", () => {
    const project = graph.upsertEntity({ name: "Project", type: "project" });
    const alice = graph.upsertEntity({ name: "Alice", type: "person" });
    const bob = graph.upsertEntity({ name: "Bob", type: "person" });
    const topic = graph.upsertEntity({ name: "Memory", type: "topic" });
    graph.relate({ sourceId: alice.id, targetId: project.id, label: "works_on" });
    graph.relate({ sourceId: bob.id, targetId: project.id, label: "works_on" });
    graph.relate({ sourceId: topic.id, targetId: project.id, label: "related_to" });

    const people = graph.findConnectedByType(project.id, "person");
    expect(people).toHaveLength(2);
    expect(people.every((n) => n.type === "person")).toBe(true);
  });

  it("ingestExtraction creates entities and relationships", () => {
    const result = graph.ingestExtraction({
      entities: [
        { name: "Alice", type: "person" },
        { name: "Memory System", type: "project" },
      ],
      relationships: [
        { sourceName: "Alice", targetName: "Memory System", label: "works_on", weight: 0.8 },
      ],
    });

    expect(result.entities).toHaveLength(2);
    expect(result.relationships).toHaveLength(1);
    expect(graph.stats().nodes).toBe(2);
    expect(graph.stats().edges).toBe(1);
  });

  it("searchEntities finds by name", () => {
    graph.upsertEntity({ name: "TypeScript Migration", type: "project" });
    graph.upsertEntity({ name: "Python Backend", type: "project" });

    const results = graph.searchEntities("TypeScript");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].entity.name).toBe("TypeScript Migration");
  });
});
