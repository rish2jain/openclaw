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

  /**
   * Handle a tasks/subscribe request. Opens an SSE stream for an
   * existing task and streams updates until the task completes or
   * the client disconnects.
   */
  handleTaskSubscription(
    taskId: string,
    res: ServerResponse,
  ): { ok: true } | { ok: false; code: number; message: string } {
    const sse = initSseStream(res);
    return this.taskHandler.subscribeToTask({ id: taskId }, sse);
  }
}
