/**
 * A2A Task Handler: manages task lifecycle (create, query, cancel).
 *
 * Tasks are the stateful unit of work in the A2A protocol. Each task
 * wraps an interaction between the external A2A client and the OpenClaw
 * agent runtime running behind the gateway.
 */

import { randomUUID } from "node:crypto";
import {
  A2A_ERRORS,
  isTerminalState,
  type A2AMessage,
  type Artifact,
  type CancelTaskParams,
  type GetTaskParams,
  type ListTasksParams,
  type ListTasksResult,
  type Part,
  type SendMessageParams,
  type SendMessageResult,
  type Task,
  type TaskState,
  type TextPart,
} from "../protocol.js";
import type { SseWriter } from "../transport.js";

// ── Internal Task Store ──────────────────────────────────────────────

type StoredTask = Task & {
  /** Abort controller for the underlying agent run. */
  abortController: AbortController | null;
  /** SSE writers currently subscribed to this task. */
  subscribers: Set<SseWriter>;
  createdAt: number;
};

const DEFAULT_MAX_TASKS = 10_000;
const DEFAULT_MAX_HISTORY_LENGTH = 100;

export type TaskHandlerDeps = {
  /**
   * Dispatch a user message to the OpenClaw gateway and stream back
   * assistant responses. The handler calls `onText` / `onArtifact` /
   * `onDone` / `onError` callbacks as the agent produces output.
   */
  dispatchToGateway: (params: {
    taskId: string;
    text: string;
    sessionKey: string;
    signal: AbortSignal;
    onText: (text: string) => void;
    onArtifact: (artifact: Artifact) => void;
    onDone: () => void;
    onError: (err: Error) => void;
  }) => void;
  /** Maximum tasks retained in memory (LRU eviction). */
  maxTasks?: number;
};

export class TaskHandler {
  private readonly tasks = new Map<string, StoredTask>();
  private readonly deps: TaskHandlerDeps;
  private readonly maxTasks: number;

  constructor(deps: TaskHandlerDeps) {
    this.deps = deps;
    this.maxTasks = deps.maxTasks ?? DEFAULT_MAX_TASKS;
  }

  // ── Send Message (synchronous response) ────────────────────────────

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const task = this.createTask(params);
    const text = extractTextFromMessage(params.message);

    return new Promise<SendMessageResult>((resolve) => {
      const abortController = new AbortController();
      task.abortController = abortController;

      const collectedParts: Part[] = [];

      this.updateTaskStatus(task, "working");

      this.deps.dispatchToGateway({
        taskId: task.id,
        text,
        sessionKey: task.contextId ?? task.id,
        signal: abortController.signal,
        onText: (chunk) => {
          collectedParts.push({ type: "text", text: chunk } satisfies TextPart);
        },
        onArtifact: (artifact) => {
          if (!task.artifacts) {
            task.artifacts = [];
          }
          task.artifacts.push(artifact);
          this.notifySubscribers(task, {
            type: "artifact",
            taskId: task.id,
            contextId: task.contextId,
            artifact,
          });
        },
        onDone: () => {
          const agentMessage: A2AMessage = {
            role: "agent",
            parts: collectedParts.length > 0 ? collectedParts : [{ type: "text", text: "" }],
          };
          this.updateTaskStatus(task, "completed", agentMessage);
          resolve({ task: this.toExternalTask(task, params.configuration?.historyLength) });
        },
        onError: (err) => {
          const errorMessage: A2AMessage = {
            role: "agent",
            parts: [{ type: "text", text: `Error: ${err.message}` }],
          };
          this.updateTaskStatus(task, "failed", errorMessage);
          resolve({ task: this.toExternalTask(task, params.configuration?.historyLength) });
        },
      });
    });
  }

  // ── Send Streaming Message ─────────────────────────────────────────

  sendStreamingMessage(params: SendMessageParams, sse: SseWriter): void {
    const task = this.createTask(params);
    const text = extractTextFromMessage(params.message);
    const abortController = new AbortController();
    task.abortController = abortController;

    // Register SSE writer as subscriber
    task.subscribers.add(sse);

    // Mark as working
    this.updateTaskStatus(task, "working");

    this.deps.dispatchToGateway({
      taskId: task.id,
      text,
      sessionKey: task.contextId ?? task.id,
      signal: abortController.signal,
      onText: (chunk) => {
        // Stream incremental text as status updates with partial agent messages
        const partialMessage: A2AMessage = {
          role: "agent",
          parts: [{ type: "text", text: chunk }],
        };
        sse.sendEvent({
          type: "status",
          taskId: task.id,
          contextId: task.contextId,
          status: { state: "working", message: partialMessage, timestamp: nowIso() },
        });
      },
      onArtifact: (artifact) => {
        if (!task.artifacts) {
          task.artifacts = [];
        }
        task.artifacts.push(artifact);
        sse.sendEvent({
          type: "artifact",
          taskId: task.id,
          contextId: task.contextId,
          artifact,
        });
      },
      onDone: () => {
        this.updateTaskStatus(task, "completed");
        task.subscribers.delete(sse);
        sse.close();
      },
      onError: (err) => {
        const errorMessage: A2AMessage = {
          role: "agent",
          parts: [{ type: "text", text: `Error: ${err.message}` }],
        };
        this.updateTaskStatus(task, "failed", errorMessage);
        task.subscribers.delete(sse);
        sse.close();
      },
    });
  }

  // ── Get Task ───────────────────────────────────────────────────────

  getTask(
    params: GetTaskParams,
  ): { ok: true; task: Task } | { ok: false; code: number; message: string } {
    const stored = this.tasks.get(params.id);
    if (!stored) {
      return {
        ok: false,
        code: A2A_ERRORS.TASK_NOT_FOUND,
        message: `Task not found: ${params.id}`,
      };
    }
    return { ok: true, task: this.toExternalTask(stored, params.historyLength) };
  }

  // ── List Tasks ─────────────────────────────────────────────────────

  listTasks(params: ListTasksParams): ListTasksResult {
    const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 100);
    let tasks = [...this.tasks.values()];

    // Apply filters
    if (params.contextId) {
      tasks = tasks.filter((t) => t.contextId === params.contextId);
    }
    if (params.status) {
      tasks = tasks.filter((t) => t.status.state === params.status);
    }

    // Sort newest first
    tasks.sort((a, b) => b.createdAt - a.createdAt);

    const totalSize = tasks.length;

    // Pagination via token (offset-based for simplicity)
    const offset = params.pageToken ? Number.parseInt(params.pageToken, 10) || 0 : 0;
    const page = tasks.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const nextPageToken = nextOffset < totalSize ? String(nextOffset) : undefined;

    return {
      tasks: page.map((t) => this.toExternalTask(t, params.historyLength)),
      nextPageToken,
      pageSize: page.length,
      totalSize,
    };
  }

  // ── Cancel Task ────────────────────────────────────────────────────

  cancelTask(
    params: CancelTaskParams,
  ): { ok: true; task: Task } | { ok: false; code: number; message: string } {
    const stored = this.tasks.get(params.id);
    if (!stored) {
      return {
        ok: false,
        code: A2A_ERRORS.TASK_NOT_FOUND,
        message: `Task not found: ${params.id}`,
      };
    }
    if (isTerminalState(stored.status.state)) {
      return {
        ok: false,
        code: A2A_ERRORS.TASK_NOT_CANCELABLE,
        message: `Task ${params.id} is already in terminal state: ${stored.status.state}`,
      };
    }

    stored.abortController?.abort();
    this.updateTaskStatus(stored, "canceled");
    return { ok: true, task: this.toExternalTask(stored) };
  }

  // ── Subscribe to Task (SSE) ────────────────────────────────────────

  /** Check if a task exists and is subscribable (without touching the response). */
  canSubscribeToTask(taskId: string): { ok: true } | { ok: false; code: number; message: string } {
    const stored = this.tasks.get(taskId);
    if (!stored) {
      return {
        ok: false,
        code: A2A_ERRORS.TASK_NOT_FOUND,
        message: `Task not found: ${taskId}`,
      };
    }
    return { ok: true };
  }

  subscribeToTask(
    params: { id: string },
    sse: SseWriter,
  ): { ok: true } | { ok: false; code: number; message: string } {
    const stored = this.tasks.get(params.id);
    if (!stored) {
      return {
        ok: false,
        code: A2A_ERRORS.TASK_NOT_FOUND,
        message: `Task not found: ${params.id}`,
      };
    }

    // If already terminal, send final status and close
    if (isTerminalState(stored.status.state)) {
      sse.sendEvent({
        type: "status",
        taskId: stored.id,
        contextId: stored.contextId,
        status: stored.status,
      });
      sse.close();
      return { ok: true };
    }

    // Remove this writer from subscribers when the stream closes (explicit close or client disconnect).
    sse.addCloseListener(() => stored.subscribers.delete(sse));
    stored.subscribers.add(sse);

    return { ok: true };
  }

  // ── Internals ──────────────────────────────────────────────────────

  private createTask(params: SendMessageParams): StoredTask {
    this.evictOldTasks();

    const task: StoredTask = {
      id: randomUUID(),
      contextId: params.message.messageId ?? undefined,
      status: { state: "submitted", timestamp: nowIso() },
      history: [params.message],
      artifacts: [],
      metadata: params.metadata,
      abortController: null,
      subscribers: new Set(),
      createdAt: Date.now(),
    };

    this.tasks.set(task.id, task);
    return task;
  }

  private updateTaskStatus(task: StoredTask, state: TaskState, message?: A2AMessage): void {
    task.status = { state, message, timestamp: nowIso() };
    if (message) {
      if (!task.history) {
        task.history = [];
      }
      task.history.push(message);
    }
    this.notifySubscribers(task, {
      type: "status",
      taskId: task.id,
      contextId: task.contextId,
      status: task.status,
    });
  }

  private notifySubscribers(task: StoredTask, event: import("../protocol.js").StreamEvent): void {
    for (const subscriber of task.subscribers) {
      if (subscriber.closed) {
        task.subscribers.delete(subscriber);
        continue;
      }
      subscriber.sendEvent(event);
    }
  }

  private toExternalTask(stored: StoredTask, historyLength?: number): Task {
    const task: Task = {
      id: stored.id,
      contextId: stored.contextId,
      status: stored.status,
      artifacts: stored.artifacts?.length ? stored.artifacts : undefined,
      metadata: stored.metadata,
    };

    // Include history based on requested length
    if (historyLength !== 0 && stored.history?.length) {
      const limit = historyLength ?? DEFAULT_MAX_HISTORY_LENGTH;
      task.history = stored.history.slice(-limit);
    }

    return task;
  }

  private evictOldTasks(): void {
    if (this.tasks.size < this.maxTasks) {
      return;
    }
    const entries = [...this.tasks.entries()].toSorted((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [id, task] of entries) {
      if (this.tasks.size < this.maxTasks) {
        break;
      }
      if (isTerminalState(task.status.state)) {
        this.tasks.delete(id);
      }
    }
    if (this.tasks.size < this.maxTasks) {
      return;
    }
    for (const [id, task] of entries) {
      if (this.tasks.size < this.maxTasks) {
        break;
      }
      if (!isTerminalState(task.status.state)) {
        task.abortController?.abort();
        this.updateTaskStatus(task, "failed", {
          role: "agent",
          parts: [{ type: "text", text: "Task evicted due to resource limits." }],
        });
        for (const s of task.subscribers) {
          s.close();
        }
        this.tasks.delete(id);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractTextFromMessage(message: A2AMessage): string {
  const textParts = message.parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text);
  return textParts.join("\n") || "";
}

function nowIso(): string {
  return new Date().toISOString();
}
