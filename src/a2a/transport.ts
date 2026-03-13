/**
 * A2A HTTPS transport layer.
 *
 * Handles reading/writing JSON-RPC 2.0 payloads over HTTP(S), including
 * SSE streaming for long-running tasks.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  JSONRPC_VERSION,
  JSON_RPC_ERRORS,
  type JsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type StreamEvent,
} from "./protocol.js";

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

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        resolve({
          ok: false,
          error: {
            code: JSON_RPC_ERRORS.INVALID_REQUEST,
            message: `Request body exceeds maximum size of ${maxBytes} bytes`,
          },
        });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (!raw.trim()) {
          resolve({
            ok: false,
            error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: "Empty request body" },
          });
          return;
        }
        const parsed = JSON.parse(raw) as T;
        resolve({ ok: true, body: parsed });
      } catch {
        resolve({
          ok: false,
          error: { code: JSON_RPC_ERRORS.PARSE_ERROR, message: "Invalid JSON in request body" },
        });
      }
    });

    req.on("error", () => {
      resolve({
        ok: false,
        error: { code: JSON_RPC_ERRORS.INTERNAL_ERROR, message: "Error reading request body" },
      });
    });
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

export type SseWriter = {
  /** Write a named SSE event with JSON data. */
  sendEvent: (event: StreamEvent) => void;
  /** Send the final event and close the stream. */
  close: () => void;
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

  res.on("close", () => {
    closed = true;
  });

  return {
    get closed() {
      return closed;
    },
    sendEvent(event: StreamEvent) {
      if (closed) {
        return;
      }
      const eventName = event.type === "status" ? "status" : "artifact";
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

  const body = (await res.json()) as JsonRpcResponse<T>;
  return body;
}
