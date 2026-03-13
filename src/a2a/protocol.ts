/**
 * A2A (Agent2Agent) protocol types and JSON-RPC 2.0 message schemas.
 *
 * Based on the A2A protocol specification (v0.3.x / latest).
 * @see https://a2a-protocol.org/latest/specification/
 */

// ── JSON-RPC 2.0 Foundation ─────────────────────────────────────────

export const JSONRPC_VERSION = "2.0" as const;

export type JsonRpcRequest<TMethod extends string = string, TParams = unknown> = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number;
  method: TMethod;
  params?: TParams;
};

export type JsonRpcResponse<TResult = unknown> = {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number | null;
  result?: TResult;
  error?: JsonRpcError;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

// ── Standard JSON-RPC Error Codes ────────────────────────────────────

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ── A2A-Specific Error Codes ─────────────────────────────────────────

export const A2A_ERRORS = {
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  UNSUPPORTED_OPERATION: -32003,
  CONTENT_TYPE_NOT_SUPPORTED: -32004,
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32005,
  INVALID_AGENT_CARD: -32006,
} as const;

// ── Task States ──────────────────────────────────────────────────────

export const TASK_STATES = [
  "submitted",
  "working",
  "input-required",
  "auth-required",
  "completed",
  "failed",
  "canceled",
  "rejected",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

const TERMINAL_STATES = new Set<TaskState>(["completed", "failed", "canceled", "rejected"]);

export function isTerminalState(state: TaskState): boolean {
  return TERMINAL_STATES.has(state);
}

// ── Parts (content units inside Messages and Artifacts) ──────────────

export type TextPart = {
  type: "text";
  text: string;
  metadata?: Record<string, unknown>;
};

export type FilePart = {
  type: "file";
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string; // base64
    uri?: string;
  };
  metadata?: Record<string, unknown>;
};

export type DataPart = {
  type: "data";
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type Part = TextPart | FilePart | DataPart;

// ── Messages ─────────────────────────────────────────────────────────

export type MessageRole = "user" | "agent";

export type A2AMessage = {
  messageId?: string;
  role: MessageRole;
  parts: Part[];
  metadata?: Record<string, unknown>;
  referenceTaskIds?: string[];
  extensions?: string[];
};

// ── Artifacts ────────────────────────────────────────────────────────

export type Artifact = {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
};

// ── Task Status ──────────────────────────────────────────────────────

export type TaskStatus = {
  state: TaskState;
  message?: A2AMessage;
  timestamp?: string; // ISO 8601
};

// ── Task ─────────────────────────────────────────────────────────────

export type Task = {
  id: string;
  contextId?: string;
  status: TaskStatus;
  artifacts?: Artifact[];
  history?: A2AMessage[];
  metadata?: Record<string, unknown>;
};

// ── Push Notification Config ─────────────────────────────────────────

export type AuthenticationInfo = {
  scheme: string;
  credentials?: string;
};

export type TaskPushNotificationConfig = {
  id?: string;
  taskId?: string;
  url: string;
  token?: string;
  authentication?: AuthenticationInfo;
};

// ── Send Message Configuration ───────────────────────────────────────

export type SendMessageConfiguration = {
  acceptedOutputModes?: string[];
  pushNotificationConfig?: TaskPushNotificationConfig;
  historyLength?: number;
  returnImmediately?: boolean;
};

// ── JSON-RPC Method Params & Results ─────────────────────────────────

export type SendMessageParams = {
  message: A2AMessage;
  configuration?: SendMessageConfiguration;
  metadata?: Record<string, unknown>;
};

export type SendMessageResult = {
  task?: Task;
  message?: A2AMessage;
};

export type GetTaskParams = {
  id: string;
  historyLength?: number;
};

export type ListTasksParams = {
  contextId?: string;
  status?: TaskState;
  pageSize?: number;
  pageToken?: string;
  historyLength?: number;
  includeArtifacts?: boolean;
};

export type ListTasksResult = {
  tasks: Task[];
  nextPageToken?: string;
  pageSize: number;
  totalSize: number;
};

export type CancelTaskParams = {
  id: string;
};

export type SubscribeToTaskParams = {
  id: string;
};

// ── Streaming Events ─────────────────────────────────────────────────

export type TaskStatusUpdateEvent = {
  type: "status";
  taskId: string;
  contextId?: string;
  status: TaskStatus;
  metadata?: Record<string, unknown>;
};

export type TaskArtifactUpdateEvent = {
  type: "artifact";
  taskId: string;
  contextId?: string;
  artifact: Artifact;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
};

export type StreamEvent = TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

// ── JSON-RPC Method Names ────────────────────────────────────────────

export const A2A_METHODS = {
  SEND_MESSAGE: "message/send",
  SEND_STREAMING_MESSAGE: "message/stream",
  GET_TASK: "tasks/get",
  LIST_TASKS: "tasks/list",
  CANCEL_TASK: "tasks/cancel",
  SUBSCRIBE_TO_TASK: "tasks/subscribe",
  GET_AGENT_CARD: "agent/card",
} as const;

export type A2AMethod = (typeof A2A_METHODS)[keyof typeof A2A_METHODS];

// ── A2A Protocol Version ─────────────────────────────────────────────

export const A2A_PROTOCOL_VERSION = "0.3" as const;
