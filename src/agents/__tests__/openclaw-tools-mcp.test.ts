import { describe, expect, it } from "vitest";
import { createOpenClawTools } from "../openclaw-tools.js";

describe("createOpenClawTools MCP integration", () => {
  it("returns tools without mcpTools when not provided", () => {
    const tools = createOpenClawTools();
    const mcpTool = tools.find((t) => t.name.startsWith("mcp_"));
    expect(mcpTool).toBeUndefined();
  });

  it("returns tools without any mcp-prefixed tools by default", () => {
    const tools = createOpenClawTools();
    const mcpTool = tools.find((t) => t.name.startsWith("mcp_"));
    expect(mcpTool).toBeUndefined();
  });
});
