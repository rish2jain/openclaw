/**
 * MCP tool: failover_status
 *
 * View active failovers, failover history, and SLA metrics.
 */
import type { McpToolHandler, McpToolCallResult, GatewayRpc } from "../types.js";
import { parseEnumArg, parseNumberArg, ArgError, argErrorResult } from "./arg-utils.js";

const VIEWS = ["active", "history", "sla"] as const;

export function createFailoverStatusTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "failover_status",
      description:
        "View failover information: active failovers currently in progress, " +
        "failover history, or SLA metrics for failover performance.",
      inputSchema: {
        type: "object",
        properties: {
          view: {
            type: "string",
            description: "View to display",
            enum: [...VIEWS],
          },
          limit: {
            type: "string",
            description: "Max history entries (for 'history' view, 1-100, default 20)",
          },
        },
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const view = parseEnumArg(args, "view", VIEWS) ?? "active";

        switch (view) {
          case "active": {
            const result = await callGateway<{
              failovers: Array<{
                userKey: string;
                sourceChannel: string;
                targetChannel: string;
                startedAt: string;
                messagesRouted: number;
              }>;
            }>("failover.active", {});

            const failovers = result.failovers ?? [];
            if (failovers.length === 0) {
              return { content: [{ type: "text", text: "No active failovers." }] };
            }
            const lines = ["# Active Failovers", ""];
            for (const f of failovers) {
              lines.push(
                `- **${f.userKey}**: ${f.sourceChannel} → ${f.targetChannel} (since ${f.startedAt}, ${f.messagesRouted} msgs routed)`,
              );
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }

          case "history": {
            const limit = parseNumberArg(args, "limit", { min: 1, max: 100, default: 20 });
            const result = await callGateway<{
              events: Array<{
                userKey: string;
                sourceChannel: string;
                targetChannel: string;
                reason: string;
                startedAt: string;
                endedAt?: string;
                durationSeconds?: number;
                messagesRouted: number;
                failbackSuccess?: boolean;
              }>;
            }>("failover.history", { limit });

            const events = result.events ?? [];
            if (events.length === 0) {
              return { content: [{ type: "text", text: "No failover history." }] };
            }
            const lines = ["# Failover History", ""];
            for (const e of events) {
              const duration =
                e.durationSeconds !== undefined ? `${e.durationSeconds}s` : "ongoing";
              const failback =
                e.failbackSuccess !== undefined
                  ? e.failbackSuccess
                    ? " (failback OK)"
                    : " (failback failed)"
                  : "";
              lines.push(
                `- ${e.startedAt}: ${e.sourceChannel} → ${e.targetChannel} [${e.reason}] — ${duration}, ${e.messagesRouted} msgs${failback}`,
              );
            }
            return { content: [{ type: "text", text: lines.join("\n") }] };
          }

          case "sla": {
            const result = await callGateway("failover.sla", {});
            return {
              content: [
                {
                  type: "text",
                  text: `# Failover SLA Metrics\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
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
