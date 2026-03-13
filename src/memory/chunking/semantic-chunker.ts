/**
 * Semantic Chunker — splits text into chunks based on semantic similarity
 * using embeddings.
 *
 * The algorithm:
 * 1. Split text into sentences/paragraphs (initial segments)
 * 2. Compute embeddings for each segment
 * 3. Find semantic breakpoints where consecutive segments diverge
 *    (cosine similarity drops below threshold)
 * 4. Group segments between breakpoints into chunks
 *
 * Falls back to the existing fixed-size chunker when embeddings are
 * not available.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { cosineSimilarity, hashText } from "../internal.js";

const log = createSubsystemLogger("memory:chunking");

export type SemanticChunk = {
  text: string;
  /** Full text with heading context for embedding. */
  contextualText: string;
  startLine: number;
  endLine: number;
  hash: string;
  /** The heading context inherited from a heading-chunker pass. */
  headingContext?: string;
};

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export type SemanticChunkerOptions = {
  /**
   * Similarity threshold below which a break is inserted.
   * Lower values = larger chunks; higher = more granular chunks.
   * Default: 0.5
   */
  breakpointThreshold?: number;
  /** Maximum characters per chunk (hard limit). Default: 3000 */
  maxChunkChars?: number;
  /** Minimum characters per chunk (merge threshold). Default: 100 */
  minChunkChars?: number;
  /** Optional heading context to prepend to each chunk. */
  headingContext?: string;
};

type Segment = {
  text: string;
  startLine: number;
  endLine: number;
};

/**
 * Split text into segments on paragraph boundaries.
 * Each segment is a candidate unit for semantic breakpoint detection.
 */
function splitIntoSegments(content: string): Segment[] {
  const lines = content.split("\n");
  const segments: Segment[] = [];
  let current: string[] = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    // Paragraph break: empty line following non-empty content
    if (line.trim() === "" && current.length > 0) {
      segments.push({
        text: current.join("\n").trim(),
        startLine,
        endLine: lineNo - 1,
      });
      current = [];
      startLine = lineNo + 1;
      continue;
    }

    if (line.trim()) {
      if (current.length === 0) {
        startLine = lineNo;
      }
      current.push(line);
    }
  }

  // Flush remaining
  if (current.length > 0) {
    segments.push({
      text: current.join("\n").trim(),
      startLine,
      endLine: lines.length,
    });
  }

  return segments.filter((s) => s.text.length > 0);
}

/**
 * Chunk text semantically using embeddings to find natural breakpoints.
 *
 * When an embedFn is provided, computes embeddings for each paragraph-level
 * segment and inserts chunk boundaries where semantic similarity drops.
 *
 * When no embedFn is available, falls back to paragraph-boundary chunking
 * with size limits.
 */
export async function chunkSemantically(
  content: string,
  embedFn: EmbedFn | null,
  opts?: SemanticChunkerOptions,
): Promise<SemanticChunk[]> {
  const threshold = opts?.breakpointThreshold ?? 0.5;
  const maxChars = opts?.maxChunkChars ?? 3000;
  const minChars = opts?.minChunkChars ?? 100;
  const headingContext = opts?.headingContext ?? "";

  const segments = splitIntoSegments(content);
  if (segments.length === 0) {
    return [];
  }

  // Single segment: return as-is
  if (segments.length === 1) {
    const seg = segments[0];
    const contextual = headingContext ? `${headingContext}\n\n${seg.text}` : seg.text;
    return [
      {
        text: seg.text,
        contextualText: contextual,
        startLine: seg.startLine,
        endLine: seg.endLine,
        hash: hashText(contextual),
        headingContext: headingContext || undefined,
      },
    ];
  }

  // If no embedding function, fall back to paragraph-boundary chunking
  if (!embedFn) {
    return chunkByParagraphSize(segments, maxChars, minChars, headingContext);
  }

  // Compute embeddings for all segments
  let embeddings: number[][];
  try {
    embeddings = await embedFn(segments.map((s) => s.text));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`embedding failed for semantic chunking, using paragraph fallback: ${message}`);
    return chunkByParagraphSize(segments, maxChars, minChars, headingContext);
  }

  if (embeddings.length !== segments.length) {
    log.warn("embedding count mismatch, using paragraph fallback");
    return chunkByParagraphSize(segments, maxChars, minChars, headingContext);
  }

  // Find semantic breakpoints
  const breakpoints = new Set<number>();
  for (let i = 1; i < embeddings.length; i++) {
    const prev = embeddings[i - 1];
    const curr = embeddings[i];
    if (!prev || !curr) {
      continue;
    }
    const similarity = cosineSimilarity(prev, curr);
    if (similarity < threshold) {
      breakpoints.add(i);
    }
  }

  // Group segments between breakpoints
  return groupSegments(segments, breakpoints, maxChars, minChars, headingContext);
}

function groupSegments(
  segments: Segment[],
  breakpoints: Set<number>,
  maxChars: number,
  minChars: number,
  headingContext: string,
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  let groupSegments: Segment[] = [];
  let groupChars = 0;

  const flushGroup = () => {
    if (groupSegments.length === 0) {
      return;
    }
    const text = groupSegments.map((s) => s.text).join("\n\n");
    const contextual = headingContext ? `${headingContext}\n\n${text}` : text;
    const first = groupSegments[0];
    const last = groupSegments[groupSegments.length - 1];

    chunks.push({
      text,
      contextualText: contextual,
      startLine: first.startLine,
      endLine: last.endLine,
      hash: hashText(contextual),
      headingContext: headingContext || undefined,
    });

    groupSegments = [];
    groupChars = 0;
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Force-split if the group exceeds max chars
    if (groupChars + seg.text.length > maxChars && groupSegments.length > 0) {
      flushGroup();
    }

    // Semantic breakpoint
    if (breakpoints.has(i) && groupSegments.length > 0) {
      flushGroup();
    }

    groupSegments.push(seg);
    groupChars += seg.text.length + 2; // +2 for paragraph separator
  }

  flushGroup();

  // Merge tiny trailing chunks into the previous one
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    if (last.text.length < minChars) {
      const prev = chunks[chunks.length - 2];
      prev.text = `${prev.text}\n\n${last.text}`;
      prev.contextualText = headingContext ? `${headingContext}\n\n${prev.text}` : prev.text;
      prev.endLine = last.endLine;
      prev.hash = hashText(prev.contextualText);
      chunks.pop();
    }
  }

  return chunks;
}

function chunkByParagraphSize(
  segments: Segment[],
  maxChars: number,
  minChars: number,
  headingContext: string,
): SemanticChunk[] {
  return groupSegments(segments, new Set(), maxChars, minChars, headingContext);
}
