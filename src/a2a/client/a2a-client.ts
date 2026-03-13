/**
 * A2A Client: high-level client for communicating with external A2A agents.
 *
 * Combines discovery (Agent Card fetching) with task management (sending
 * messages, querying tasks) into a single cohesive interface.
 */

import type { AgentCard } from "../agent-card.js";
import type {
  A2AMessage,
  ListTasksParams,
  ListTasksResult,
  SendMessageConfiguration,
  SendMessageResult,
  Task,
} from "../protocol.js";
import { discoverAgent, type DiscoveryOptions } from "./discovery.js";
import { A2ARemoteError, TaskManager } from "./task-manager.js";

export { A2ARemoteError };

export type A2AClientOptions = {
  /** The base URL of the remote A2A agent. */
  baseUrl: string;
  /** Optional auth headers. */
  headers?: Record<string, string>;
  /** Discovery timeout in milliseconds. */
  discoveryTimeoutMs?: number;
};

export class A2AClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly discoveryTimeoutMs: number;
  private cachedCard: AgentCard | null = null;
  private taskManager: TaskManager | null = null;

  constructor(opts: A2AClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.headers = opts.headers ?? {};
    this.discoveryTimeoutMs = opts.discoveryTimeoutMs ?? 10_000;
  }

  // ── Discovery ──────────────────────────────────────────────────────

  /**
   * Discover the remote agent's capabilities by fetching its Agent Card.
   * Results are cached for subsequent calls.
   */
  async discover(opts?: DiscoveryOptions): Promise<AgentCard> {
    if (this.cachedCard) {
      return this.cachedCard;
    }
    const result = await discoverAgent(this.baseUrl, {
      timeoutMs: opts?.timeoutMs ?? this.discoveryTimeoutMs,
      headers: { ...this.headers, ...opts?.headers },
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    this.cachedCard = result.card;
    return result.card;
  }

  /** Clear the cached Agent Card, forcing re-discovery on next call. */
  clearCache(): void {
    this.cachedCard = null;
    this.taskManager = null;
  }

  // ── Messaging ──────────────────────────────────────────────────────

  /**
   * Send a message to the remote agent. Discovers the endpoint
   * automatically if not already known.
   */
  async sendMessage(
    message: A2AMessage,
    configuration?: SendMessageConfiguration,
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    const tm = await this.getTaskManager();
    return tm.sendMessage(message, configuration, signal);
  }

  /**
   * Convenience: send a plain text message.
   */
  async sendText(
    text: string,
    configuration?: SendMessageConfiguration,
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    const tm = await this.getTaskManager();
    return tm.sendText(text, configuration, signal);
  }

  /**
   * Send a streaming message. Returns a ReadableStream of SSE event text.
   */
  async sendStreamingMessage(
    message: A2AMessage,
    configuration?: SendMessageConfiguration,
    signal?: AbortSignal,
  ): Promise<ReadableStream<string>> {
    const tm = await this.getTaskManager();
    return tm.sendStreamingMessage(message, configuration, signal);
  }

  // ── Task Management ────────────────────────────────────────────────

  async getTask(id: string, historyLength?: number, signal?: AbortSignal): Promise<Task> {
    const tm = await this.getTaskManager();
    return tm.getTask(id, historyLength, signal);
  }

  async listTasks(params?: ListTasksParams, signal?: AbortSignal): Promise<ListTasksResult> {
    const tm = await this.getTaskManager();
    return tm.listTasks(params, signal);
  }

  async cancelTask(id: string, signal?: AbortSignal): Promise<Task> {
    const tm = await this.getTaskManager();
    return tm.cancelTask(id, signal);
  }

  // ── Internal ───────────────────────────────────────────────────────

  private async getTaskManager(): Promise<TaskManager> {
    if (this.taskManager) {
      return this.taskManager;
    }

    const card = await this.discover();
    const endpoint = resolveEndpointFromCard(card, this.baseUrl);

    this.taskManager = new TaskManager({
      endpointUrl: endpoint,
      headers: this.headers,
    });

    return this.taskManager;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the JSON-RPC endpoint URL from the Agent Card's interfaces.
 * Falls back to `{baseUrl}/a2a` if no interface is declared.
 */
function resolveEndpointFromCard(card: AgentCard, baseUrl: string): string {
  const jsonRpcInterface = card.interfaces?.find((i) => i.protocolBinding === "JSONRPC");
  if (jsonRpcInterface?.url) {
    return jsonRpcInterface.url;
  }
  return `${baseUrl.replace(/\/+$/, "")}/a2a`;
}
