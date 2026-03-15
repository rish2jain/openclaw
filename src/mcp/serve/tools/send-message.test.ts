import { describe, it, expect, vi } from "vitest";
import { createSendMessageTool } from "./send-message.js";

function mockGateway(result: Record<string, unknown> = { ok: true }) {
  return vi.fn().mockResolvedValue(result);
}

describe("send_message tool", () => {
  describe("definition", () => {
    it("has the correct name and required fields", () => {
      const tool = createSendMessageTool(mockGateway());
      expect(tool.definition.name).toBe("send_message");
      expect(tool.definition.inputSchema.required).toContain("message");
      expect(tool.definition.inputSchema.properties).toHaveProperty("message");
      expect(tool.definition.inputSchema.properties).toHaveProperty("session_key");
      expect(tool.definition.inputSchema.properties).toHaveProperty("channel");
    });
  });

  describe("execute", () => {
    it("sends message with only required args", async () => {
      const gw = mockGateway({ delivered: true });
      const tool = createSendMessageTool(gw);

      const result = await tool.execute({ message: "hello" });

      expect(gw).toHaveBeenCalledWith("send", { message: "hello" });
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.delivered).toBe(true);
    });

    it("passes optional session_key and channel", async () => {
      const gw = mockGateway({ delivered: true });
      const tool = createSendMessageTool(gw);

      await tool.execute({
        message: "test",
        session_key: "agent:main:main",
        channel: "telegram",
      });

      expect(gw).toHaveBeenCalledWith("send", {
        message: "test",
        sessionKey: "agent:main:main",
        channel: "telegram",
      });
    });

    it("returns error result when message is missing", async () => {
      const tool = createSendMessageTool(mockGateway());

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("'message' is required");
    });

    it("returns error result when message is not a string", async () => {
      const tool = createSendMessageTool(mockGateway());

      const result = await tool.execute({ message: 42 });

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("must be a string");
    });

    it("propagates gateway errors as thrown exceptions", async () => {
      const gw = vi.fn().mockRejectedValue(new Error("gateway offline"));
      const tool = createSendMessageTool(gw);

      await expect(tool.execute({ message: "hello" })).rejects.toThrow("gateway offline");
    });

    it("does not include session_key or channel when not provided", async () => {
      const gw = mockGateway();
      const tool = createSendMessageTool(gw);

      await tool.execute({ message: "hi" });

      const callArgs = gw.mock.calls[0][1] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty("sessionKey");
      expect(callArgs).not.toHaveProperty("channel");
    });
  });
});
