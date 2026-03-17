import { describe, it, expect, vi } from "vitest";
import { createMemoryQueryTool } from "./memory-query.js";

function mockGateway(result: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(result);
}

describe("memory_query tool", () => {
  describe("definition", () => {
    it("has correct name and required fields", () => {
      const tool = createMemoryQueryTool(mockGateway());
      expect(tool.definition.name).toBe("memory_query");
      expect(tool.definition.inputSchema.required).toContain("action");
      expect(tool.definition.inputSchema.properties).toHaveProperty("query");
      expect(tool.definition.inputSchema.properties).toHaveProperty("tier");
      expect(tool.definition.inputSchema.properties).toHaveProperty("limit");
    });
  });

  describe("execute — search", () => {
    it("calls memory.search with query, tier, and limit", async () => {
      const gw = mockGateway({
        entries: [{ content: "meeting notes from yesterday", tier: "session", score: 0.95 }],
      });
      const tool = createMemoryQueryTool(gw);

      const result = await tool.execute({
        action: "search",
        query: "meeting notes",
        tier: "session",
        limit: "10",
      });

      expect(gw).toHaveBeenCalledWith("memory.search", {
        query: "meeting notes",
        tier: "session",
        limit: 10,
      });
      expect(result.content[0].text).toContain('Memory Search: "meeting notes"');
      expect(result.content[0].text).toContain("score: 0.950");
    });

    it("uses defaults when tier and limit are omitted", async () => {
      const gw = mockGateway({ entries: [] });
      const tool = createMemoryQueryTool(gw);

      await tool.execute({ action: "search", query: "test" });

      expect(gw).toHaveBeenCalledWith("memory.search", {
        query: "test",
        tier: "all",
        limit: 20,
      });
    });

    it("returns 'No results' when entries are empty", async () => {
      const tool = createMemoryQueryTool(mockGateway({ entries: [] }));

      const result = await tool.execute({ action: "search", query: "nonexistent" });

      expect(result.content[0].text).toContain('No results for "nonexistent"');
    });

    it("returns error when query is missing", async () => {
      const tool = createMemoryQueryTool(mockGateway());

      const result = await tool.execute({ action: "search" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'query' is required");
    });
  });

  describe("execute — entities", () => {
    it("lists entity graph nodes", async () => {
      const gw = mockGateway({
        entities: [
          { name: "John", type: "person", mentions: 5 },
          { name: "Acme Corp", type: "organization", mentions: 1 },
        ],
      });
      const tool = createMemoryQueryTool(gw);

      const result = await tool.execute({ action: "entities" });

      expect(gw).toHaveBeenCalledWith("memory.entities", { limit: 20 });
      expect(result.content[0].text).toContain("John");
      expect(result.content[0].text).toContain("5 mentions");
      expect(result.content[0].text).toContain("1 mention");
    });

    it("returns 'No entities' when empty", async () => {
      const tool = createMemoryQueryTool(mockGateway({ entities: [] }));

      const result = await tool.execute({ action: "entities" });

      expect(result.content[0].text).toContain("No entities found");
    });
  });

  describe("execute — stats", () => {
    it("calls memory.stats and returns JSON", async () => {
      const gw = mockGateway({
        totalEntries: 42,
        tierBreakdown: { session: 20, agent: 22 },
      });
      const tool = createMemoryQueryTool(gw);

      const result = await tool.execute({ action: "stats" });

      expect(gw).toHaveBeenCalledWith("memory.stats", {});
      expect(result.content[0].text).toContain("Memory Stats");
      expect(result.content[0].text).toContain("42");
    });
  });

  describe("execute — invalid action", () => {
    it("returns error for unknown action", async () => {
      const tool = createMemoryQueryTool(mockGateway());

      const result = await tool.execute({ action: "delete" });

      expect(result.isError).toBe(true);
    });
  });
});
