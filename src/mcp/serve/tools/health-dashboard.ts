/**
 * MCP tool: health_dashboard
 *
 * Expose channel health metrics, circuit breaker state, and delivery stats.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import { parseStringArg, parseEnumArg, ArgError, argErrorResult } from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

export function createHealthDashboardTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "health_dashboard",
      description:
        "View channel health metrics, delivery statistics, and system health. " +
        "Provides an overview of all channel connectivity and performance.",
      inputSchema: {
        type: "object",
        properties: {
          view: {
            type: "string",
            description: "Dashboard view to show.",
            enum: ["summary", "channels", "delivery", "circuits"],
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
        const view =
          parseEnumArg(args, "view", ["summary", "channels", "delivery", "circuits"] as const) ??
          "summary";
        const channel = parseStringArg(args, "channel");

        const params: Record<string, unknown> = { view };
        if (channel) {
          params.channel = channel;
        }

        const result = await callGateway("health.dashboard", params);
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
