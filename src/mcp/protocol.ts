/**
 * MCP JSON-RPC transport layer.
 *
 * Supports two transport modes:
 * - stdio: reads newline-delimited JSON from stdin, writes to stdout
 * - SSE: HTTP server with Server-Sent Events for server->client, POST for client->server
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import { logDebug, logError } from "../logger.js";
import type { JsonRpcMessage, JsonRpcResponse } from "./types.js";

// -- Message parsing --

export function parseJsonRpcMessage(raw: string): JsonRpcMessage | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.jsonrpc !== "2.0") {
      return null;
    }
    return parsed as unknown as JsonRpcMessage;
  } catch {
    return null;
  }
}

export function serializeJsonRpcMessage(msg: JsonRpcMessage): string {
  return JSON.stringify(msg);
}

// -- Stdio transport --

export type StdioTransportOptions = {
  onMessage: (msg: JsonRpcMessage) => void;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

export type StdioTransport = {
  start: () => void;
  send: (msg: JsonRpcMessage) => void;
  close: () => void;
};

export function createStdioTransport(opts: StdioTransportOptions): StdioTransport {
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;
  let rl: ReadlineInterface | null = null;

  const start = () => {
    rl = createInterface({ input, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      const msg = parseJsonRpcMessage(trimmed);
      if (msg) {
        opts.onMessage(msg);
      } else {
        logDebug(`[mcp] Ignoring invalid JSON-RPC message: ${trimmed.slice(0, 120)}`);
      }
    });
    rl.on("close", () => {
      logDebug("[mcp] stdin closed");
    });
  };

  const send = (msg: JsonRpcMessage) => {
    const serialized = serializeJsonRpcMessage(msg);
    output.write(serialized + "\n");
  };

  const close = () => {
    rl?.close();
    rl = null;
  };

  return { start, send, close };
}

// -- SSE transport --

/** Max request body size to avoid DoS from unbounded accumulation. */
const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB

export type SseTransportOptions = {
  /** sessionId is set for SSE when the message came from a POST with ?sessionId= */
  onMessage: (msg: JsonRpcMessage, sessionId?: string) => void;
  port: number;
  host?: string;
};

export type SseTransport = {
  start: () => Promise<void>;
  close: () => void;
};

type SseClient = {
  id: string;
  res: ServerResponse;
};

export function createSseTransport(opts: SseTransportOptions): SseTransport {
  let server: Server | null = null;
  const clients = new Map<string, SseClient>();
  let clientCounter = 0;

  const broadcastMessage = (msg: JsonRpcMessage) => {
    const data = serializeJsonRpcMessage(msg);
    for (const client of clients.values()) {
      client.res.write(`data: ${data}\n\n`);
    }
  };

  const sendToClient = (sessionId: string, msg: JsonRpcMessage) => {
    const client = clients.get(sessionId);
    if (client) {
      client.res.write(`data: ${serializeJsonRpcMessage(msg)}\n\n`);
    }
  };

  const handleSseConnection = (req: IncomingMessage, res: ServerResponse) => {
    const clientId = String(++clientCounter);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    // Send the endpoint URI so the client knows where to POST messages
    res.write(`event: endpoint\ndata: /message?sessionId=${clientId}\n\n`);

    const client: SseClient = { id: clientId, res };
    clients.set(clientId, client);

    req.on("close", () => {
      clients.delete(clientId);
    });
  };

  const handlePostMessage = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const sessionId = url.searchParams.get("sessionId");

    const chunks: Buffer[] = [];
    let totalLength = 0;
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      totalLength += buf.length;
      if (totalLength > MAX_BODY_BYTES) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload Too Large" }));
        req.destroy();
        return;
      }
      chunks.push(buf);
    }

    const body = Buffer.concat(chunks).toString("utf-8");
    const msg = parseJsonRpcMessage(body);
    if (!msg) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON-RPC message" }));
      return;
    }
    opts.onMessage(msg, sessionId ?? undefined);

    // For requests (with id), the response will be sent via SSE.
    // For notifications (no id), just acknowledge.
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accepted: true }));
  };

  const start = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }

        if (url.pathname === "/sse" && req.method === "GET") {
          handleSseConnection(req, res);
          return;
        }

        if (url.pathname === "/message" && req.method === "POST") {
          void handlePostMessage(req, res);
          return;
        }

        // Health check endpoint
        if (url.pathname === "/health" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", clients: clients.size }));
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      });

      server.on("error", (err) => {
        logError(`[mcp] SSE server error: ${err.message}`);
        reject(err);
      });

      const host = opts.host ?? "127.0.0.1";
      server.listen(opts.port, host, () => {
        logDebug(`[mcp] SSE transport listening on ${host}:${opts.port}`);
        resolve();
      });
    });
  };

  /** Send to one client when sessionId is set; otherwise broadcast. Use for request responses. */
  const send = (msg: JsonRpcMessage, sessionId?: string | null) => {
    if (sessionId) {
      sendToClient(sessionId, msg);
    } else {
      broadcastMessage(msg);
    }
  };

  const transport: SseTransport & {
    send: (msg: JsonRpcMessage, sessionId?: string | null) => void;
    broadcastMessage: (msg: JsonRpcMessage) => void;
  } = {
    start,
    close: () => {
      for (const client of clients.values()) {
        client.res.end();
      }
      clients.clear();
      server?.close();
      server = null;
    },
    send,
    broadcastMessage,
  };

  return transport;
}

/**
 * Helper to create a JSON-RPC success response.
 */
export function createJsonRpcResponse(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

/**
 * Helper to create a JSON-RPC error response.
 */
export function createJsonRpcErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}
