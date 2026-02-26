/**
 * Stdio MCP client — manages a child process MCP server.
 *
 * Spawns a child process, communicates via stdin/stdout JSON-RPC,
 * handles crash detection and auto-restart with exponential backoff.
 */

import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpClientBase } from "./client-base.js";

export class StdioMcpClient extends McpClientBase {
  // oxlint-disable-next-line typescript/no-redundant-type-constituents
  private transport: StdioClientTransport | null = null;

  async connect(): Promise<void> {
    this.status = "connecting";
    this.cancelRestart();

    try {
      // Build env: merge process.env with configured env
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (v !== undefined) {
          env[k] = v;
        }
      }
      for (const [k, v] of Object.entries(this.config.env ?? {})) {
        env[k] = v;
      }

      this.transport = new StdioClientTransport({
        command: this.config.command!,
        args: this.config.args,
        env,
        cwd: this.config.cwd,
      });

      // Monitor for crashes (SDK transports use property assignment, not EventTarget)
      // eslint-disable-next-line unicorn/prefer-add-event-listener
      this.transport.onclose = () => this.handleDisconnect();
      // eslint-disable-next-line unicorn/prefer-add-event-listener
      this.transport.onerror = () => this.handleDisconnect();

      await this.initializeClient(this.transport);
    } catch (err) {
      this.status = "error";
      this.handleDisconnect();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.status = "closed";
    this.cancelRestart();
    try {
      await this.client?.close();
    } catch {
      /* ignore close errors */
    }
    this.transport = null;
    this.client = null;
  }
}
