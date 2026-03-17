/**
 * MCP tool: send_message
 *
 * Send a message to the OpenClaw agent via the gateway.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import { parseStringArg, ArgError, argErrorResult } from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

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
      try {
        const message = parseStringArg(args, "message", true)!;
        const sessionKey = parseStringArg(args, "session_key");
        const channel = parseStringArg(args, "channel");

        const params: Record<string, unknown> = { message };
        if (sessionKey) {
          params.sessionKey = sessionKey;
        }
        if (channel) {
          params.channel = channel;
        }

        const result = await callGateway("send", params);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
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
