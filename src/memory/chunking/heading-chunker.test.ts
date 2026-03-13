import { describe, expect, it } from "vitest";
import { chunkByHeadings } from "./heading-chunker.js";

describe("heading-chunker", () => {
  it("splits document at heading boundaries", () => {
    const content = [
      "# Introduction",
      "Welcome to the project. This is a reasonably long introduction paragraph that explains what the project does and why it exists.",
      "",
      "## Getting Started",
      "Install the dependencies by running the install command. Then configure your environment with the required settings.",
      "",
      "## Configuration",
      "Set up your config file with the database connection, API keys, and logging preferences for the production environment.",
    ].join("\n");

    const chunks = chunkByHeadings(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves heading hierarchy as breadcrumb", () => {
    const content = [
      "# API",
      "API overview with detailed information about all the available endpoints and their purposes.",
      "",
      "## Authentication",
      "Authentication documentation covering all supported authentication methods and their configuration.",
      "",
      "### OAuth",
      "OAuth flow details including the authorization code grant, client credentials, and refresh token handling.",
    ].join("\n");

    const chunks = chunkByHeadings(content);
    const oauthChunk = chunks.find((c) => c.headingPath.includes("OAuth"));
    expect(oauthChunk).toBeDefined();
    expect(oauthChunk!.headingPath).toBe("API > Authentication > OAuth");
    expect(oauthChunk!.contextualText).toContain("# API");
    expect(oauthChunk!.contextualText).toContain("## Authentication");
    expect(oauthChunk!.contextualText).toContain("### OAuth");
  });

  it("handles document with no headings", () => {
    const content =
      "Just plain text with enough content to pass minimum chunk size. " +
      "Second sentence here. Third sentence with more content to make it substantial.";
    const chunks = chunkByHeadings(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].headingPath).toBe("");
  });

  it("merges tiny sections into previous chunk", () => {
    const content = [
      "# Section A",
      "Content for section A that is reasonably long and provides enough text.",
      "",
      "## Tiny",
      "x", // Very short
    ].join("\n");

    const chunks = chunkByHeadings(content, { minChunkChars: 50 });
    // The tiny section should be merged into the previous one
    expect(chunks.length).toBeLessThanOrEqual(2);
  });

  it("splits oversized sections into sub-chunks", () => {
    const longContent = "A ".repeat(2000); // ~4000 chars
    const content = `# Big Section\n${longContent}`;

    const chunks = chunkByHeadings(content, { maxChunkChars: 500 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each sub-chunk should carry the heading context
    for (const chunk of chunks) {
      expect(chunk.contextualText).toContain("# Big Section");
    }
  });

  it("tracks line numbers", () => {
    const content = [
      "# First",
      "Content for the first section that is long enough to not be merged with anything else in the document.",
      "",
      "# Second",
      "Content for the second section with enough detail to stand on its own as a separate chunk in the output.",
    ].join("\n");

    const chunks = chunkByHeadings(content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    const first = chunks.find((c) => c.headingPath === "First");
    expect(first).toBeDefined();
    expect(first!.startLine).toBe(1);
  });

  it("produces unique hashes per chunk", () => {
    const content = [
      "# Section A",
      "Unique content for section A that is long enough to stand alone as its own chunk in the result.",
      "",
      "# Section B",
      "Unique content for section B that is also long enough to be its own separate chunk in the output.",
    ].join("\n");

    const chunks = chunkByHeadings(content);
    const hashes = chunks.map((c) => c.hash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(hashes.length);
  });
});
