/**
 * MCP tool: channel_status
 *
 * Query the status of connected chat channels via the gateway.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

export function createChannelStatusTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "channel_status",
      description:
        "Get the status of all connected chat channels (Telegram, Discord, Slack, etc.) " +
        "including their configuration state, enabled/disabled status, and connectivity.",
      inputSchema: {
        type: "object",
        properties: {
          channel: {
            type: "string",
            description:
              "Optional: filter to a specific channel provider (e.g. 'telegram', 'discord', 'slack').",
          },
        },
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      const result = await callGateway("channels.status", {});
      const channelFilter = typeof args.channel === "string" ? args.channel.toLowerCase() : null;

      if (channelFilter && typeof result === "object" && result !== null) {
        // Filter to the requested channel if the response contains per-channel data
        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
          if (key.toLowerCase() === channelFilter || key.toLowerCase().includes(channelFilter)) {
            filtered[key] = value;
          }
        }
        if (Object.keys(filtered).length > 0) {
          return {
            content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
          };
        }
        // No match: return full unfiltered result with a note
        return {
          content: [
            {
              type: "text",
              text: `No channels matching '${channelFilter}'. All channels:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
