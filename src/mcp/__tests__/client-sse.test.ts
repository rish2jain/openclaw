/**
 * SseMcpClient integration tests.
 *
 * Uses a mock HTTP MCP server for testing SSE and StreamableHTTP transports.
 */

import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { afterEach, describe, expect, it } from "vitest";
import { SseMcpClient } from "../client-sse.js";
import type { McpServerConfig } from "../config.js";

let httpServer: http.Server | null = null;
let serverPort = 0;
let clients: SseMcpClient[] = [];
// oxlint-disable-next-line typescript/no-redundant-type-constituents
let sseTransport: SSEServerTransport | null = null;

function createMockHttpServer(
  options: { tools?: Array<{ name: string; description: string; response?: string }> } = {},
): Promise<number> {
  return new Promise((resolve) => {
    const mcpServer = new McpServer(
      { name: "mock-sse-server", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    for (const tool of options.tools ?? []) {
      mcpServer.tool(tool.name, tool.description, {}, async () => ({
        content: [{ type: "text" as const, text: tool.response ?? `Response from ${tool.name}` }],
      }));
    }

    httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost`);
      if (url.pathname === "/sse" && req.method === "GET") {
        sseTransport = new SSEServerTransport("/messages", res);
        await mcpServer.connect(sseTransport);
      } else if (url.pathname === "/messages" && req.method === "POST") {
        if (sseTransport) {
          await sseTransport.handlePostMessage(req, res);
        } else {
          res.writeHead(500);
          res.end("No SSE connection");
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    httpServer.listen(0, () => {
      const addr = httpServer!.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(port);
    });
  });
}

function makeSseConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    transport: "sse",
    url: `http://localhost:${serverPort}/sse`,
    timeout: 10000,
    toolTimeout: 5000,
    maxRestarts: 3,
    ...overrides,
  };
}

afterEach(async () => {
  for (const c of clients) {
    try {
      await c.disconnect();
    } catch {
      /* ignore */
    }
  }
  clients = [];
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = null;
  }
  sseTransport = null;
});

function createClient(name: string, config: McpServerConfig): SseMcpClient {
  const c = new SseMcpClient(name, config);
  clients.push(c);
  return c;
}

describe("SseMcpClient", () => {
  it("connects to SSE endpoint and discovers tools", async () => {
    serverPort = await createMockHttpServer({
      tools: [{ name: "ping", description: "Ping", response: "pong" }],
    });

    const client = createClient("test-sse", makeSseConfig());
    await client.connect();
    expect(client.getStatus()).toBe("ready");

    const tools = client.getDiscoveredTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("ping");
  });

  it("calls a tool and receives result", async () => {
    serverPort = await createMockHttpServer({
      tools: [{ name: "echo", description: "Echo", response: "hello SSE!" }],
    });

    const client = createClient("test-sse", makeSseConfig());
    await client.connect();

    const result = await client.callTool("echo", {});
    expect(result.content).toEqual([{ type: "text", text: "hello SSE!" }]);
  });

  it("throws when calling tool before connecting", async () => {
    serverPort = await createMockHttpServer();
    const client = createClient("test-sse", makeSseConfig());
    await expect(client.callTool("anything", {})).rejects.toThrow(/not ready/);
  });

  it("disconnects cleanly", async () => {
    serverPort = await createMockHttpServer({
      tools: [{ name: "t", description: "T" }],
    });

    const client = createClient("test-sse", makeSseConfig());
    await client.connect();
    expect(client.getStatus()).toBe("ready");

    await client.disconnect();
    expect(client.getStatus()).toBe("closed");
  });

  it("starts with disconnected status", () => {
    const client = createClient("test-sse", {
      transport: "sse",
      url: "http://localhost:9999/sse",
    });
    expect(client.getStatus()).toBe("disconnected");
  });

  it("transitions to error on connection failure", async () => {
    const client = createClient("test-sse", {
      transport: "sse",
      url: "http://localhost:1/sse", // nothing listening
      timeout: 2000,
      restartOnCrash: false,
    });

    await expect(client.connect()).rejects.toThrow();
    expect(client.getStatus()).toBe("error");
  });
});
