import { describe, it, expect, vi } from "vitest";
import { createFailoverStatusTool } from "./failover-status.js";

function mockGateway(result: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(result);
}

describe("failover_status tool", () => {
  describe("definition", () => {
    it("has correct name and schema", () => {
      const tool = createFailoverStatusTool(mockGateway());
      expect(tool.definition.name).toBe("failover_status");
      expect(tool.definition.inputSchema.properties).toHaveProperty("view");
      expect(tool.definition.inputSchema.properties).toHaveProperty("limit");
    });
  });

  describe("execute — active (default)", () => {
    it("shows active failovers", async () => {
      const gw = mockGateway({
        failovers: [
          {
            userKey: "user-1",
            sourceChannel: "telegram",
            targetChannel: "discord",
            startedAt: "2026-03-15T10:00:00Z",
            messagesRouted: 3,
          },
        ],
      });
      const tool = createFailoverStatusTool(gw);

      const result = await tool.execute({});

      expect(gw).toHaveBeenCalledWith("failover.active", {});
      expect(result.content[0].text).toContain("Active Failovers");
      expect(result.content[0].text).toContain("user-1");
      expect(result.content[0].text).toContain("telegram");
      expect(result.content[0].text).toContain("discord");
      expect(result.content[0].text).toContain("3 msgs routed");
    });

    it("shows 'No active failovers' when list is empty", async () => {
      const tool = createFailoverStatusTool(mockGateway({ failovers: [] }));

      const result = await tool.execute({});

      expect(result.content[0].text).toBe("No active failovers.");
    });

    it("handles missing failovers array", async () => {
      const tool = createFailoverStatusTool(mockGateway({}));

      const result = await tool.execute({});

      expect(result.content[0].text).toBe("No active failovers.");
    });
  });

  describe("execute — history", () => {
    it("shows failover history with default limit", async () => {
      const gw = mockGateway({
        events: [
          {
            userKey: "user-1",
            sourceChannel: "telegram",
            targetChannel: "discord",
            reason: "channel_down",
            startedAt: "2026-03-15T09:00:00Z",
            endedAt: "2026-03-15T09:30:00Z",
            durationSeconds: 1800,
            messagesRouted: 5,
            failbackSuccess: true,
          },
        ],
      });
      const tool = createFailoverStatusTool(gw);

      const result = await tool.execute({ view: "history" });

      expect(gw).toHaveBeenCalledWith("failover.history", { limit: 20 });
      expect(result.content[0].text).toContain("Failover History");
      expect(result.content[0].text).toContain("1800s");
      expect(result.content[0].text).toContain("5 msgs");
      expect(result.content[0].text).toContain("failback OK");
    });

    it("shows 'No failover history' when empty", async () => {
      const tool = createFailoverStatusTool(mockGateway({ events: [] }));

      const result = await tool.execute({ view: "history" });

      expect(result.content[0].text).toBe("No failover history.");
    });

    it("passes custom limit", async () => {
      const gw = mockGateway({ events: [] });
      const tool = createFailoverStatusTool(gw);

      await tool.execute({ view: "history", limit: "50" });

      expect(gw).toHaveBeenCalledWith("failover.history", { limit: 50 });
    });

    it("shows 'ongoing' for events without durationSeconds", async () => {
      const gw = mockGateway({
        events: [
          {
            userKey: "u1",
            sourceChannel: "telegram",
            targetChannel: "discord",
            reason: "timeout",
            startedAt: "2026-03-15T10:00:00Z",
            messagesRouted: 1,
          },
        ],
      });
      const tool = createFailoverStatusTool(gw);

      const result = await tool.execute({ view: "history" });

      expect(result.content[0].text).toContain("ongoing");
    });

    it("shows failback failed indicator", async () => {
      const gw = mockGateway({
        events: [
          {
            userKey: "u1",
            sourceChannel: "telegram",
            targetChannel: "discord",
            reason: "err",
            startedAt: "2026-03-15T10:00:00Z",
            durationSeconds: 60,
            messagesRouted: 0,
            failbackSuccess: false,
          },
        ],
      });
      const tool = createFailoverStatusTool(gw);

      const result = await tool.execute({ view: "history" });

      expect(result.content[0].text).toContain("failback failed");
    });
  });

  describe("execute — sla", () => {
    it("calls failover.sla and returns JSON block", async () => {
      const gw = mockGateway({ uptimePercent: 99.5, mttr: 120 });
      const tool = createFailoverStatusTool(gw);

      const result = await tool.execute({ view: "sla" });

      expect(gw).toHaveBeenCalledWith("failover.sla", {});
      expect(result.content[0].text).toContain("SLA Metrics");
      expect(result.content[0].text).toContain("99.5");
    });
  });

  describe("execute — invalid view", () => {
    it("returns error for unknown view", async () => {
      const tool = createFailoverStatusTool(mockGateway());

      const result = await tool.execute({ view: "unknown" });

      expect(result.isError).toBe(true);
    });
  });
});
