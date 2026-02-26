/**
 * StdioMcpClient integration tests.
 *
 * Tests the full lifecycle: connect → discover → call → crash → reconnect → disconnect.
 * Uses the mock MCP server process for deterministic testing.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { StdioMcpClient } from "../client-stdio.js";
import type { McpServerConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeStdioConfig(
  mockOptions: Record<string, unknown> = {},
  overrides: Partial<McpServerConfig> = {},
): McpServerConfig {
  return {
    transport: "stdio",
    command: "node",
    args: ["--import", "tsx", path.join(__dirname, "mock-mcp-server-process.ts")],
    env: {
      MOCK_MCP_CONFIG: JSON.stringify(mockOptions),
    },
    timeout: 10000,
    toolTimeout: 5000,
    maxRestarts: 3,
    ...overrides,
  };
}

let clients: StdioMcpClient[] = [];

afterEach(async () => {
  for (const c of clients) {
    try {
      await c.disconnect();
    } catch {
      /* ignore */
    }
  }
  clients = [];
});

function createClient(name: string, config: McpServerConfig): StdioMcpClient {
  const c = new StdioMcpClient(name, config);
  clients.push(c);
  return c;
}

describe("StdioMcpClient", () => {
  it("connects to mock server and reaches ready status", async () => {
    const client = createClient(
      "test",
      makeStdioConfig({
        tools: [
          {
            name: "greet",
            description: "Say hi",
            inputSchema: { type: "object", properties: { name: { type: "string" } } },
          },
        ],
      }),
    );

    await client.connect();
    expect(client.getStatus()).toBe("ready");
  });

  it("discovers tools after connecting", async () => {
    const client = createClient(
      "test",
      makeStdioConfig({
        tools: [
          {
            name: "tool_a",
            description: "Tool A",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "tool_b",
            description: "Tool B",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      }),
    );

    await client.connect();
    const tools = client.getDiscoveredTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("tool_a");
    expect(tools[1].name).toBe("tool_b");
  });

  it("calls a tool and receives result", async () => {
    const client = createClient(
      "test",
      makeStdioConfig({
        tools: [
          {
            name: "echo",
            description: "Echo",
            inputSchema: { type: "object", properties: {} },
            response: "hello!",
          },
        ],
      }),
    );

    await client.connect();
    const result = await client.callTool("echo", {});
    expect(result.content).toEqual([{ type: "text", text: "hello!" }]);
  });

  it("lists resources from the server", async () => {
    const client = createClient(
      "test",
      makeStdioConfig({
        tools: [
          { name: "dummy", description: "D", inputSchema: { type: "object", properties: {} } },
        ],
        resources: [
          { uri: "file:///test.txt", name: "test", content: "data", mimeType: "text/plain" },
        ],
      }),
    );

    await client.connect();
    const result = await client.listResources();
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].uri).toBe("file:///test.txt");
  });

  it("reads a resource", async () => {
    const client = createClient(
      "test",
      makeStdioConfig({
        tools: [
          { name: "dummy", description: "D", inputSchema: { type: "object", properties: {} } },
        ],
        resources: [
          {
            uri: "file:///data.txt",
            name: "data",
            content: "Resource content",
            mimeType: "text/plain",
          },
        ],
      }),
    );

    await client.connect();
    const result = await client.readResource({ uri: "file:///data.txt" });
    expect(result.contents[0].text).toBe("Resource content");
  });

  it("throws when calling tool before connecting", async () => {
    const client = createClient("test", makeStdioConfig());
    await expect(client.callTool("anything", {})).rejects.toThrow(/not ready/);
  });

  it("transitions to error status on server crash", async () => {
    const client = createClient(
      "test",
      makeStdioConfig(
        {
          tools: [
            {
              name: "crash",
              description: "Crash",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          crashAfter: 1,
        },
        { restartOnCrash: false },
      ),
    );

    await client.connect();
    // The call itself might throw or return error
    try {
      await client.callTool("crash", {});
    } catch {
      /* expected */
    }

    // Wait for status change
    await new Promise((r) => setTimeout(r, 500));
    expect(client.getStatus()).toBe("error");
  });

  it("auto-restarts after crash when restartOnCrash is true", async () => {
    const client = createClient(
      "test",
      makeStdioConfig(
        {
          tools: [
            {
              name: "crash",
              description: "Crash",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          crashAfter: 1,
        },
        { restartOnCrash: true, maxRestarts: 3 },
      ),
    );

    await client.connect();
    expect(client.getStatus()).toBe("ready");

    try {
      await client.callTool("crash", {});
    } catch {
      /* expected */
    }

    // Wait for reconnect (backoff starts at 1s)
    await new Promise((r) => setTimeout(r, 3000));
    expect(client.getStatus()).toBe("ready");
    expect(client.getRestartCount()).toBeGreaterThanOrEqual(1);
  }, 10000);

  it("stops restarting after maxRestarts exceeded", async () => {
    const client = createClient(
      "test",
      makeStdioConfig(
        {
          tools: [
            {
              name: "crash",
              description: "Crash",
              inputSchema: { type: "object", properties: {} },
            },
          ],
          crashAfter: 1, // crashes on first call — but also crashes immediately since each restart re-reads config
        },
        { restartOnCrash: true, maxRestarts: 0 },
      ),
    );

    await client.connect();
    try {
      await client.callTool("crash", {});
    } catch {
      /* expected */
    }

    await new Promise((r) => setTimeout(r, 2000));
    expect(client.getStatus()).toBe("error");
  });

  it("disconnect gracefully stops the server", async () => {
    const client = createClient(
      "test",
      makeStdioConfig({
        tools: [{ name: "t", description: "T", inputSchema: { type: "object", properties: {} } }],
      }),
    );

    await client.connect();
    expect(client.getStatus()).toBe("ready");

    await client.disconnect();
    expect(client.getStatus()).toBe("closed");
  });

  it("does not restart after intentional disconnect", async () => {
    const client = createClient(
      "test",
      makeStdioConfig(
        {
          tools: [{ name: "t", description: "T", inputSchema: { type: "object", properties: {} } }],
        },
        { restartOnCrash: true, maxRestarts: 5 },
      ),
    );

    await client.connect();
    await client.disconnect();

    await new Promise((r) => setTimeout(r, 1500));
    expect(client.getStatus()).toBe("closed");
  });

  it("starts with disconnected status", () => {
    const client = createClient("test", makeStdioConfig());
    expect(client.getStatus()).toBe("disconnected");
  });
});
