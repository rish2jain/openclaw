import { describe, expect, it } from "vitest";
import { createOpenClawTools } from "../openclaw-tools.js";
import type { AnyAgentTool } from "../tools/common.js";

describe("createOpenClawTools MCP integration", () => {
  it("returns tools without mcpTools when not provided", () => {
    const tools = createOpenClawTools();
    const mcpTool = tools.find((t) => t.name.startsWith("mcp_"));
    expect(mcpTool).toBeUndefined();
  });

  it("returns tools without mcpTools when empty array", () => {
    const tools = createOpenClawTools({ mcpTools: [] });
    const mcpTool = tools.find((t) => t.name.startsWith("mcp_"));
    expect(mcpTool).toBeUndefined();
  });

  it("appends MCP tools after native and plugin tools", () => {
    const fakeMcpTool: AnyAgentTool = {
      name: "mcp_test_hello",
      description: "A test MCP tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: "hello" }),
    } as unknown as AnyAgentTool;

    const tools = createOpenClawTools({ mcpTools: [fakeMcpTool] });
    const lastTool = tools[tools.length - 1];
    expect(lastTool.name).toBe("mcp_test_hello");
  });

  it("MCP tools appear after plugin tools in priority order", () => {
    const fakeMcpTool: AnyAgentTool = {
      name: "mcp_server_tool",
      description: "MCP tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: "ok" }),
    } as unknown as AnyAgentTool;

    const tools = createOpenClawTools({ mcpTools: [fakeMcpTool] });
    const mcpIndex = tools.findIndex((t) => t.name === "mcp_server_tool");
    const browserIndex = tools.findIndex((t) => t.name === "browser");

    // MCP tools should be after native tools
    expect(mcpIndex).toBeGreaterThan(browserIndex);
  });
});
