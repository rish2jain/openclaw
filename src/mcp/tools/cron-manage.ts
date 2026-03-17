/**
 * MCP tool: cron_manage
 *
 * List, create, and delete cron jobs via the gateway scheduler.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import { parseEnumArg, ArgError, argErrorResult } from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

const CRON_ACTIONS = ["list", "status", "add", "remove", "runs"] as const;

export function createCronManageTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "cron_manage",
      description:
        "Manage OpenClaw cron jobs. Supports listing existing jobs, " +
        "creating new scheduled tasks, and removing jobs.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The cron action to perform.",
            enum: [...CRON_ACTIONS],
          },
          id: {
            type: "string",
            description: "The cron job ID. Required for 'remove'; optional for 'runs'.",
          },
          schedule: {
            type: "string",
            description:
              "Cron schedule expression (e.g. '0 9 * * *' for daily at 9am). " +
              "Required for 'add' action.",
          },
          prompt: {
            type: "string",
            description: "The prompt/message for the cron job. Required for 'add' action.",
          },
          label: {
            type: "string",
            description: "Optional human-readable label for the cron job.",
          },
          session_key: {
            type: "string",
            description: "Optional session key to target for the cron job.",
          },
        },
        required: ["action"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const action = parseEnumArg(args, "action", CRON_ACTIONS, true)!;

        switch (action) {
          case "list": {
            const result = await callGateway("cron.list", {});
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "status": {
            const result = await callGateway("cron.status", {});
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "add": {
            if (!args.schedule || typeof args.schedule !== "string") {
              return {
                content: [
                  { type: "text", text: "Error: 'schedule' is required for the 'add' action." },
                ],
                isError: true,
              };
            }
            if (!args.prompt || typeof args.prompt !== "string") {
              return {
                content: [
                  { type: "text", text: "Error: 'prompt' is required for the 'add' action." },
                ],
                isError: true,
              };
            }
            const params: Record<string, unknown> = {
              schedule: args.schedule,
              prompt: args.prompt,
            };
            if (typeof args.label === "string") {
              params.label = args.label;
            }
            if (typeof args.session_key === "string") {
              params.sessionKey = args.session_key;
            }
            const result = await callGateway("cron.add", params);
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "remove": {
            if (!args.id || typeof args.id !== "string") {
              return {
                content: [
                  { type: "text", text: "Error: 'id' is required for the 'remove' action." },
                ],
                isError: true,
              };
            }
            const result = await callGateway("cron.remove", {
              id: args.id,
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "runs": {
            const params: Record<string, unknown> = {};
            if (typeof args.id === "string") {
              params.id = args.id;
            }
            const result = await callGateway("cron.runs", params);
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
