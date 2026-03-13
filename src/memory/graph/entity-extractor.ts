/**
 * Entity Extractor — extracts entities and relationships from conversation
 * text using the LLM.
 *
 * Falls back to a simple regex-based extractor when no LLM is available,
 * picking up @mentions, #channels, and common patterns.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type {
  EntityType,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionResult,
} from "./types.js";

const log = createSubsystemLogger("memory:graph:extractor");

/**
 * LLM function interface for entity extraction.
 * The caller provides the LLM integration; we provide the prompt.
 */
export type LlmExtractFn = (params: {
  systemPrompt: string;
  userMessage: string;
}) => Promise<string>;

const EXTRACTION_SYSTEM_PROMPT = `You are an entity extraction system. Given conversation text, extract:
1. Entities: people, projects, topics, channels, organizations, tools, concepts, locations, events
2. Relationships between entities

Respond with valid JSON only, no explanation. Use this exact schema:
{
  "entities": [
    { "name": "string", "type": "person|project|topic|channel|organization|tool|concept|location|event", "properties": {} }
  ],
  "relationships": [
    { "sourceName": "string", "targetName": "string", "label": "string", "weight": 0.0-1.0 }
  ]
}

Rules:
- Entity names should be canonical (e.g., "John Smith" not "John")
- Relationship labels should be verb phrases (e.g., "works_on", "created", "belongs_to", "discusses")
- Weight represents confidence/strength (1.0 = certain, 0.5 = likely)
- Only extract entities that are clearly referenced, not implied
- Deduplicate entities by name`;

/**
 * Extract entities and relationships using an LLM.
 */
export async function extractEntitiesWithLlm(
  text: string,
  llmFn: LlmExtractFn,
): Promise<ExtractionResult> {
  if (!text.trim()) {
    return { entities: [], relationships: [] };
  }

  try {
    const response = await llmFn({
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userMessage: text,
    });

    return parseExtractionResponse(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`LLM entity extraction failed, falling back to regex: ${message}`);
    return extractEntitiesWithRegex(text);
  }
}

/**
 * Simple regex-based entity extractor as a fallback.
 * Picks up @mentions, #channels, URLs, and capitalized proper nouns.
 */
export function extractEntitiesWithRegex(text: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // @mentions -> person entities
  const mentionPattern = /@([\w.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = mentionPattern.exec(text)) !== null) {
    const name = match[1];
    if (name && !seen.has(`person:${name}`)) {
      seen.add(`person:${name}`);
      entities.push({ name, type: "person" });
    }
  }

  // #channels -> channel entities
  const channelPattern = /#([\w-]+)/g;
  while ((match = channelPattern.exec(text)) !== null) {
    const name = match[1];
    if (name && !seen.has(`channel:${name}`)) {
      seen.add(`channel:${name}`);
      entities.push({ name, type: "channel" });
    }
  }

  // Quoted project/tool names -> topic entities
  const quotedPattern = /"([A-Z][\w\s-]{1,30})"/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    const name = match[1]?.trim();
    if (name && !seen.has(`topic:${name}`)) {
      seen.add(`topic:${name}`);
      entities.push({ name, type: "topic" });
    }
  }

  return { entities, relationships: [] };
}

/**
 * Parse the LLM response into a typed ExtractionResult.
 * Tolerant of minor formatting issues.
 */
function parseExtractionResponse(response: string): ExtractionResult {
  const cleaned = response.trim();

  // Try to extract JSON from the response (may be wrapped in markdown code blocks)
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, cleaned];
  const jsonStr = jsonMatch[1]?.trim() ?? cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    log.debug("failed to parse LLM extraction response as JSON");
    return { entities: [], relationships: [] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { entities: [], relationships: [] };
  }

  const result = parsed as Record<string, unknown>;
  const entities = validateEntities(result.entities);
  const relationships = validateRelationships(result.relationships);

  return { entities, relationships };
}

const VALID_ENTITY_TYPES = new Set<EntityType>([
  "person",
  "topic",
  "project",
  "channel",
  "organization",
  "tool",
  "concept",
  "location",
  "event",
  "custom",
]);

function validateEntities(raw: unknown): ExtractedEntity[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const results: ExtractedEntity[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const type = typeof entry.type === "string" ? entry.type.trim() : "";
    if (!name || !VALID_ENTITY_TYPES.has(type as EntityType)) {
      continue;
    }
    const properties =
      entry.properties && typeof entry.properties === "object"
        ? (entry.properties as Record<string, unknown>)
        : undefined;
    results.push({ name, type: type as EntityType, properties });
  }
  return results;
}

function validateRelationships(raw: unknown): ExtractedRelationship[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const results: ExtractedRelationship[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    const sourceName = typeof entry.sourceName === "string" ? entry.sourceName.trim() : "";
    const targetName = typeof entry.targetName === "string" ? entry.targetName.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!sourceName || !targetName || !label) {
      continue;
    }
    const weight =
      typeof entry.weight === "number" && entry.weight >= 0 && entry.weight <= 1
        ? entry.weight
        : 1.0;
    const properties =
      entry.properties && typeof entry.properties === "object"
        ? (entry.properties as Record<string, unknown>)
        : undefined;
    results.push({ sourceName, targetName, label, weight, properties });
  }
  return results;
}
