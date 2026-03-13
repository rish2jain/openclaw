/**
 * A2A HTTPS transport layer.
 *
 * Handles reading/writing JSON-RPC 2.0 payloads over HTTP(S), including
 * SSE streaming for long-running tasks.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  JSONRPC_VERSION,
  JSON_RPC_ERRORS,
  type JsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type StreamEvent,
} from "./protocol.js";

const log = createSubsystemLogger("a2a:transport");

// ── Constants ────────────────────────────────────────────────────────

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const CONTENT_TYPE_JSON = "application/json; charset=utf-8";
const CONTENT_TYPE_SSE = "text/event-stream";

// ── Request Body Parsing ─────────────────────────────────────────────

export async function readJsonBody<T = unknown>(
  req: IncomingMessage,
  maxBytes = MAX_REQUEST_BODY_BYTES,
): Promise<{ ok: true; body: T } | { ok: false; error: JsonRpcError }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let resolved = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };

    const finish = (result: { ok: true; body: T } | { ok: false; error: JsonRpcError }) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(result);
    };

    const onData = (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        finish({
          ok: false,
          error: {
            code: JSON_RPC_ERRORS.INVALID_REQUEST,
            message: `Request body exceeds maximum size of ${maxBytes} bytes`,
          },
        });
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (!raw.trim()) {
          finish({
            ok: false,
            error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: "Empty request body" },
          });
          return;
        }
        const parsed = JSON.parse(raw) as T;
        finish({ ok: true, body: parsed });
      } catch {
        finish({
          ok: false,
          error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: "Invalid JSON in request body" },
        });
      }
    };

    const onError = () => {
      finish({
        ok: false,
        error: { code: JSON_RPC_ERRORS.INTERNAL_ERROR, message: "Error reading request body" },
      });
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

// ── JSON-RPC Response Helpers ────────────────────────────────────────

export function sendJsonRpcResult(
  res: ServerResponse,
  id: string | number | null,
  result: unknown,
): void {
  const response: JsonRpcResponse = {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
  res.setHeader("Content-Type", CONTENT_TYPE_JSON);
  res.statusCode = 200;
  res.end(JSON.stringify(response));
}

export function sendJsonRpcError(
  res: ServerResponse,
  id: string | number | null,
  error: JsonRpcError,
  httpStatus = 200,
): void {
  const response: JsonRpcResponse = {
    jsonrpc: JSONRPC_VERSION,
    id,
    error,
  };
  res.setHeader("Content-Type", CONTENT_TYPE_JSON);
  res.statusCode = httpStatus;
  res.end(JSON.stringify(response));
}

// ── JSON-RPC Request Validation ──────────────────────────────────────

export function validateJsonRpcRequest(
  body: unknown,
): { ok: true; request: JsonRpcRequest } | { ok: false; error: JsonRpcError } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: { code: JSON_RPC_ERRORS.INVALID_REQUEST, message: "Request must be a JSON object" },
    };
  }

  const obj = body as Record<string, unknown>;

  if (obj.jsonrpc !== JSONRPC_VERSION) {
    return {
      ok: false,
      error: {
        code: JSON_RPC_ERRORS.INVALID_REQUEST,
        message: `jsonrpc must be "${JSONRPC_VERSION}"`,
      },
    };
  }

  if (obj.id === undefined || obj.id === null) {
    return {
      ok: false,
      error: { code: JSON_RPC_ERRORS.INVALID_REQUEST, message: "Request id is required" },
    };
  }

  if (typeof obj.method !== "string" || !obj.method.trim()) {
    return {
      ok: false,
      error: {
        code: JSON_RPC_ERRORS.INVALID_REQUEST,
        message: "method must be a non-empty string",
      },
    };
  }

  return {
    ok: true,
    request: {
      jsonrpc: JSONRPC_VERSION,
      id: obj.id as string | number,
      method: obj.method,
      params: obj.params,
    },
  };
}

// ── SSE Streaming ────────────────────────────────────────────────────

/** SSE event names for known StreamEvent types; unexpected types are passed through and logged. */
const KNOWN_STREAM_EVENT_TYPES = ["status", "artifact"] as const;

function eventNameForStreamEvent(event: StreamEvent): string {
  const t = event.type;
  if (KNOWN_STREAM_EVENT_TYPES.includes(t)) {
    return t;
  }
  log.warn("sendEvent: unexpected stream event type, using as-is", { type: t });
  return typeof t === "string" ? t : "unknown";
}

export type SseWriter = {
  /** Write a named SSE event with JSON data. */
  sendEvent: (event: StreamEvent) => void;
  /** Send the final event and close the stream. */
  close: () => void;
  /** Register a callback to run once when the stream closes (explicit close or client disconnect). */
  addCloseListener: (cb: () => void) => void;
  /** Whether the client has disconnected. */
  closed: boolean;
};

export function initSseStream(res: ServerResponse): SseWriter {
  res.setHeader("Content-Type", CONTENT_TYPE_SSE);
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx buffering bypass
  res.statusCode = 200;
  // Flush headers immediately so clients can start reading.
  res.flushHeaders();

  let closed = false;
  const closeListeners: Array<() => void> = [];

  function runCloseListeners(): void {
    for (const cb of closeListeners) {
      try {
        cb();
      } catch {
        // Don't let one listener break others
      }
    }
    closeListeners.length = 0;
  }

  res.on("close", () => {
    if (closed) {
      return;
    }
    closed = true;
    runCloseListeners();
  });

  return {
    get closed() {
      return closed;
    },
    sendEvent(event: StreamEvent) {
      if (closed) {
        return;
      }
      const eventName = eventNameForStreamEvent(event);
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    close() {
      if (closed) {
        return;
      }
      closed = true;
      res.write("event: done\ndata: {}\n\n");
      res.end();
      runCloseListeners();
    },
    addCloseListener(cb: () => void) {
      if (closed) {
        cb();
        return;
      }
      closeListeners.push(cb);
    },
  };
}

// ── HTTP Fetch Helper (client-side) ──────────────────────────────────

export type FetchJsonRpcParams = {
  url: string;
  method: string;
  params?: unknown;
  id?: string | number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function fetchJsonRpc<T = unknown>(
  opts: FetchJsonRpcParams,
): Promise<JsonRpcResponse<T>> {
  const requestId = opts.id ?? `a2a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const request: JsonRpcRequest = {
    jsonrpc: JSONRPC_VERSION,
    id: requestId,
    method: opts.method,
    params: opts.params,
  };

  const res = await fetch(opts.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
    body: JSON.stringify(request),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`A2A request failed: HTTP ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("A2A response is not a JSON object");
  }
  const body = raw as Record<string, unknown>;
  if (body.jsonrpc !== JSONRPC_VERSION) {
    throw new Error(
      `A2A response invalid: jsonrpc must be "${JSONRPC_VERSION}" (got ${JSON.stringify(body.jsonrpc)})`,
    );
  }
  if (body.id !== requestId) {
    throw new Error(
      `A2A response invalid: id must match request (expected ${JSON.stringify(requestId)}, got ${JSON.stringify(body.id)})`,
    );
  }
  const hasResult = "result" in body;
  const hasError = "error" in body && body.error !== undefined;
  if (hasResult && hasError) {
    throw new Error("A2A response invalid: must not contain both result and error");
  }
  if (!hasResult && !hasError) {
    throw new Error("A2A response invalid: must contain result or error");
  }
  if (hasError) {
    const err = body.error as Record<string, unknown>;
    if (err === null || typeof err !== "object" || Array.isArray(err)) {
      throw new Error("A2A response invalid: error must be an object");
    }
    if (typeof err.code !== "number") {
      throw new Error(`A2A response invalid: error.code must be a number (got ${typeof err.code})`);
    }
    if (typeof err.message !== "string") {
      throw new Error(
        `A2A response invalid: error.message must be a string (got ${typeof err.message})`,
      );
    }
  }
  return body as JsonRpcResponse<T>;
}
