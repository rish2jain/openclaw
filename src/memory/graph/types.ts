/**
 * Types for the graph-based entity memory system.
 *
 * Stores entities (people, topics, channels, projects) and their
 * relationships as a directed labeled graph.
 */

export type EntityType =
  | "person"
  | "topic"
  | "project"
  | "channel"
  | "organization"
  | "tool"
  | "concept"
  | "location"
  | "event"
  | "custom";

export type EntityNode = {
  id: string;
  name: string;
  type: EntityType;
  /** Freeform properties bag for entity-specific data. */
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  /** Optional agent that created this entity. */
  agentId?: string;
};

export type EntityRelationship = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  /** Optional weight/strength of the relationship (0-1). */
  weight: number;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type EntitySearchResult = {
  entity: EntityNode;
  score: number;
};

export type RelationshipQueryResult = {
  source: EntityNode;
  relationship: EntityRelationship;
  target: EntityNode;
};

export type GraphPathResult = {
  /** Ordered list of nodes in the path. */
  nodes: EntityNode[];
  /** Edges connecting consecutive nodes. */
  edges: EntityRelationship[];
};

/**
 * Extracted entity reference from conversation text.
 * Produced by the entity extractor before resolution against the graph.
 */
export type ExtractedEntity = {
  name: string;
  type: EntityType;
  properties?: Record<string, unknown>;
};

/**
 * Extracted relationship reference from conversation text.
 * References entities by name (not id) since they may not exist yet.
 */
export type ExtractedRelationship = {
  sourceName: string;
  targetName: string;
  label: string;
  weight?: number;
  properties?: Record<string, unknown>;
};

export type ExtractionResult = {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
};
