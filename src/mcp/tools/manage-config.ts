/**
 * MCP tool: manage_config
 *
 * Read or update OpenClaw configuration via the gateway.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import {
  parseStringArg,
  parseEnumArg,
  coerceConfigValue,
  ArgError,
  argErrorResult,
} from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

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
              "Configuration key path (e.g. 'gateway.mode', 'channels.telegram.enabled'). " +
              "Optional for 'get' and 'schema' (omitting returns the whole config); required for 'set'.",
          },
          value: {
            type: "string",
            description:
              "The value to set. Required for 'set' action. " +
              "Strings, numbers, and booleans are auto-detected.",
          },
        },
        required: ["action"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const action = parseEnumArg(args, "action", ["get", "set", "schema"] as const, true)!;

        switch (action) {
          case "get": {
            const params: Record<string, unknown> = {};
            const key = parseStringArg(args, "key");
            if (key) {
              params.key = key;
            }
            const result = await callGateway("config.get", params);
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "set": {
            const key = parseStringArg(args, "key", true);
            if (args.value === undefined) {
              return {
                content: [
                  { type: "text", text: "Error: 'value' is required for the 'set' action." },
                ],
                isError: true,
              };
            }
            const result = await callGateway("config.set", {
              key,
              value: coerceConfigValue(args.value),
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "schema": {
            const params: Record<string, unknown> = {};
            const key = parseStringArg(args, "key");
            if (key) {
              params.key = key;
            }
            const result = await callGateway("config.schema.lookup", params);
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }
        }
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}
