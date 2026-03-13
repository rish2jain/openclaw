/**
 * MCP tool: memory_query
 *
 * Search tiered memory, query entity graph, and view memory statistics.
 */
import type { McpToolCallResult, McpToolHandler } from "../types.js";
import {
  parseStringArg,
  parseNumberArg,
  parseEnumArg,
  ArgError,
  argErrorResult,
} from "./arg-utils.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

export function createMemoryQueryTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "memory_query",
      description:
        "Query OpenClaw memory systems. Search across memory tiers, " +
        "inspect entity relationships, or view memory statistics.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The memory action to perform.",
            enum: ["search", "entities", "stats"],
          },
          query: {
            type: "string",
            description: "Search query text. Required for 'search' action.",
          },
          tier: {
            type: "string",
            description:
              "Memory tier to search. Optional for 'search' (searches all tiers if omitted).",
            enum: ["session", "agent", "shared"],
          },
          limit: {
            type: "number",
            description: "Maximum results to return. Default: 10.",
          },
          entity_name: {
            type: "string",
            description: "Entity name for 'entities' action. Omit to list all entities.",
          },
        },
        required: ["action"],
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const action = parseEnumArg(
          args,
          "action",
          ["search", "entities", "stats"] as const,
          true,
        )!;

        switch (action) {
          case "search": {
            const query = parseStringArg(args, "query", true);
            const tier = parseEnumArg(args, "tier", ["session", "agent", "shared"] as const);
            const limit = parseNumberArg(args, "limit", { min: 1, max: 100, default: 10 });
            const params: Record<string, unknown> = { query };
            if (tier) {
              params.tier = tier;
            }
            if (limit) {
              params.limit = limit;
            }
            const result = await callGateway("memory.search", params);
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "entities": {
            const entityName = parseStringArg(args, "entity_name");
            const limit = parseNumberArg(args, "limit", { min: 1, max: 100, default: 20 });
            const params: Record<string, unknown> = {};
            if (entityName) {
              params.name = entityName;
            }
            if (limit) {
              params.limit = limit;
            }
            const result = await callGateway("memory.entities", params);
            return {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          case "stats": {
            const result = await callGateway("memory.stats", {});
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
