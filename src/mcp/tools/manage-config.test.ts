import { describe, it, expect, vi } from "vitest";
import { createManageConfigTool } from "./manage-config.js";

function mockGateway(result: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(result);
}

describe("manage_config tool", () => {
  describe("definition", () => {
    it("has correct name and required fields", () => {
      const tool = createManageConfigTool(mockGateway());
      expect(tool.definition.name).toBe("manage_config");
      expect(tool.definition.inputSchema.required).toContain("action");
      expect(tool.definition.inputSchema.properties).toHaveProperty("key");
      expect(tool.definition.inputSchema.properties).toHaveProperty("value");
    });
  });

  describe("execute — get", () => {
    it("calls config.get without key for full config", async () => {
      const gw = mockGateway({ gateway: { mode: "local" } });
      const tool = createManageConfigTool(gw);

      const result = await tool.execute({ action: "get" });

      expect(gw).toHaveBeenCalledWith("config.get", {});
      expect(result.isError).toBeUndefined();
    });

    it("calls config.get with key for specific value", async () => {
      const gw = mockGateway({ value: "local" });
      const tool = createManageConfigTool(gw);

      await tool.execute({ action: "get", key: "gateway.mode" });

      expect(gw).toHaveBeenCalledWith("config.get", { key: "gateway.mode" });
    });
  });

  describe("execute — set", () => {
    it("calls config.set with key and coerced value", async () => {
      const gw = mockGateway({ updated: true });
      const tool = createManageConfigTool(gw);

      await tool.execute({ action: "set", key: "gateway.mode", value: "remote" });

      expect(gw).toHaveBeenCalledWith("config.set", {
        key: "gateway.mode",
        value: "remote",
      });
    });

    it("coerces boolean string values", async () => {
      const gw = mockGateway({});
      const tool = createManageConfigTool(gw);

      await tool.execute({
        action: "set",
        key: "channels.telegram.enabled",
        value: "true",
      });

      expect(gw).toHaveBeenCalledWith("config.set", {
        key: "channels.telegram.enabled",
        value: true,
      });
    });

    it("coerces numeric string values", async () => {
      const gw = mockGateway({});
      const tool = createManageConfigTool(gw);

      await tool.execute({ action: "set", key: "port", value: "8080" });

      expect(gw).toHaveBeenCalledWith("config.set", { key: "port", value: 8080 });
    });

    it("returns error when key is missing for set", async () => {
      const tool = createManageConfigTool(mockGateway());

      const result = await tool.execute({ action: "set", value: "foo" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'key' is required");
    });

    it("returns error when value is missing for set", async () => {
      const tool = createManageConfigTool(mockGateway());

      const result = await tool.execute({ action: "set", key: "some.key" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'value' is required");
    });
  });

  describe("execute — schema", () => {
    it("calls config.schema.lookup", async () => {
      const gw = mockGateway({ schema: {} });
      const tool = createManageConfigTool(gw);

      await tool.execute({ action: "schema" });

      expect(gw).toHaveBeenCalledWith("config.schema.lookup", {});
    });

    it("passes key to schema lookup when provided", async () => {
      const gw = mockGateway({ schema: {} });
      const tool = createManageConfigTool(gw);

      await tool.execute({ action: "schema", key: "gateway" });

      expect(gw).toHaveBeenCalledWith("config.schema.lookup", { key: "gateway" });
    });
  });

  describe("execute — invalid action", () => {
    it("returns error for unknown action", async () => {
      const tool = createManageConfigTool(mockGateway());

      const result = await tool.execute({ action: "delete" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be one of");
    });

    it("returns error when action is missing", async () => {
      const tool = createManageConfigTool(mockGateway());

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("'action' is required");
    });
  });
});
