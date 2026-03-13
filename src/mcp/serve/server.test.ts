import { describe, expect, it, vi } from "vitest";
import {
  createJsonRpcErrorResponse,
  createJsonRpcResponse,
  parseJsonRpcMessage,
  serializeJsonRpcMessage,
} from "./protocol.js";
import { getResourceTemplates } from "./resources.js";
import { McpErrorCode, MCP_PROTOCOL_VERSION } from "./types.js";

describe("MCP protocol utilities", () => {
  it("parses valid JSON-RPC message", () => {
    const msg = parseJsonRpcMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    );
    expect(msg).toBeTruthy();
    expect(msg).toHaveProperty("method", "initialize");
  });

  it("rejects non-2.0 jsonrpc", () => {
    const msg = parseJsonRpcMessage(JSON.stringify({ jsonrpc: "1.0", id: 1, method: "test" }));
    expect(msg).toBeNull();
  });

  it("rejects invalid JSON", () => {
    const msg = parseJsonRpcMessage("not json at all");
    expect(msg).toBeNull();
  });

  it("serializes and parses round-trip", () => {
    const original = { jsonrpc: "2.0" as const, id: 42, method: "test", params: { key: "val" } };
    const serialized = serializeJsonRpcMessage(original);
    const parsed = parseJsonRpcMessage(serialized);
    expect(parsed).toEqual(original);
  });

  it("creates success response", () => {
    const resp = createJsonRpcResponse(1, { ok: true });
    expect(resp.jsonrpc).toBe("2.0");
    expect(resp.id).toBe(1);
    expect(resp.result).toEqual({ ok: true });
    expect(resp.error).toBeUndefined();
  });

  it("creates error response", () => {
    const resp = createJsonRpcErrorResponse(2, McpErrorCode.METHOD_NOT_FOUND, "not found");
    expect(resp.jsonrpc).toBe("2.0");
    expect(resp.id).toBe(2);
    expect(resp.error?.code).toBe(-32601);
    expect(resp.error?.message).toBe("not found");
  });
});

describe("MCP resource templates", () => {
  it("returns channel and session templates", () => {
    const templates = getResourceTemplates();
    expect(templates.length).toBe(2);
    expect(templates.some((t) => t.uriTemplate.includes("channels"))).toBe(true);
    expect(templates.some((t) => t.uriTemplate.includes("sessions"))).toBe(true);
  });
});

describe("MCP types", () => {
  it("exports protocol version", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2024-11-05");
  });

  it("exports error codes", () => {
    expect(McpErrorCode.PARSE_ERROR).toBe(-32700);
    expect(McpErrorCode.INVALID_REQUEST).toBe(-32600);
    expect(McpErrorCode.METHOD_NOT_FOUND).toBe(-32601);
    expect(McpErrorCode.INVALID_PARAMS).toBe(-32602);
    expect(McpErrorCode.INTERNAL_ERROR).toBe(-32603);
  });
});

describe("MCP tool factories", () => {
  const mockCallGateway = vi.fn().mockResolvedValue({ ok: true });

  it("getAllTools returns all 6 tools", async () => {
    const { getAllTools } = await import("./tools/index.js");
    const tools = getAllTools(mockCallGateway);
    expect(tools.length).toBe(6);

    const names = tools.map((t) => t.definition.name);
    expect(names).toContain("send_message");
    expect(names).toContain("channel_status");
    expect(names).toContain("list_sessions");
    expect(names).toContain("query_session");
    expect(names).toContain("manage_config");
    expect(names).toContain("cron_manage");
  });

  it("all tools have valid inputSchema with type=object", async () => {
    const { getAllTools } = await import("./tools/index.js");
    const tools = getAllTools(mockCallGateway);
    for (const tool of tools) {
      expect(tool.definition.inputSchema.type).toBe("object");
      expect(tool.definition.inputSchema.properties).toBeDefined();
    }
  });

  it("send_message validates missing message", async () => {
    const { createSendMessageTool } = await import("./tools/send-message.js");
    const tool = createSendMessageTool(mockCallGateway);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
  });

  it("send_message calls gateway with message", async () => {
    const gateway = vi.fn().mockResolvedValue({ sent: true });
    const { createSendMessageTool } = await import("./tools/send-message.js");
    const tool = createSendMessageTool(gateway);
    const result = await tool.execute({ message: "hello" });
    expect(result.isError).toBeUndefined();
    expect(gateway).toHaveBeenCalledWith("send", { message: "hello" });
  });

  it("query_session validates missing session_key", async () => {
    const { createQuerySessionTool } = await import("./tools/query-session.js");
    const tool = createQuerySessionTool(mockCallGateway);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
  });

  it("manage_config rejects unknown action", async () => {
    const { createManageConfigTool } = await import("./tools/manage-config.js");
    const tool = createManageConfigTool(mockCallGateway);
    const result = await tool.execute({ action: "invalid" });
    expect(result.isError).toBe(true);
  });

  it("cron_manage rejects unknown action", async () => {
    const { createCronManageTool } = await import("./tools/cron-manage.js");
    const tool = createCronManageTool(mockCallGateway);
    const result = await tool.execute({ action: "invalid" });
    expect(result.isError).toBe(true);
  });

  it("cron_manage add validates required fields", async () => {
    const { createCronManageTool } = await import("./tools/cron-manage.js");
    const tool = createCronManageTool(mockCallGateway);

    const noSchedule = await tool.execute({ action: "add", prompt: "test" });
    expect(noSchedule.isError).toBe(true);

    const noPrompt = await tool.execute({ action: "add", schedule: "* * * * *" });
    expect(noPrompt.isError).toBe(true);
  });
});
