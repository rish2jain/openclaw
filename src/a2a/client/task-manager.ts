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

/** Max time (ms) to wait for each read during the initial SSE peek; prevents hang on slow networks. */
const PEEK_READ_TIMEOUT_MS = 15_000;

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
    const params: GetTaskParams = { id, ...(historyLength !== undefined && { historyLength }) };
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

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      throw new Error(
        `A2A streaming response must be text/event-stream; got Content-Type: ${contentType}`,
      );
    }

    if (!res.body) {
      throw new Error("No response body for streaming request");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const maxPeek = 8192;
    let peeked = "";
    let totalPeeked = 0;
    while (totalPeeked < maxPeek) {
      let timerId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error(`A2A stream peek timed out after ${PEEK_READ_TIMEOUT_MS}ms`)),
          PEEK_READ_TIMEOUT_MS,
        );
      });
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        const result = await Promise.race([reader.read(), timeoutPromise]);
        clearTimeout(timerId);
        done = result.done;
        value = result.value;
      } catch (err) {
        clearTimeout(timerId);
        reader.cancel().catch(() => {});
        throw err instanceof Error ? err : new Error(String(err));
      }
      if (done) {
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      peeked += chunk;
      totalPeeked += value!.byteLength;
      if (peeked.includes("\n\n")) {
        break;
      }
    }

    const firstEventEnd = peeked.indexOf("\n\n");
    if (firstEventEnd !== -1) {
      const firstEvent = peeked.slice(0, firstEventEnd + 2);
      const dataLine = firstEvent.split("\n").find((line) => line.startsWith("data:"));
      if (dataLine) {
        const jsonStr = dataLine.slice(5).trim();
        try {
          const data = JSON.parse(jsonStr) as {
            error?: { code?: number; message?: string; data?: unknown };
          };
          if (data?.error && typeof data.error === "object") {
            const { code, message, data: errData } = data.error;
            throw new A2ARemoteError(
              typeof code === "number" ? code : -32603,
              typeof message === "string" ? message : "JSON-RPC error in SSE stream",
              errData,
            );
          }
        } catch (err) {
          if (err instanceof A2ARemoteError) {
            throw err;
          }
          // Not JSON or not an error payload; pass through
        }
      }
    }

    const restReader = reader;
    // Use a fresh decoder for the rest of the stream so the peek decoder's
    // buffered state (from stream: true) does not corrupt multi-byte decoding.
    const streamDecoder = new TextDecoder();
    return new ReadableStream<string>({
      async pull(controller) {
        if (peeked.length > 0) {
          controller.enqueue(peeked);
          peeked = "";
          return;
        }
        const { done, value } = await restReader.read();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(streamDecoder.decode(value, { stream: true }));
      },
    });
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
    if (response.result === null || response.result === undefined) {
      throw new A2ARemoteError(-32603, "Malformed JSON-RPC response: missing result", undefined);
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
