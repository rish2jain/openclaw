/**
 * MCP tool: failover_status
 *
 * View active failovers, failover history, and SLA metrics.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import { parseStringArg, parseEnumArg, ArgError, argErrorResult } from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

export function createFailoverStatusTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "failover_status",
      description:
        "View channel failover status. Shows active failovers, " +
        "failover history, and channel reliability metrics.",
      inputSchema: {
        type: "object",
        properties: {
          view: {
            type: "string",
            description: "What to show.",
            enum: ["active", "history", "sla"],
          },
          channel: {
            type: "string",
            description: "Optional: filter to a specific channel.",
          },
        },
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const view = parseEnumArg(args, "view", ["active", "history", "sla"] as const) ?? "active";
        const channel = parseStringArg(args, "channel");

        const params: Record<string, unknown> = { view };
        if (channel) {
          params.channel = channel;
        }

        const result = await callGateway("failover.status", params);
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
