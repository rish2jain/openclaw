import { describe, it, expect, vi } from "vitest";
import { createQuerySessionTool } from "./query-session.js";

function mockGateway(result: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(result);
}

describe("query_session tool", () => {
  describe("definition", () => {
    it("has correct name and required fields", () => {
      const tool = createQuerySessionTool(mockGateway());
      expect(tool.definition.name).toBe("query_session");
      expect(tool.definition.inputSchema.required).toContain("session_key");
      expect(tool.definition.inputSchema.properties).toHaveProperty("limit");
    });
  });

  describe("execute", () => {
    it("calls sessions.preview with session key", async () => {
      const gw = mockGateway({ messages: [] });
      const tool = createQuerySessionTool(gw);

      const result = await tool.execute({ session_key: "agent:main:main" });

      expect(gw).toHaveBeenCalledWith("sessions.preview", {
        sessionKey: "agent:main:main",
        limit: 20,
      });
      expect(result.isError).toBeUndefined();
    });

    it("passes custom limit", async () => {
      const gw = mockGateway({ messages: [] });
      const tool = createQuerySessionTool(gw);

      await tool.execute({ session_key: "s1", limit: 50 });

      expect(gw).toHaveBeenCalledWith("sessions.preview", {
        sessionKey: "s1",
        limit: 50,
      });
    });

    it("returns error when session_key is missing", async () => {
      const tool = createQuerySessionTool(mockGateway());

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'session_key' is required");
    });

    it("returns error when session_key is not a string", async () => {
      const tool = createQuerySessionTool(mockGateway());

      const result = await tool.execute({ session_key: 123 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be a string");
    });

    it("rejects limit below minimum", async () => {
      const tool = createQuerySessionTool(mockGateway());

      const result = await tool.execute({ session_key: "s1", limit: 0 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be >= 1");
    });

    it("rejects limit above maximum", async () => {
      const tool = createQuerySessionTool(mockGateway());

      const result = await tool.execute({ session_key: "s1", limit: 300 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be <= 200");
    });
  });
});
