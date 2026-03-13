/**
 * Entity Graph — high-level API for managing entities and relationships.
 *
 * Wraps GraphStore and GraphQuery to provide a convenient interface
 * for entity CRUD, relationship management, and graph traversal.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  findConnectedByType,
  findPath,
  queryRelationships,
  traverseGraph,
  type TraversalOptions,
} from "./graph-query.js";
import { GraphStore } from "./graph-store.js";
import type {
  EntityNode,
  EntityRelationship,
  EntityType,
  ExtractionResult,
  GraphPathResult,
  RelationshipQueryResult,
} from "./types.js";

const log = createSubsystemLogger("memory:graph");

export class EntityGraph {
  private readonly store: GraphStore;

  constructor(params: { dbPath: string }) {
    this.store = new GraphStore({ dbPath: params.dbPath });
  }

  // --- Entity operations ---

  /** Add or update an entity. If an entity with the same name+type exists, update it. */
  upsertEntity(params: {
    name: string;
    type: EntityType;
    properties?: Record<string, unknown>;
    agentId?: string;
  }): EntityNode {
    const existing = this.store.findNodeByName(params.name, params.type);
    if (existing) {
      const updated = this.store.updateNode(existing.id, {
        properties: params.properties,
      });
      return updated ?? existing;
    }
    return this.store.addNode(params);
  }

  /** Find an entity by name, optionally filtering by type. */
  findEntity(name: string, type?: EntityType): EntityNode | null {
    return this.store.findNodeByName(name, type);
  }

  /** Get an entity by ID. */
  getEntity(id: string): EntityNode | null {
    return this.store.getNode(id);
  }

  /** Search entities by name. */
  searchEntities(
    query: string,
    opts?: { type?: EntityType; limit?: number },
  ): Array<{ entity: EntityNode; score: number }> {
    return this.store.searchNodes(query, opts);
  }

  /** Delete an entity and all its relationships. */
  deleteEntity(id: string): boolean {
    return this.store.deleteNode(id);
  }

  // --- Relationship operations ---

  /** Add or update a relationship between two entities. */
  relate(params: {
    sourceId: string;
    targetId: string;
    label: string;
    weight?: number;
    properties?: Record<string, unknown>;
  }): EntityRelationship {
    return this.store.addEdge(params);
  }

  /**
   * Create a relationship using entity names instead of IDs.
   * Entities are created if they don't exist.
   */
  relateByName(params: {
    sourceName: string;
    sourceType: EntityType;
    targetName: string;
    targetType: EntityType;
    label: string;
    weight?: number;
    agentId?: string;
  }): { source: EntityNode; target: EntityNode; relationship: EntityRelationship } {
    const source = this.upsertEntity({
      name: params.sourceName,
      type: params.sourceType,
      agentId: params.agentId,
    });
    const target = this.upsertEntity({
      name: params.targetName,
      type: params.targetType,
      agentId: params.agentId,
    });
    const relationship = this.relate({
      sourceId: source.id,
      targetId: target.id,
      label: params.label,
      weight: params.weight,
    });
    return { source, target, relationship };
  }

  /** Remove a specific relationship. */
  removeRelationship(edgeId: string): boolean {
    return this.store.deleteEdge(edgeId);
  }

  // --- Query operations ---

  /** Get all relationships for a node. */
  getRelationships(
    nodeId: string,
    opts?: { label?: string; direction?: "out" | "in" | "both"; limit?: number },
  ): RelationshipQueryResult[] {
    return queryRelationships(this.store, nodeId, opts);
  }

  /** Get direct neighbors of a node. */
  getNeighbors(
    nodeId: string,
    opts?: { label?: string; direction?: "out" | "in" | "both" },
  ): EntityNode[] {
    return this.store.getNeighbors(nodeId, opts);
  }

  /** Traverse the graph from a starting node. */
  traverse(startNodeId: string, opts?: TraversalOptions): EntityNode[] {
    return traverseGraph(this.store, startNodeId, opts);
  }

  /** Find shortest path between two entities. */
  findPath(fromId: string, toId: string, opts?: { maxDepth?: number }): GraphPathResult | null {
    return findPath(this.store, fromId, toId, opts);
  }

  /** Find all entities of a specific type connected to a node. */
  findConnectedByType(
    startNodeId: string,
    targetType: EntityType,
    opts?: { maxDepth?: number; maxResults?: number },
  ): EntityNode[] {
    return findConnectedByType(this.store, startNodeId, targetType, opts);
  }

  // --- Bulk operations ---

  /**
   * Ingest an extraction result, upserting all entities and relationships.
   * Typically called after the entity extractor processes conversation text.
   */
  ingestExtraction(
    extraction: ExtractionResult,
    agentId?: string,
  ): {
    entities: EntityNode[];
    relationships: EntityRelationship[];
  } {
    const entityMap = new Map<string, EntityNode>();
    const entities: EntityNode[] = [];
    const relationships: EntityRelationship[] = [];

    // Upsert all entities first
    for (const extracted of extraction.entities) {
      const node = this.upsertEntity({
        name: extracted.name,
        type: extracted.type,
        properties: extracted.properties,
        agentId,
      });
      entityMap.set(extracted.name, node);
      entities.push(node);
    }

    // Then create relationships
    for (const rel of extraction.relationships) {
      const source = entityMap.get(rel.sourceName) ?? this.findEntity(rel.sourceName);
      const target = entityMap.get(rel.targetName) ?? this.findEntity(rel.targetName);
      if (!source || !target) {
        log.debug(
          `skipping relationship "${rel.sourceName}" -[${rel.label}]-> "${rel.targetName}": entity not found`,
        );
        continue;
      }
      const edge = this.relate({
        sourceId: source.id,
        targetId: target.id,
        label: rel.label,
        weight: rel.weight,
        properties: rel.properties,
      });
      relationships.push(edge);
    }

    log.debug(`ingested ${entities.length} entities and ${relationships.length} relationships`);
    return { entities, relationships };
  }

  /** Get graph statistics. */
  stats(): { nodes: number; edges: number; ftsAvailable: boolean } {
    return this.store.stats();
  }

  close(): void {
    this.store.close();
  }
}
