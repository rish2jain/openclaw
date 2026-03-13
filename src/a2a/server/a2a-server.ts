/**
 * A2A HTTP Server: handles incoming A2A JSON-RPC requests and serves
 * the Agent Card at /.well-known/agent.json.
 *
 * Designed to be mounted as a request stage inside the OpenClaw gateway
 * HTTP server, following the same pattern as the OpenAI-compatible
 * endpoints and the hooks handler.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildAgentCard,
  type A2AAgentCardConfig,
  type AgentCard,
  type SecurityScheme,
} from "../agent-card.js";
import {
  A2A_METHODS,
  JSON_RPC_ERRORS,
  type CancelTaskParams,
  type GetTaskParams,
  type ListTasksParams,
  type SendMessageParams,
  type SubscribeToTaskParams,
} from "../protocol.js";
import {
  readJsonBody,
  sendJsonRpcError,
  sendJsonRpcResult,
  validateJsonRpcRequest,
} from "../transport.js";
import { StreamingHandler } from "./streaming-handler.js";
import { TaskHandler, type TaskHandlerDeps } from "./task-handler.js";

// ── Server Options ───────────────────────────────────────────────────

export type A2AServerOptions = {
  /** Base URL used for the Agent Card interface endpoint. */
  baseUrl: string;
  /** Agent Card configuration overrides. */
  agentCardConfig?: A2AAgentCardConfig;
  /** Auth scheme to advertise in the Agent Card. */
  authScheme?: SecurityScheme;
  /** Whether streaming is enabled. */
  streaming?: boolean;
  /** Function to authenticate incoming requests. Returns true if authorized. */
  authenticate?: (req: IncomingMessage) => Promise<boolean> | boolean;
  /** Gateway dispatch function wired to the task handler. */
  dispatchToGateway: TaskHandlerDeps["dispatchToGateway"];
  /** Maximum in-memory tasks. */
  maxTasks?: number;
};

// ── A2A Server ───────────────────────────────────────────────────────

export class A2AServer {
  private readonly agentCard: AgentCard;
  private readonly agentCardJson: string;
  private readonly taskHandler: TaskHandler;
  private readonly streamingHandler: StreamingHandler;
  private readonly authenticate: ((req: IncomingMessage) => Promise<boolean> | boolean) | undefined;

  constructor(opts: A2AServerOptions) {
    const streaming = opts.streaming ?? true;

    this.agentCard = buildAgentCard({
      baseUrl: opts.baseUrl,
      config: opts.agentCardConfig,
      streaming,
      authScheme: opts.authScheme,
    });
    this.agentCardJson = JSON.stringify(this.agentCard, null, 2);

    this.taskHandler = new TaskHandler({
      dispatchToGateway: opts.dispatchToGateway,
      maxTasks: opts.maxTasks,
    });

    this.streamingHandler = new StreamingHandler({
      taskHandler: this.taskHandler,
    });

    this.authenticate = opts.authenticate;
  }

  /**
   * Handle an incoming HTTP request. Returns `true` if the request was
   * handled (matched an A2A route), `false` otherwise.
   *
   * This signature matches the GatewayHttpRequestStage pattern used by
   * the gateway HTTP server.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();

    // ── Agent Card endpoint ──────────────────────────────────────────
    if (pathname === "/.well-known/agent.json") {
      if (method !== "GET" && method !== "HEAD") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET, HEAD");
        res.end("Method Not Allowed");
        return true;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.statusCode = 200;
      res.end(method === "HEAD" ? "" : this.agentCardJson);
      return true;
    }

    // ── A2A JSON-RPC endpoint ────────────────────────────────────────
    if (pathname === "/a2a") {
      if (method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.end("Method Not Allowed");
        return true;
      }

      // Auth check
      if (this.authenticate) {
        const authorized = await this.authenticate(req);
        if (!authorized) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Unauthorized");
          return true;
        }
      }

      await this.handleJsonRpc(req, res);
      return true;
    }

    return false;
  }

  /** Expose the computed agent card for programmatic use. */
  getAgentCard(): AgentCard {
    return this.agentCard;
  }

  // ── JSON-RPC Router ────────────────────────────────────────────────

  private async handleJsonRpc(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const bodyResult = await readJsonBody(req);
    if (!bodyResult.ok) {
      sendJsonRpcError(res, null, bodyResult.error);
      return;
    }

    const validation = validateJsonRpcRequest(bodyResult.body);
    if (!validation.ok) {
      sendJsonRpcError(res, null, validation.error);
      return;
    }

    const rpcReq = validation.request;

    switch (rpcReq.method) {
      case A2A_METHODS.SEND_MESSAGE:
        await this.handleSendMessage(rpcReq.id, rpcReq.params as SendMessageParams, res);
        break;

      case A2A_METHODS.SEND_STREAMING_MESSAGE:
        this.handleStreamingMessage(rpcReq.params as SendMessageParams, res);
        break;

      case A2A_METHODS.GET_TASK:
        this.handleGetTask(rpcReq.id, rpcReq.params as GetTaskParams, res);
        break;

      case A2A_METHODS.LIST_TASKS:
        this.handleListTasks(rpcReq.id, rpcReq.params as ListTasksParams, res);
        break;

      case A2A_METHODS.CANCEL_TASK:
        this.handleCancelTask(rpcReq.id, rpcReq.params as CancelTaskParams, res);
        break;

      case A2A_METHODS.SUBSCRIBE_TO_TASK:
        this.handleSubscribeToTask(rpcReq.params as SubscribeToTaskParams, res);
        break;

      case A2A_METHODS.GET_AGENT_CARD:
        sendJsonRpcResult(res, rpcReq.id, this.agentCard);
        break;

      default:
        sendJsonRpcError(res, rpcReq.id, {
          code: JSON_RPC_ERRORS.METHOD_NOT_FOUND,
          message: `Unknown method: ${rpcReq.method}`,
        });
    }
  }

  // ── Method Handlers ────────────────────────────────────────────────

  private async handleSendMessage(
    id: string | number,
    params: SendMessageParams,
    res: ServerResponse,
  ): Promise<void> {
    if (!params?.message?.parts?.length) {
      sendJsonRpcError(res, id, {
        code: JSON_RPC_ERRORS.INVALID_PARAMS,
        message: "message.parts is required and must be non-empty",
      });
      return;
    }
    const result = await this.taskHandler.sendMessage(params);
    sendJsonRpcResult(res, id, result);
  }

  private handleStreamingMessage(params: SendMessageParams, res: ServerResponse): void {
    if (!params?.message?.parts?.length) {
      sendJsonRpcError(res, null, {
        code: JSON_RPC_ERRORS.INVALID_PARAMS,
        message: "message.parts is required and must be non-empty",
      });
      return;
    }
    this.streamingHandler.handleStreamingMessage(params, res);
  }

  private handleGetTask(id: string | number, params: GetTaskParams, res: ServerResponse): void {
    if (!params?.id) {
      sendJsonRpcError(res, id, {
        code: JSON_RPC_ERRORS.INVALID_PARAMS,
        message: "Task id is required",
      });
      return;
    }
    const result = this.taskHandler.getTask(params);
    if (result.ok) {
      sendJsonRpcResult(res, id, result.task);
    } else {
      sendJsonRpcError(res, id, { code: result.code, message: result.message });
    }
  }

  private handleListTasks(id: string | number, params: ListTasksParams, res: ServerResponse): void {
    const result = this.taskHandler.listTasks(params ?? {});
    sendJsonRpcResult(res, id, result);
  }

  private handleCancelTask(
    id: string | number,
    params: CancelTaskParams,
    res: ServerResponse,
  ): void {
    if (!params?.id) {
      sendJsonRpcError(res, id, {
        code: JSON_RPC_ERRORS.INVALID_PARAMS,
        message: "Task id is required",
      });
      return;
    }
    const result = this.taskHandler.cancelTask(params);
    if (result.ok) {
      sendJsonRpcResult(res, id, result.task);
    } else {
      sendJsonRpcError(res, id, { code: result.code, message: result.message });
    }
  }

  private handleSubscribeToTask(params: SubscribeToTaskParams, res: ServerResponse): void {
    if (!params?.id) {
      sendJsonRpcError(res, null, {
        code: JSON_RPC_ERRORS.INVALID_PARAMS,
        message: "Task id is required",
      });
      return;
    }
    const can = this.streamingHandler.canSubscribe(params.id);
    if (!can.ok) {
      sendJsonRpcError(res, null, { code: can.code, message: can.message });
      return;
    }
    const result = this.streamingHandler.handleTaskSubscription(params.id, res);
    if (!result.ok) {
      sendJsonRpcError(res, null, { code: result.code, message: result.message });
    }
    // For SSE, the response stays open -- no further action needed here.
  }
}
