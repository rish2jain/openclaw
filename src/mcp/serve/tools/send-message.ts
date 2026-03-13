/**
 * MCP tool: send_message
 *
 * Send a message to the OpenClaw agent via the gateway.
 */
import type { GatewayRpc, McpToolCallResult, McpToolHandler } from "../types.js";

export function createSendMessageTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "send_message",
      description:
        "Send a message to the OpenClaw agent. The message is delivered to the configured default session.",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message text to send to the agent.",
          },
          session_key: {
            type: "string",
            description:
              "Optional session key to target (e.g. 'agent:main:main'). Uses the default session if omitted.",
          },
          channel: {
            type: "string",
            description:
              "Optional channel to route through (e.g. 'telegram', 'discord'). Routes through the default channel if omitted.",
          },
        },
        required: ["message"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      const message = args.message as string;
      if (!message || typeof message !== "string") {
        return {
          content: [{ type: "text", text: "Error: 'message' is required and must be a string." }],
          isError: true,
        };
      }

      const params: Record<string, unknown> = { message };
      if (typeof args.session_key === "string") {
        params.sessionKey = args.session_key;
      }
      if (typeof args.channel === "string") {
        params.channel = args.channel;
      }

      const result = await callGateway("send", params);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  };
}
