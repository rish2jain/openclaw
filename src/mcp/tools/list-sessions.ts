/**
 * MCP tool: list_sessions
 *
 * List active agent sessions via the gateway.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import { parseStringArg } from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

export function createListSessionsTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "list_sessions",
      description:
        "List all active agent sessions. Shows session keys, labels, models, token usage, " +
        "thinking levels, and other session metadata.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "Optional: filter sessions by agent ID.",
          },
        },
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      const params: Record<string, unknown> = {};
      const agentId = parseStringArg(args, "agent_id");
      if (agentId) {
        params.agentId = agentId;
      }

      const result = await callGateway("sessions.list", params);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
