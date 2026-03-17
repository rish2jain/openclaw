import { describe, it, expect, vi } from "vitest";
import { createChannelStatusTool } from "./channel-status.js";

function mockGateway(result: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(result);
}

describe("channel_status tool", () => {
  describe("definition", () => {
    it("has the correct name and schema", () => {
      const tool = createChannelStatusTool(mockGateway());
      expect(tool.definition.name).toBe("channel_status");
      expect(tool.definition.inputSchema.properties).toHaveProperty("channel");
      expect(tool.definition.inputSchema.required).toBeUndefined();
    });
  });

  describe("execute", () => {
    it("returns all channels when no filter is given", async () => {
      const statusData = {
        telegram: { enabled: true, connected: true },
        discord: { enabled: false, connected: false },
      };
      const tool = createChannelStatusTool(mockGateway(statusData));

      const result = await tool.execute({});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed).toHaveProperty("telegram");
      expect(parsed).toHaveProperty("discord");
    });

    it("filters to a specific channel when filter matches", async () => {
      const statusData = {
        telegram: { enabled: true },
        discord: { enabled: false },
        slack: { enabled: true },
      };
      const tool = createChannelStatusTool(mockGateway(statusData));

      const result = await tool.execute({ channel: "telegram" });

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed).toHaveProperty("telegram");
      expect(parsed).not.toHaveProperty("discord");
      expect(parsed).not.toHaveProperty("slack");
    });

    it("matches channel filter case-insensitively", async () => {
      const statusData = {
        Telegram: { enabled: true },
        Discord: { enabled: false },
      };
      const tool = createChannelStatusTool(mockGateway(statusData));

      const result = await tool.execute({ channel: "telegram" });

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed).toHaveProperty("Telegram");
    });

    it("matches channel filter with partial match (includes)", async () => {
      const statusData = {
        telegram_bot: { enabled: true },
        discord: { enabled: false },
      };
      const tool = createChannelStatusTool(mockGateway(statusData));

      const result = await tool.execute({ channel: "telegram" });

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed).toHaveProperty("telegram_bot");
    });

    it("returns full data with note when no channel matches filter", async () => {
      const statusData = {
        telegram: { enabled: true },
        discord: { enabled: false },
      };
      const tool = createChannelStatusTool(mockGateway(statusData));

      const result = await tool.execute({ channel: "slack" });

      expect(result.content[0].text!).toContain("No channels matching 'slack'");
      expect(result.content[0].text!).toContain("telegram");
    });

    it("calls gateway with channels.status method", async () => {
      const gw = mockGateway({ telegram: {} });
      const tool = createChannelStatusTool(gw);

      await tool.execute({});

      expect(gw).toHaveBeenCalledWith("channels.status", {});
    });
  });
});
