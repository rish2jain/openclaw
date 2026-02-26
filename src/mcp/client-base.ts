/**
 * Abstract base class for MCP clients.
 *
 * Provides the shared interface and reconnection logic for both
 * stdio and SSE/HTTP transports.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { McpServerConfig } from "./config.js";

export type McpClientStatus = "disconnected" | "connecting" | "ready" | "error" | "closed";

export type McpToolInfo = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export abstract class McpClientBase {
  readonly name: string;
  readonly config: McpServerConfig;
  protected status: McpClientStatus = "disconnected";
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
  protected client: Client | null = null;
  protected discoveredTools: McpToolInfo[] = [];
  protected restartCount = 0;
  protected restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string, config: McpServerConfig) {
    this.name = name;
    this.config = config;
  }

  /** Connect to MCP server and discover tools */
  abstract connect(): Promise<void>;

  /** Gracefully disconnect */
  abstract disconnect(): Promise<void>;

  /** Call a tool on this MCP server */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    content: Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
  }> {
    if (!this.client || this.status !== "ready") {
      throw new Error(`MCP server '${this.name}' is not ready (status: ${this.status})`);
    }
    const result = await this.client.callTool({ name, arguments: args }, undefined, {
      timeout: this.config.toolTimeout ?? 60000,
    });
    return result as {
      content: Array<{ type: string; text?: string; mimeType?: string; data?: string }>;
    };
  }

  /** List available resources */
  async listResources(): Promise<{
    resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }>;
  }> {
    if (!this.client || this.status !== "ready") {
      throw new Error(`MCP server '${this.name}' is not ready (status: ${this.status})`);
    }
    return await this.client.listResources();
  }

  /** Read a specific resource */
  async readResource(params: { uri: string }): Promise<{
    contents: Array<{ text?: string; blob?: string; mimeType?: string }>;
  }> {
    if (!this.client || this.status !== "ready") {
      throw new Error(`MCP server '${this.name}' is not ready (status: ${this.status})`);
    }
    return (await this.client.readResource(params)) as {
      contents: Array<{ text?: string; blob?: string; mimeType?: string }>;
    };
  }

  /** Get current status */
  getStatus(): McpClientStatus {
    return this.status;
  }

  /** Get tools discovered during connect */
  getDiscoveredTools(): McpToolInfo[] {
    return this.discoveredTools;
  }

  /** Get number of restart attempts so far */
  getRestartCount(): number {
    return this.restartCount;
  }

  /** Initialize the MCP SDK client and discover tools */
  protected async initializeClient(
    transport: { close?: () => Promise<void> } & Record<string, unknown>,
  ): Promise<void> {
    this.client = new Client(
      { name: "openclaw-mcp", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {} } },
    );
    await this.client.connect(transport as Parameters<Client["connect"]>[0]);

    const toolsResult = await this.client.listTools();
    this.discoveredTools = toolsResult.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    this.status = "ready";
  }

  /** Handle unexpected disconnect — schedule restart if configured */
  protected handleDisconnect(): void {
    if (this.status === "closed") {
      return;
    } // intentional shutdown
    this.status = "error";
    this.client = null;

    const maxRestarts = this.config.maxRestarts ?? 5;
    if (this.config.restartOnCrash !== false && this.restartCount < maxRestarts) {
      const delay = Math.min(1000 * Math.pow(2, this.restartCount), 30000);
      this.restartCount++;
      this.restartTimer = setTimeout(() => {
        this.connect().catch(() => {
          // connect failure will call handleDisconnect again
        });
      }, delay);
    }
  }

  /** Cancel any pending restart timer */
  protected cancelRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
}
