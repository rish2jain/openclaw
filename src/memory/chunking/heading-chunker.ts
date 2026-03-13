/**
 * Heading-aware chunker for Markdown documents.
 *
 * Splits documents by heading boundaries while preserving the heading
 * hierarchy as context prefix on each chunk.  This means a chunk under
 * `## API > ### Authentication` carries that breadcrumb so retrieval
 * results are self-contained.
 */

import { hashText } from "../internal.js";

export type HeadingChunk = {
  /** Heading breadcrumb path (e.g., "API > Authentication"). */
  headingPath: string;
  /** The heading level that starts this chunk (1-6, or 0 for pre-heading content). */
  headingLevel: number;
  /** Raw text content of the chunk (excluding the heading line itself). */
  text: string;
  /** Full text including heading context prefix for embedding. */
  contextualText: string;
  startLine: number;
  endLine: number;
  hash: string;
};

type HeadingFrame = {
  level: number;
  title: string;
};

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/**
 * Split a Markdown document into chunks at heading boundaries.
 *
 * Each chunk includes the full heading hierarchy as a prefix so the
 * chunk is self-contained for embedding and retrieval.
 *
 * @param content   Raw Markdown text
 * @param opts      Optional config
 *   - maxChunkChars: soft limit on chunk size; if a section exceeds this,
 *     it is further split into sub-chunks with overlapping heading context.
 *   - minChunkChars: minimum chunk size; headings with very little content
 *     are merged into their parent chunk.
 */
export function chunkByHeadings(
  content: string,
  opts?: { maxChunkChars?: number; minChunkChars?: number },
): HeadingChunk[] {
  const lines = content.split("\n");
  if (lines.length === 0) {
    return [];
  }

  const maxChunkChars = opts?.maxChunkChars ?? 3000;
  const minChunkChars = opts?.minChunkChars ?? 50;

  const chunks: HeadingChunk[] = [];
  const headingStack: HeadingFrame[] = [];

  let currentLines: string[] = [];
  let currentStartLine = 1;
  let currentHeadingLevel = 0;

  const flush = (endLine: number) => {
    const text = currentLines.join("\n").trim();
    if (text.length < minChunkChars && chunks.length > 0) {
      // Merge tiny chunks into the previous one; adopt current heading context so path and text match.
      const prev = chunks[chunks.length - 1];
      if (prev) {
        prev.text = `${prev.text}\n\n${text}`;
        prev.headingPath = headingStack.map((h) => h.title).join(" > ");
        prev.contextualText = buildContextualText(headingStack, prev.text);
        prev.endLine = endLine;
        prev.hash = hashText(prev.contextualText);
        currentLines = [];
        return;
      }
    }

    if (!text) {
      currentLines = [];
      return;
    }

    const headingPath = headingStack.map((h) => h.title).join(" > ");
    const contextualText = buildContextualText(headingStack, text);

    // If the chunk is too large, split it into sub-chunks
    if (contextualText.length > maxChunkChars) {
      const subChunks = splitLargeSection(
        text,
        headingStack,
        currentStartLine,
        endLine,
        maxChunkChars,
      );
      chunks.push(...subChunks);
    } else {
      chunks.push({
        headingPath,
        headingLevel: currentHeadingLevel,
        text,
        contextualText,
        startLine: currentStartLine,
        endLine,
        hash: hashText(contextualText),
      });
    }

    currentLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    const headingMatch = HEADING_RE.exec(line);

    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      const title = headingMatch[2]?.trim() ?? "";

      // Flush current section before starting new one
      flush(lineNo - 1);

      // Pop heading stack back to parent level
      while (headingStack.length > 0) {
        const top = headingStack[headingStack.length - 1];
        if (top && top.level >= level) {
          headingStack.pop();
        } else {
          break;
        }
      }
      headingStack.push({ level, title });
      currentHeadingLevel = level;
      currentStartLine = lineNo;
      continue;
    }

    currentLines.push(line);
  }

  // Flush remaining content
  flush(lines.length);

  return chunks;
}

function buildContextualText(stack: HeadingFrame[], bodyText: string): string {
  if (stack.length === 0) {
    return bodyText;
  }
  const breadcrumb = stack.map((h) => `${"#".repeat(h.level)} ${h.title}`).join("\n");
  return `${breadcrumb}\n\n${bodyText}`;
}

/**
 * Split an oversized section into sub-chunks, each carrying the heading
 * context as a prefix.  Splits on paragraph boundaries (double newline).
 */
function splitLargeSection(
  text: string,
  headingStack: HeadingFrame[],
  sectionStartLine: number,
  sectionEndLine: number,
  maxChunkChars: number,
): HeadingChunk[] {
  const headingPath = headingStack.map((h) => h.title).join(" > ");
  const contextPrefix = buildContextualText(headingStack, "");
  const prefixLen = contextPrefix.length;
  const effectiveMax = Math.max(200, maxChunkChars - prefixLen);

  // Split by paragraphs first (double newline)
  const paragraphs = text.split(/\n\n+/);
  const chunks: HeadingChunk[] = [];
  let currentParagraphs: string[] = [];
  let currentLen = 0;

  // Approximate line tracking within the section
  const totalLines = sectionEndLine - sectionStartLine + 1;
  const totalChars = text.length;
  let charOffset = 0;

  const flushParagraphs = () => {
    if (currentParagraphs.length === 0) {
      return;
    }
    const body = currentParagraphs.join("\n\n");
    const contextual = `${contextPrefix}${body}`;
    const startFraction = totalChars > 0 ? charOffset / totalChars : 0;
    const endFraction = totalChars > 0 ? (charOffset + body.length) / totalChars : 1;
    const startLine = sectionStartLine + Math.floor(startFraction * totalLines);
    const endLine = sectionStartLine + Math.floor(endFraction * totalLines);

    chunks.push({
      headingPath,
      headingLevel: headingStack[headingStack.length - 1]?.level ?? 0,
      text: body,
      contextualText: contextual,
      startLine: Math.max(sectionStartLine, startLine),
      endLine: Math.min(sectionEndLine, endLine),
      hash: hashText(contextual),
    });

    charOffset += body.length + 2; // +2 for paragraph separator
    currentParagraphs = [];
    currentLen = 0;
  };

  for (const paragraph of paragraphs) {
    // If a single paragraph exceeds the limit, split it by sentences or fixed size
    if (paragraph.length > effectiveMax) {
      flushParagraphs();
      const subParts = splitLongParagraph(paragraph, effectiveMax);
      for (const part of subParts) {
        currentParagraphs.push(part);
        flushParagraphs();
      }
      continue;
    }
    if (currentLen + paragraph.length > effectiveMax && currentParagraphs.length > 0) {
      flushParagraphs();
    }
    currentParagraphs.push(paragraph);
    currentLen += paragraph.length + 2;
  }
  flushParagraphs();

  return chunks;
}

/**
 * Split a single long paragraph into smaller parts.
 * Tries sentence boundaries first, falls back to fixed-size splits.
 */
function splitLongParagraph(text: string, maxChars: number): string[] {
  // Try splitting by sentences
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g);
  if (sentences && sentences.length > 1) {
    const parts: string[] = [];
    let current = "";
    for (const sentence of sentences) {
      if (current.length + sentence.length > maxChars && current.length > 0) {
        parts.push(current.trim());
        current = "";
      }
      current += sentence;
    }
    if (current.trim()) {
      parts.push(current.trim());
    }
    return parts;
  }

  // Fall back to fixed-size character splits at word boundaries
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    // Try to break at a space
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }
    parts.push(text.slice(start, end).trim());
    start = end;
    // Skip whitespace at the break point
    while (start < text.length && text[start] === " ") {
      start++;
    }
  }
  return parts.filter((p) => p.length > 0);
}
