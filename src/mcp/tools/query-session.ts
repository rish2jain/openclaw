/**
 * MCP tool: query_session
 *
 * Query a session's conversation history (preview) via the gateway.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import { parseStringArg, parseNumberArg, ArgError, argErrorResult } from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

export function createQuerySessionTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "query_session",
      description:
        "Query a session's recent conversation history. Returns a preview of the most recent " +
        "messages in the specified session.",
      inputSchema: {
        type: "object",
        properties: {
          session_key: {
            type: "string",
            description:
              "The session key to query (e.g. 'agent:main:main'). " +
              "Use list_sessions to discover available session keys.",
          },
          limit: {
            type: "number",
            description: "Maximum number of messages to return. Defaults to 20.",
          },
        },
        required: ["session_key"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const sessionKey = parseStringArg(args, "session_key", true)!;
        const limit = parseNumberArg(args, "limit", { min: 1, max: 200, default: 20 });

        const params: Record<string, unknown> = { sessionKey };
        if (limit !== undefined && Number.isInteger(limit) && limit > 0) {
          params.limit = limit;
        }

        const result = await callGateway("sessions.preview", params);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}
