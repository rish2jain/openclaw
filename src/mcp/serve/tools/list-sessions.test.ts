import { describe, it, expect } from "vitest";
import { createListSessionsTool } from "./list-sessions.js";
import { mockGateway } from "./test-utils.js";

describe("list_sessions tool", () => {
  describe("definition", () => {
    it("has the correct name and schema", () => {
      const tool = createListSessionsTool(mockGateway());
      expect(tool.definition.name).toBe("list_sessions");
      expect(tool.definition.inputSchema.properties).toHaveProperty("agent_id");
    });
  });

  describe("execute", () => {
    it("calls sessions.list without agentId when not provided", async () => {
      const gw = mockGateway({ sessions: [] });
      const tool = createListSessionsTool(gw);

      const result = await tool.execute({});

      expect(gw).toHaveBeenCalledWith("sessions.list", {});
      expect(result.isError).toBeUndefined();
    });

    it("passes agentId when provided", async () => {
      const gw = mockGateway({ sessions: [] });
      const tool = createListSessionsTool(gw);

      await tool.execute({ agent_id: "my-agent" });

      expect(gw).toHaveBeenCalledWith("sessions.list", { agentId: "my-agent" });
    });

    it("serializes the gateway result as JSON text", async () => {
      const gw = mockGateway({
        sessions: [{ key: "agent:main:main", model: "gpt-4" }],
      });
      const tool = createListSessionsTool(gw);

      const result = await tool.execute({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sessions).toHaveLength(1);
      expect(parsed.sessions[0].key).toBe("agent:main:main");
    });
  });
});
