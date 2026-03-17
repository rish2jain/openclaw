import { describe, it, expect, vi } from "vitest";
import { createAgentManageTool } from "./agent-manage.js";

function mockGateway(result: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(result);
}

describe("agent_manage tool", () => {
  describe("definition", () => {
    it("has correct name and required fields", () => {
      const tool = createAgentManageTool(mockGateway());
      expect(tool.definition.name).toBe("agent_manage");
      expect(tool.definition.inputSchema.required).toContain("action");
      expect(tool.definition.inputSchema.properties).toHaveProperty("agent_id");
    });
  });

  describe("execute — list", () => {
    it("returns formatted agent list", async () => {
      const gw = mockGateway({
        agents: [
          { id: "main", name: "Main Agent", model: "gpt-4", status: "active" },
          { id: "helper", name: "Helper", status: "idle" },
        ],
      });
      const tool = createAgentManageTool(gw);

      const result = await tool.execute({ action: "list" });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Main Agent");
      expect(result.content[0].text).toContain("gpt-4");
      expect(result.content[0].text).toContain("[active]");
      expect(result.content[0].text).toContain("Helper");
    });

    it("returns 'No agents configured' when list is empty", async () => {
      const gw = mockGateway({ agents: [] });
      const tool = createAgentManageTool(gw);

      const result = await tool.execute({ action: "list" });

      expect(result.content[0].text).toBe("No agents configured.");
    });

    it("handles missing agents array gracefully", async () => {
      const gw = mockGateway({});
      const tool = createAgentManageTool(gw);

      const result = await tool.execute({ action: "list" });

      expect(result.content[0].text).toBe("No agents configured.");
    });
  });

  describe("execute — inspect", () => {
    it("calls agents.inspect with agentId", async () => {
      const gw = mockGateway({ config: { model: "gpt-4" } });
      const tool = createAgentManageTool(gw);

      const result = await tool.execute({ action: "inspect", agent_id: "main" });

      expect(gw).toHaveBeenCalledWith("agents.inspect", { agentId: "main" });
      expect(result.content[0].text).toContain("Agent: main");
      expect(result.content[0].text).toContain("gpt-4");
    });

    it("returns error when agent_id is missing for inspect", async () => {
      const tool = createAgentManageTool(mockGateway());

      const result = await tool.execute({ action: "inspect" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'agent_id' is required");
    });
  });

  describe("execute — status", () => {
    it("calls agents.status with agentId", async () => {
      const gw = mockGateway({ status: "running", uptime: 3600 });
      const tool = createAgentManageTool(gw);

      const result = await tool.execute({ action: "status", agent_id: "main" });

      expect(gw).toHaveBeenCalledWith("agents.status", { agentId: "main" });
      expect(result.content[0].text).toContain("Agent Status: main");
    });

    it("returns error when agent_id is missing for status", async () => {
      const tool = createAgentManageTool(mockGateway());

      const result = await tool.execute({ action: "status" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'agent_id' is required");
    });
  });

  describe("execute — invalid action", () => {
    it("returns error for unknown action", async () => {
      const tool = createAgentManageTool(mockGateway());

      const result = await tool.execute({ action: "restart" });

      expect(result.isError).toBe(true);
    });

    it("returns error when action is missing", async () => {
      const tool = createAgentManageTool(mockGateway());

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
    });
  });
});
