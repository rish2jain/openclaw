/**
 * MCP tool: memory_query
 *
 * Search tiered memory, query the entity graph, and view memory stats.
 */
import type { McpToolHandler, McpToolCallResult } from "../types.js";
import {
  parseEnumArg,
  parseStringArg,
  parseNumberArg,
  ArgError,
  argErrorResult,
} from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

const ACTIONS = ["search", "entities", "stats"] as const;

export function createMemoryQueryTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "memory_query",
      description:
        "Query the memory system: search tiered memory for content, list entity graph nodes, or view memory statistics.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Query action",
            enum: [...ACTIONS],
          },
          query: {
            type: "string",
            description: "Search query (for 'search' action)",
          },
          tier: {
            type: "string",
            description: "Memory tier filter: session, agent, or all (default: all)",
            enum: ["session", "agent", "all"],
          },
          limit: {
            type: "string",
            description: "Max results (1-100, default 20)",
          },
        },
        required: ["action"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const action = parseEnumArg(args, "action", ACTIONS, true)!;

        switch (action) {
          case "search": {
            const query = parseStringArg(args, "query", true);
            const tier = parseEnumArg(args, "tier", ["session", "agent", "all"] as const) ?? "all";
            const limit = parseNumberArg(args, "limit", { min: 1, max: 100, default: 20 });

            const result = await callGateway<{
              entries: Array<{ content: string; tier: string; score?: number; timestamp?: string }>;
            }>("memory.search", { query, tier, limit });

            const entries = result.entries ?? [];
            if (entries.length === 0) {
              return {
                content: [{ type: "text", text: `No results for "${query}" in ${tier} tier(s).` }],
              };
            }
            const lines = [
              `# Memory Search: "${query}"`,
              `Tier: ${tier} | Results: ${entries.length}`,
              "",
            ];
            for (const entry of entries) {
              const scorePart =
                entry.score !== undefined ? ` (score: ${entry.score.toFixed(3)})` : "";
              lines.push(`## [${entry.tier}]${scorePart}`);
              lines.push(entry.content);
              lines.push("");
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }

          case "entities": {
            const limit = parseNumberArg(args, "limit", { min: 1, max: 100, default: 20 });
            const result = await callGateway<{
              entities: Array<{ name: string; type: string; mentions: number }>;
            }>("memory.entities", { limit });

            const entities = result.entities ?? [];
            if (entities.length === 0) {
              return { content: [{ type: "text", text: "No entities found in the graph." }] };
            }
            const lines = ["# Entity Graph", ""];
            for (const e of entities) {
              lines.push(
                `- **${e.name}** (${e.type}) — ${e.mentions} mention${e.mentions !== 1 ? "s" : ""}`,
              );
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }

          case "stats": {
            const result = await callGateway("memory.stats", {});
            return {
              content: [
                {
                  type: "text",
                  text: `# Memory Stats\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
                },
              ],
            };
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
