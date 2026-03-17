/**
 * MCP server core.
 *
 * Handles MCP lifecycle (initialize, tools/list, tools/call, resources/list,
 * resources/read) and dispatches to registered tool/resource handlers.
 * Communicates with the OpenClaw gateway via the existing callGateway() RPC.
 */
import { loadConfig } from "../config/config.js";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { resolveGatewayConnectionAuth } from "../gateway/connection-auth.js";
import { logDebug, logError } from "../logger.js";
import { VERSION } from "../version.js";
import {
  createJsonRpcErrorResponse,
  createJsonRpcResponse,
  createSseTransport,
  createStdioTransport,
  type SseTransport,
  type StdioTransport,
} from "./protocol.js";
import { getAllResources, getResourceTemplates, readResource } from "./resources.js";
import { getAllTools } from "./tools/index.js";
import {
  McpErrorCode,
  MCP_PROTOCOL_VERSION,
  type JsonRpcMessage,
  type JsonRpcRequest,
  type McpInitializeParams,
  type McpInitializeResult,
  type McpReadResourceParams,
  type McpServerCapabilities,
  type McpToolCallParams,
  type McpToolHandler,
} from "./types.js";

export type McpServerOptions = {
  transport: "stdio" | "sse";
  port?: number;
  host?: string;
  gatewayUrl?: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  verbose?: boolean;
};

type McpGatewayContext = {
  callGateway: <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;
};

/**
 * Build a gateway RPC context that tools can use to call the gateway.
 */
async function buildGatewayContext(opts: McpServerOptions): Promise<McpGatewayContext> {
  const cfg = loadConfig();
  const connection = buildGatewayConnectionDetails({
    config: cfg,
    url: opts.gatewayUrl,
  });
  const gatewayUrlOverrideSource =
    connection.urlSource === "cli --url"
      ? "cli"
      : connection.urlSource === "env OPENCLAW_GATEWAY_URL"
        ? "env"
        : undefined;
  const creds = await resolveGatewayConnectionAuth({
    config: cfg,
    explicitAuth: {
      token: opts.gatewayToken,
      password: opts.gatewayPassword,
    },
    env: process.env,
    urlOverride: gatewayUrlOverrideSource ? connection.url : undefined,
    urlOverrideSource: gatewayUrlOverrideSource,
  });

  return {
    callGateway: async <T = Record<string, unknown>>(
      method: string,
      params?: unknown,
    ): Promise<T> => {
      return callGateway<T>({
        url: connection.url,
        token: creds.token,
        password: creds.password,
        method,
        params,
      });
    },
  };
}

function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return "id" in msg && "method" in msg;
}

function isNotification(msg: JsonRpcMessage): boolean {
  return !("id" in msg) && "method" in msg;
}

export async function serveMcp(opts: McpServerOptions): Promise<void> {
  const verbose = opts.verbose ?? false;
  let initialized = false;
  let gatewayCtx: McpGatewayContext | null = null;
  let toolHandlers: McpToolHandler[] = [];

  // Lazily resolve gateway context and tool handlers on first use
  const ensureContext = async (): Promise<McpGatewayContext> => {
    if (!gatewayCtx) {
      gatewayCtx = await buildGatewayContext(opts);
      toolHandlers = getAllTools(gatewayCtx.callGateway);
    }
    return gatewayCtx;
  };

  const sendResponse: (msg: JsonRpcMessage, sessionId?: string | null) => void = (() => {
    let sender: ((msg: JsonRpcMessage, sessionId?: string | null) => void) | null = null;
    const fn = (msg: JsonRpcMessage, sessionId?: string | null) => {
      if (sender) {
        sender(msg, sessionId);
      }
    };
    (
      fn as unknown as {
        _setSender: (s: (msg: JsonRpcMessage, sessionId?: string | null) => void) => void;
      }
    )._setSender = (s) => {
      sender = s;
    };
    return fn;
  })();

  const handleMessage = async (msg: JsonRpcMessage, sessionId?: string | null) => {
    if (isNotification(msg) && !isRequest(msg)) {
      // Notifications like "notifications/initialized" -- no response needed
      const notification = msg as { method: string };
      if (verbose) {
        logDebug(`[mcp] notification: ${notification.method}`);
      }
      return;
    }

    if (!isRequest(msg)) {
      return;
    }

    const { id, method, params } = msg;

    if (verbose) {
      logDebug(`[mcp] request: ${method} (id=${String(id)})`);
    }

    try {
      switch (method) {
        case "initialize": {
          const initParams = (params ?? {}) as McpInitializeParams;
          if (verbose) {
            logDebug(
              `[mcp] client: ${initParams.clientInfo?.name ?? "unknown"} v${initParams.clientInfo?.version ?? "?"}`,
            );
          }
          const capabilities: McpServerCapabilities = {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
          };
          const result: McpInitializeResult = {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities,
            serverInfo: {
              name: "openclaw-mcp",
              version: VERSION,
            },
          };
          initialized = true;
          sendResponse(createJsonRpcResponse(id, result), sessionId);
          break;
        }

        case "ping": {
          sendResponse(createJsonRpcResponse(id, {}), sessionId);
          break;
        }

        case "tools/list": {
          if (!initialized) {
            sendResponse(
              createJsonRpcErrorResponse(id, -32002, "Server not initialized"),
              sessionId,
            );
            break;
          }
          await ensureContext();
          const definitions = toolHandlers.map((h) => h.definition);
          sendResponse(createJsonRpcResponse(id, { tools: definitions }), sessionId);
          break;
        }

        case "tools/call": {
          if (!initialized) {
            sendResponse(
              createJsonRpcErrorResponse(
                id,
                McpErrorCode.INVALID_REQUEST,
                "Server not initialized. Send initialize first.",
              ),
              sessionId,
            );
            break;
          }
          await ensureContext();
          const callParams = (params ?? {}) as McpToolCallParams;
          const handler = toolHandlers.find((h) => h.definition.name === callParams.name);
          if (!handler) {
            sendResponse(
              createJsonRpcErrorResponse(
                id,
                McpErrorCode.METHOD_NOT_FOUND,
                `Unknown tool: ${callParams.name}`,
              ),
              sessionId,
            );
            break;
          }
          try {
            const result = await handler.execute(callParams.arguments ?? {});
            sendResponse(createJsonRpcResponse(id, result), sessionId);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logError(`[mcp] tool ${callParams.name} failed: ${message}`);
            sendResponse(
              createJsonRpcResponse(id, {
                content: [{ type: "text", text: `Error: ${message}` }],
                isError: true,
              }),
              sessionId,
            );
          }
          break;
        }

        case "resources/list": {
          await ensureContext();
          const resources = await getAllResources(gatewayCtx!.callGateway);
          sendResponse(createJsonRpcResponse(id, { resources }), sessionId);
          break;
        }

        case "resources/templates/list": {
          const templates = getResourceTemplates();
          sendResponse(createJsonRpcResponse(id, { resourceTemplates: templates }), sessionId);
          break;
        }

        case "resources/read": {
          if (!initialized) {
            sendResponse(
              createJsonRpcErrorResponse(
                id,
                McpErrorCode.INVALID_REQUEST,
                "Server not initialized.",
              ),
              sessionId,
            );
            break;
          }
          await ensureContext();
          const readParams = (params ?? {}) as McpReadResourceParams;
          try {
            const result = await readResource(readParams.uri, gatewayCtx!.callGateway);
            sendResponse(createJsonRpcResponse(id, result), sessionId);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            sendResponse(
              createJsonRpcErrorResponse(id, McpErrorCode.INVALID_PARAMS, message),
              sessionId,
            );
          }
          break;
        }

        default: {
          sendResponse(
            createJsonRpcErrorResponse(
              id,
              McpErrorCode.METHOD_NOT_FOUND,
              `Unknown method: ${method}`,
            ),
            sessionId,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(`[mcp] Error handling ${method}: ${message}`);
      sendResponse(createJsonRpcErrorResponse(id, McpErrorCode.INTERNAL_ERROR, message), sessionId);
    }
  };

  if (opts.transport === "stdio") {
    const transport: StdioTransport = createStdioTransport({
      onMessage: (msg) => void handleMessage(msg),
    });
    (
      sendResponse as unknown as {
        _setSender: (s: (msg: JsonRpcMessage, sessionId?: string | null) => void) => void;
      }
    )._setSender((msg) => transport.send(msg));
    transport.start();

    // Keep the process alive until stdin closes
    await new Promise<void>((resolve) => {
      process.stdin.on("end", resolve);
      process.stdin.on("close", resolve);
    });
    transport.close();
  } else {
    const port = opts.port ?? 18790;
    const host = opts.host ?? "127.0.0.1";
    const sseTransport = createSseTransport({
      onMessage: (msg, sessionId) => void handleMessage(msg, sessionId),
      port,
      host,
    }) as SseTransport & {
      send: (msg: JsonRpcMessage, sessionId?: string | null) => void;
      broadcastMessage: (msg: JsonRpcMessage) => void;
    };

    (
      sendResponse as unknown as {
        _setSender: (s: (msg: JsonRpcMessage, sessionId?: string | null) => void) => void;
      }
    )._setSender(sseTransport.send);

    await sseTransport.start();

    // Log to stderr so it does not interfere with stdio protocol
    process.stderr.write(`OpenClaw MCP server (SSE) listening on ${host}:${port}\n`);

    // Keep running until SIGINT/SIGTERM
    await new Promise<void>((resolve) => {
      const shutdown = () => {
        sseTransport.close();
        resolve();
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  }
}
