import { describe, it, expect } from "vitest";
import { createCronManageTool } from "./cron-manage.js";
import { mockGateway } from "./test-utils.js";

describe("cron_manage tool", () => {
  describe("definition", () => {
    it("has correct name and required fields", () => {
      const tool = createCronManageTool(mockGateway());
      expect(tool.definition.name).toBe("cron_manage");
      expect(tool.definition.inputSchema.required).toContain("action");
      expect(tool.definition.inputSchema.properties).toHaveProperty("schedule");
      expect(tool.definition.inputSchema.properties).toHaveProperty("prompt");
      expect(tool.definition.inputSchema.properties).toHaveProperty("id");
      expect(tool.definition.inputSchema.properties).toHaveProperty("label");
      expect(tool.definition.inputSchema.properties).toHaveProperty("session_key");
    });
  });

  describe("execute — list", () => {
    it("calls cron.list", async () => {
      const gw = mockGateway({ jobs: [] });
      const tool = createCronManageTool(gw);

      const result = await tool.execute({ action: "list" });

      expect(gw).toHaveBeenCalledWith("cron.list", {});
      expect(result.isError).toBeUndefined();
    });
  });

  describe("execute — status", () => {
    it("calls cron.status", async () => {
      const gw = mockGateway({ running: true });
      const tool = createCronManageTool(gw);

      await tool.execute({ action: "status" });

      expect(gw).toHaveBeenCalledWith("cron.status", {});
    });
  });

  describe("execute — add", () => {
    it("calls cron.add with schedule and prompt", async () => {
      const gw = mockGateway({ id: "job-1" });
      const tool = createCronManageTool(gw);

      const result = await tool.execute({
        action: "add",
        schedule: "0 9 * * *",
        prompt: "Good morning!",
      });

      expect(gw).toHaveBeenCalledWith("cron.add", {
        schedule: "0 9 * * *",
        prompt: "Good morning!",
      });
      expect(result.isError).toBeUndefined();
    });

    it("includes optional label and session_key", async () => {
      const gw = mockGateway({ id: "job-2" });
      const tool = createCronManageTool(gw);

      await tool.execute({
        action: "add",
        schedule: "*/5 * * * *",
        prompt: "ping",
        label: "5-min-ping",
        session_key: "agent:main:main",
      });

      expect(gw).toHaveBeenCalledWith("cron.add", {
        schedule: "*/5 * * * *",
        prompt: "ping",
        label: "5-min-ping",
        sessionKey: "agent:main:main",
      });
    });

    it("returns error when schedule is missing", async () => {
      const tool = createCronManageTool(mockGateway());

      const result = await tool.execute({ action: "add", prompt: "hello" });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain("'schedule' is required");
    });

    it("returns error when prompt is missing", async () => {
      const tool = createCronManageTool(mockGateway());

      const result = await tool.execute({ action: "add", schedule: "0 9 * * *" });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain("'prompt' is required");
    });

    it("returns error when schedule is not a string", async () => {
      const tool = createCronManageTool(mockGateway());

      const result = await tool.execute({
        action: "add",
        schedule: 123,
        prompt: "hi",
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain("'schedule' is required");
    });
  });

  describe("execute — remove", () => {
    it("calls cron.remove with id", async () => {
      const gw = mockGateway({ removed: true });
      const tool = createCronManageTool(gw);

      await tool.execute({ action: "remove", id: "job-1" });

      expect(gw).toHaveBeenCalledWith("cron.remove", { id: "job-1" });
    });

    it("returns error when id is missing", async () => {
      const tool = createCronManageTool(mockGateway());

      const result = await tool.execute({ action: "remove" });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain("'id' is required");
    });

    it("returns error when id is not a string", async () => {
      const tool = createCronManageTool(mockGateway());

      const result = await tool.execute({ action: "remove", id: 42 });

      expect(result.isError).toBe(true);
    });
  });

  describe("execute — runs", () => {
    it("calls cron.runs with optional id", async () => {
      const gw = mockGateway({ runs: [] });
      const tool = createCronManageTool(gw);

      await tool.execute({ action: "runs", id: "job-1" });

      expect(gw).toHaveBeenCalledWith("cron.runs", { id: "job-1" });
    });

    it("calls cron.runs without id", async () => {
      const gw = mockGateway({ runs: [] });
      const tool = createCronManageTool(gw);

      await tool.execute({ action: "runs" });

      expect(gw).toHaveBeenCalledWith("cron.runs", {});
    });
  });
});
