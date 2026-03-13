import { describe, expect, it } from "vitest";
import { chunkSemantically } from "./semantic-chunker.js";

describe("semantic-chunker", () => {
  it("falls back to paragraph chunking without embedFn", async () => {
    const content = [
      "First paragraph about TypeScript.",
      "",
      "Second paragraph about databases.",
      "",
      "Third paragraph about testing.",
    ].join("\n");

    const chunks = await chunkSemantically(content, null);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].text).toContain("TypeScript");
  });

  it("returns single chunk for short content", async () => {
    const chunks = await chunkSemantically("Just one short paragraph.", null);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Just one short paragraph.");
  });

  it("respects maxChunkChars limit", async () => {
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i}: ${"word ".repeat(50)}`,
    );
    const content = paragraphs.join("\n\n");

    const chunks = await chunkSemantically(content, null, { maxChunkChars: 500 });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(500);
    }
  });

  it("merges tiny trailing chunks", async () => {
    const content = [
      "A substantial first paragraph with plenty of content to work with.",
      "",
      "x", // Tiny paragraph
    ].join("\n");

    const chunks = await chunkSemantically(content, null, { minChunkChars: 20 });
    // The tiny paragraph should be merged
    expect(chunks).toHaveLength(1);
  });

  it("includes heading context when provided", async () => {
    const content = "Paragraph about authentication flows.";
    const chunks = await chunkSemantically(content, null, {
      headingContext: "# API\n## Authentication",
    });
    expect(chunks[0].contextualText).toContain("# API");
    expect(chunks[0].contextualText).toContain("## Authentication");
    expect(chunks[0].headingContext).toBe("# API\n## Authentication");
  });

  it("uses embeddings for semantic breakpoints when available", async () => {
    // Use long paragraphs with low maxChunkChars so grouping matters
    const content = [
      "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.",
      "",
      "It adds optional static typing and class-based object-oriented programming to the language.",
      "",
      "SQLite is a C library that provides a lightweight disk-based database engine.", // Topic shift
      "",
      "It stores data in a single file and requires no separate server process to operate.",
    ].join("\n");

    // Mock embedding function: similar vectors within same topic, different across topics
    const embedFn = async (texts: string[]) => {
      return texts.map((text) => {
        if (
          text.toLowerCase().includes("typescript") ||
          text.toLowerCase().includes("javascript") ||
          text.toLowerCase().includes("typing")
        ) {
          return [1, 0, 0, 0];
        }
        return [0, 0, 1, 0];
      });
    };

    const chunks = await chunkSemantically(content, embedFn, {
      breakpointThreshold: 0.5,
      maxChunkChars: 500,
    });
    // With embeddings, it should detect the topic shift between TS and SQLite
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back gracefully when embedFn throws", async () => {
    const content = "Paragraph one.\n\nParagraph two.";
    const failingEmbedFn = async () => {
      throw new Error("API unavailable");
    };

    const chunks = await chunkSemantically(content, failingEmbedFn);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("handles empty input", async () => {
    const chunks = await chunkSemantically("", null);
    expect(chunks).toHaveLength(0);
  });

  it("produces unique hashes", async () => {
    const content = "Alpha content.\n\nBeta content.\n\nGamma content.";
    const chunks = await chunkSemantically(content, null, {
      maxChunkChars: 25,
      minChunkChars: 1,
    });
    expect(chunks.length).toBeGreaterThan(1);
    const hashes = new Set(chunks.map((c) => c.hash));
    expect(hashes.size).toBe(chunks.length);
  });
});
