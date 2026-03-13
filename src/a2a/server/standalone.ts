/**
 * Standalone A2A server: spins up an HTTP server with the A2A
 * JSON-RPC endpoint and Agent Card, backed by the OpenClaw gateway.
 *
 * Used by `openclaw a2a serve`.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "../../config/config.js";
import { buildGatewayConnectionDetails } from "../../gateway/call.js";
import { GatewayClient } from "../../gateway/client.js";
import { resolveGatewayConnectionAuth } from "../../gateway/connection-auth.js";
import type { EventFrame } from "../../gateway/protocol/index.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../../utils/message-channel.js";
import { A2AServer } from "./a2a-server.js";

export type StandaloneA2AServerOptions = {
  port: number;
  host: string;
  baseUrl?: string;
  agentName?: string;
  agentDescription?: string;
  gatewayUrl?: string;
  gatewayToken?: string;
  streaming?: boolean;
};

type TaskEventListener = {
  onText: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
};

export async function startA2AServer(opts: StandaloneA2AServerOptions): Promise<void> {
  const cfg = loadConfig();
  const connection = buildGatewayConnectionDetails({
    config: cfg,
    url: opts.gatewayUrl,
  });

  const creds = await resolveGatewayConnectionAuth({
    config: cfg,
    explicitAuth: { token: opts.gatewayToken },
    env: process.env,
  });

  // Per-session event listeners keyed by session key. When a gateway event
  // arrives, we route it to the matching listener based on the session key
  // encoded in the event frame.
  const taskListeners = new Map<string, TaskEventListener>();

  let gatewayReady = false;
  let onGatewayReadyResolve!: () => void;
  let onGatewayReadyReject!: (err: Error) => void;
  let gatewayReadySettled = false;
  const gatewayReady$ = new Promise<void>((resolve, reject) => {
    onGatewayReadyResolve = resolve;
    onGatewayReadyReject = reject;
  });

  const gateway = new GatewayClient({
    url: connection.url,
    token: creds.token,
    password: creds.password,
    clientName: GATEWAY_CLIENT_NAMES.CLI,
    clientDisplayName: "A2A",
    clientVersion: "a2a",
    mode: GATEWAY_CLIENT_MODES.CLI,
    onEvent: (evt: EventFrame) => {
      routeGatewayEvent(evt, taskListeners);
    },
    onHelloOk: () => {
      gatewayReady = true;
      if (!gatewayReadySettled) {
        gatewayReadySettled = true;
        onGatewayReadyResolve();
      }
      console.error("[a2a] Connected to gateway");
    },
    onConnectError: (err: Error) => {
      console.error(`[a2a] Gateway connection error: ${err.message}`);
      if (!gatewayReadySettled) {
        gatewayReadySettled = true;
        onGatewayReadyReject(err);
      }
    },
    onClose: (_code: number, reason: string) => {
      console.error(`[a2a] Gateway closed: ${reason}`);
    },
  });

  gateway.start();
  await gatewayReady$;

  const baseUrl =
    opts.baseUrl ?? `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${opts.port}`;

  const a2aServer = new A2AServer({
    baseUrl,
    streaming: opts.streaming ?? true,
    agentCardConfig: {
      name: opts.agentName,
      description: opts.agentDescription,
    },
    dispatchToGateway: ({ text, sessionKey, signal, onText, onDone, onError }) => {
      if (!gatewayReady) {
        onError(new Error("Gateway not connected"));
        return;
      }

      // Register event listener for this session
      taskListeners.set(sessionKey, { onText, onDone, onError });

      signal.addEventListener(
        "abort",
        () => {
          taskListeners.delete(sessionKey);
        },
        { once: true },
      );

      // Send the message to the gateway agent
      gateway
        .request("agent.prompt", {
          sessionKey,
          message: text,
        })
        .then(() => {
          // The request resolves when the gateway acknowledges the prompt.
          // Actual response content arrives via the onEvent callback above.
          // If no events arrive within a timeout, the task stays "working"
          // until the agent finishes or the client cancels.
        })
        .catch((err: unknown) => {
          taskListeners.delete(sessionKey);
          onError(err instanceof Error ? err : new Error(String(err)));
        });
    },
  });

  // Create standalone HTTP server
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    void a2aServer.handleRequest(req, res).then((handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not Found");
      }
    });
  });

  return new Promise<void>((resolve, reject) => {
    httpServer.on("error", (err) => {
      console.error(`[a2a] Server error: ${err.message}`);
      reject(err);
    });

    httpServer.listen(opts.port, opts.host, () => {
      console.error(`[a2a] A2A server listening on ${opts.host}:${opts.port}`);
      console.error(`[a2a] Agent Card:   ${baseUrl}/.well-known/agent.json`);
      console.error(`[a2a] JSON-RPC:     ${baseUrl}/a2a`);
      resolve();
    });

    const shutdown = () => {
      console.error("[a2a] Shutting down...");
      httpServer.close();
      gateway.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}

// ── Event Routing ────────────────────────────────────────────────────

/**
 * Route a gateway event to the appropriate task listener. Events from
 * the gateway carry session/chat metadata that lets us match them to
 * the A2A task that initiated the conversation.
 */
function routeGatewayEvent(evt: EventFrame, listeners: Map<string, TaskEventListener>): void {
  // Gateway events carry session info in different shapes. We try several
  // known fields to extract the session key for routing.
  const sessionKey = extractSessionKey(evt);
  if (!sessionKey) {
    return;
  }

  const listener = listeners.get(sessionKey);
  if (!listener) {
    return;
  }

  const eventType = evt.event ?? (evt as Record<string, unknown>).type;

  if (eventType === "chat" || eventType === "agent") {
    const data = (evt as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const text =
      typeof (evt as Record<string, unknown>).text === "string"
        ? ((evt as Record<string, unknown>).text as string)
        : typeof data?.text === "string"
          ? data.text
          : undefined;

    if (text) {
      listener.onText(text);
    }

    const isDone =
      (evt as Record<string, unknown>).done === true ||
      data?.done === true ||
      data?.type === "message.end" ||
      data?.type === "run.end";

    if (isDone) {
      listeners.delete(sessionKey);
      listener.onDone();
    }

    if (data?.type === "error") {
      listeners.delete(sessionKey);
      const errorMsg = typeof data.message === "string" ? data.message : "Agent error";
      listener.onError(new Error(errorMsg));
    }
  }
}

function extractSessionKey(evt: EventFrame): string | undefined {
  const record = evt as Record<string, unknown>;
  if (typeof record.sessionKey === "string") {
    return record.sessionKey;
  }
  if (typeof record.session === "string") {
    return record.session;
  }
  const data = record.data as Record<string, unknown> | undefined;
  if (data && typeof data.sessionKey === "string") {
    return data.sessionKey;
  }
  return undefined;
}
