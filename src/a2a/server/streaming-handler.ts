/**
 * A2A Streaming Handler: SSE streaming support for long-running tasks.
 *
 * This module wraps the SSE transport primitives from transport.ts and
 * wires them to the TaskHandler for streaming message and task
 * subscription operations.
 */

import type { ServerResponse } from "node:http";
import type { SendMessageParams } from "../protocol.js";
import { initSseStream } from "../transport.js";
import type { TaskHandler } from "./task-handler.js";

export type StreamingHandlerDeps = {
  taskHandler: TaskHandler;
};

export class StreamingHandler {
  private readonly taskHandler: TaskHandler;

  constructor(deps: StreamingHandlerDeps) {
    this.taskHandler = deps.taskHandler;
  }

  /**
   * Handle a streaming message/send request. Opens an SSE stream on `res`
   * and streams task status and artifact updates until the task reaches
   * a terminal state.
   */
  handleStreamingMessage(params: SendMessageParams, res: ServerResponse): void {
    const sse = initSseStream(res);
    this.taskHandler.sendStreamingMessage(params, sse);
  }

  /** Check if a task exists and is subscribable (call before initSseStream). */
  canSubscribe(taskId: string): { ok: true } | { ok: false; code: number; message: string } {
    return this.taskHandler.canSubscribeToTask(taskId);
  }

  /**
   * Handle a tasks/subscribe request. Validates the task first; only
   * opens the SSE stream after validation so errors can be sent. Then
   * streams updates until the task completes or the client disconnects.
   */
  handleTaskSubscription(
    taskId: string,
    res: ServerResponse,
  ): { ok: true } | { ok: false; code: number; message: string } {
    const pre = this.taskHandler.canSubscribeToTask(taskId);
    if (!pre.ok) {
      return pre;
    }
    const sse = initSseStream(res);
    return this.taskHandler.subscribeToTask({ id: taskId }, sse);
  }
}
