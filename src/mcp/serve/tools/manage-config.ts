/**
 * MCP tool: manage_config
 *
 * Read or update OpenClaw configuration via the gateway.
 */
import type { GatewayRpc, McpToolCallResult, McpToolHandler } from "../types.js";

export function createManageConfigTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "manage_config",
      description:
        "Read or update the OpenClaw configuration. Use action 'get' to read " +
        "and 'set' to update specific configuration keys.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The config action to perform.",
            enum: ["get", "set", "schema"],
          },
          key: {
            type: "string",
            description:
              "The configuration key path (e.g. 'gateway.mode', 'channels.telegram.enabled'). " +
              "Required for 'set'; optional for 'get' (if omitted returns the entire config).",
          },
          value: {
            type: ["string", "number", "boolean"],
            description:
              "The value to set. Required for 'set' action. " +
              "Strings, numbers, and booleans are accepted.",
          },
        },
        required: ["action"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      const action = args.action as string;

      switch (action) {
        case "get": {
          const params: Record<string, unknown> = {};
          if (typeof args.key === "string") {
            params.key = args.key;
          }
          const result = await callGateway("config.get", params);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "set": {
          if (!args.key || typeof args.key !== "string") {
            return {
              content: [{ type: "text", text: "Error: 'key' is required for the 'set' action." }],
              isError: true,
            };
          }
          if (args.value === undefined) {
            return {
              content: [{ type: "text", text: "Error: 'value' is required for the 'set' action." }],
              isError: true,
            };
          }
          const result = await callGateway("config.set", {
            key: args.key,
            value: args.value,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "schema": {
          const params: Record<string, unknown> = {};
          if (typeof args.key === "string") {
            params.key = args.key;
          }
          const result = await callGateway("config.schema.lookup", params);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `Error: Unknown action '${String(action)}'. Use 'get', 'set', or 'schema'.`,
              },
            ],
            isError: true,
          };
      }
    },
  };
}
