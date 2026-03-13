/**
 * A2A Task Manager: create and manage tasks on external A2A agents.
 *
 * Provides typed wrappers around the A2A JSON-RPC methods for sending
 * messages, querying task state, and canceling tasks.
 */

import {
  A2A_METHODS,
  type A2AMessage,
  type CancelTaskParams,
  type GetTaskParams,
  type ListTasksParams,
  type ListTasksResult,
  type SendMessageConfiguration,
  type SendMessageResult,
  type Task,
} from "../protocol.js";
import { fetchJsonRpc, type FetchJsonRpcParams } from "../transport.js";

export type TaskManagerOptions = {
  /** The A2A JSON-RPC endpoint URL (typically `https://host/a2a`). */
  endpointUrl: string;
  /** Optional auth headers to include on every request. */
  headers?: Record<string, string>;
};

export class TaskManager {
  private readonly endpointUrl: string;
  private readonly headers: Record<string, string>;

  constructor(opts: TaskManagerOptions) {
    this.endpointUrl = opts.endpointUrl;
    this.headers = opts.headers ?? {};
  }

  // ── Send Message ───────────────────────────────────────────────────

  /**
   * Send a message to the remote agent, creating (or continuing) a task.
   */
  async sendMessage(
    message: A2AMessage,
    configuration?: SendMessageConfiguration,
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    const response = await this.rpc<SendMessageResult>(
      A2A_METHODS.SEND_MESSAGE,
      { message, configuration },
      signal,
    );
    return response;
  }

  /**
   * Convenience: send a plain text message.
   */
  async sendText(
    text: string,
    configuration?: SendMessageConfiguration,
    signal?: AbortSignal,
  ): Promise<SendMessageResult> {
    return this.sendMessage(
      { role: "user", parts: [{ type: "text", text }] },
      configuration,
      signal,
    );
  }

  // ── Get Task ───────────────────────────────────────────────────────

  async getTask(id: string, historyLength?: number, signal?: AbortSignal): Promise<Task> {
    const params: GetTaskParams = { id, historyLength };
    return this.rpc<Task>(A2A_METHODS.GET_TASK, params, signal);
  }

  // ── List Tasks ─────────────────────────────────────────────────────

  async listTasks(params?: ListTasksParams, signal?: AbortSignal): Promise<ListTasksResult> {
    return this.rpc<ListTasksResult>(A2A_METHODS.LIST_TASKS, params ?? {}, signal);
  }

  // ── Cancel Task ────────────────────────────────────────────────────

  async cancelTask(id: string, signal?: AbortSignal): Promise<Task> {
    const params: CancelTaskParams = { id };
    return this.rpc<Task>(A2A_METHODS.CANCEL_TASK, params, signal);
  }

  // ── Streaming Message (returns ReadableStream of SSE events) ───────

  async sendStreamingMessage(
    message: A2AMessage,
    configuration?: SendMessageConfiguration,
    signal?: AbortSignal,
  ): Promise<ReadableStream<string>> {
    const requestId = `a2a-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const request = {
      jsonrpc: "2.0" as const,
      id: requestId,
      method: A2A_METHODS.SEND_STREAMING_MESSAGE,
      params: { message, configuration },
    };

    const res = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...this.headers,
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!res.ok) {
      throw new Error(`A2A streaming request failed: HTTP ${res.status} ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error("No response body for streaming request");
    }

    return res.body.pipeThrough(new TextDecoderStream());
  }

  // ── Internal RPC Helper ────────────────────────────────────────────

  private async rpc<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
    const fetchParams: FetchJsonRpcParams = {
      url: this.endpointUrl,
      method,
      params,
      headers: this.headers,
      signal,
    };
    const response = await fetchJsonRpc<T>(fetchParams);
    if (response.error) {
      throw new A2ARemoteError(response.error.code, response.error.message, response.error.data);
    }
    return response.result as T;
  }
}

// ── Error Type ───────────────────────────────────────────────────────

export class A2ARemoteError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "A2ARemoteError";
    this.code = code;
    this.data = data;
  }
}
