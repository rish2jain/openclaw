/**
 * MCP tool: agent_manage
 *
 * List, inspect, and manage OpenClaw agents.
 */
import type { GatewayRpc, McpToolCallResult, McpToolHandler } from "../types.js";
import { parseStringArg, parseEnumArg, ArgError, argErrorResult } from "./arg-utils.js";

export function createAgentManageTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "agent_manage",
      description:
        "Manage OpenClaw agents. List configured agents, inspect agent details, " +
        "or view agent runtime status.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The agent management action to perform.",
            enum: ["list", "inspect", "status"],
          },
          agent_id: {
            type: "string",
            description: "Agent ID. Required for 'inspect' and 'status' actions.",
          },
        },
        required: ["action"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const action = parseEnumArg(args, "action", ["list", "inspect", "status"] as const, true)!;
        const agentId = parseStringArg(args, "agent_id");

        switch (action) {
          case "list": {
            const result = await callGateway("agents.list", {});
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "inspect": {
            if (!agentId) {
              return argErrorResult(new ArgError("'agent_id' is required for 'inspect' action"));
            }
            const result = await callGateway("agents.inspect", {
              agentId,
            });
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "status": {
            if (!agentId) {
              return argErrorResult(new ArgError("'agent_id' is required for 'status' action"));
            }
            const result = await callGateway("agents.status", {
              agentId,
            });
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
