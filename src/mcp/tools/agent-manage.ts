/**
 * MCP tool: agent_manage
 *
 * List agents, inspect configuration, and view agent status.
 */
import type { McpToolHandler, McpToolCallResult } from "../types.js";
import { parseEnumArg, parseStringArg, ArgError, argErrorResult } from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

const ACTIONS = ["list", "inspect", "status"] as const;

export function createAgentManageTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "agent_manage",
      description:
        "Manage agents: list all agents, inspect an agent's configuration, or view agent status.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform",
            enum: [...ACTIONS],
          },
          agent_id: {
            type: "string",
            description: "Agent ID (required for 'inspect' and 'status')",
          },
        },
        required: ["action"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const action = parseEnumArg(args, "action", ACTIONS, true)!;
        const agentId = parseStringArg(args, "agent_id");

        switch (action) {
          case "list": {
            const result = await callGateway<{
              agents: Array<{ id: string; name: string; model?: string; status?: string }>;
            }>("agents.list", {});
            const agents = result.agents ?? [];
            if (agents.length === 0) {
              return { content: [{ type: "text", text: "No agents configured." }] };
            }
            const lines = ["# Agents", ""];
            for (const a of agents) {
              lines.push(
                `- **${a.name}** (${a.id})${a.model ? ` — model: ${a.model}` : ""}${a.status ? ` [${a.status}]` : ""}`,
              );
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }

          case "inspect": {
            if (!agentId) {
              throw new ArgError("'agent_id' is required for inspect");
            }
            const result = await callGateway("agents.inspect", { agentId });
            return {
              content: [
                {
                  type: "text",
                  text: `# Agent: ${agentId}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
                },
              ],
            };
          }

          case "status": {
            if (!agentId) {
              throw new ArgError("'agent_id' is required for status");
            }
            const result = await callGateway("agents.status", { agentId });
            return {
              content: [
                {
                  type: "text",
                  text: `# Agent Status: ${agentId}\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
                },
              ],
            };
          }

          default: {
            return argErrorResult(new ArgError(`Unrecognized action: '${String(action)}'`));
          }
        }
      } catch (error) {
        if (error instanceof ArgError) {
          return argErrorResult(error);
        }
        return argErrorResult(error);
      }
    },
  };
}
