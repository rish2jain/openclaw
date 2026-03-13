/**
 * MCP tool: channel_status
 *
 * Query the status of connected chat channels via the gateway.
 */
import type { GatewayRpc, McpToolCallResult, McpToolHandler } from "../types.js";

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
      const channelRaw = args.channel;
      const channel =
        typeof channelRaw === "string" && channelRaw.trim().length > 0
          ? channelRaw.trim().toLowerCase()
          : undefined;
      const params = channel ? { channel } : {};
      const result = await callGateway("channels.status", params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
