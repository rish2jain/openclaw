/**
 * MCP tool: health_dashboard
 *
 * Exposes channel health metrics, delivery stats, circuit breaker state,
 * and failover status via the metrics exporter.
 */
import type { McpToolHandler, McpToolCallResult, GatewayRpc } from "../types.js";
import { parseEnumArg, ArgError, argErrorResult } from "./arg-utils.js";

const VIEWS = ["summary", "channels", "delivery", "circuits"] as const;

export function createHealthDashboardTool(callGateway: GatewayRpc): McpToolHandler {
  return {
    definition: {
      name: "health_dashboard",
      description:
        "View channel health metrics, delivery stats, circuit breaker states, and failover information. " +
        "Use 'summary' for a high-level overview, 'channels' for per-channel health, " +
        "'delivery' for delivery statistics, or 'circuits' for circuit breaker states.",
      inputSchema: {
        type: "object",
        properties: {
          view: {
            type: "string",
            description: "Dashboard view to display",
            enum: [...VIEWS],
          },
        },
      },
    },

    async execute(args: Record<string, unknown>): Promise<McpToolCallResult> {
      try {
        const view = parseEnumArg(args, "view", VIEWS) ?? "summary";
        const snapshot = await callGateway<{
          counters: Record<string, Array<{ value: number; labels: Record<string, string> }>>;
          gauges: Record<string, Array<{ value: number; labels: Record<string, string> }>>;
          histograms: Record<
            string,
            Array<{
              count: number;
              sum: number;
              avg: number;
              p50: number | null;
              p95: number | null;
              p99: number | null;
              labels: Record<string, string>;
            }>
          >;
          exportedAt: number;
        }>("metrics.snapshot", {});

        let text: string;

        switch (view) {
          case "summary":
            text = formatSummary(snapshot);
            break;
          case "channels":
            text = formatChannels(snapshot);
            break;
          case "delivery":
            text = formatDelivery(snapshot);
            break;
          case "circuits":
            text = formatCircuits(snapshot);
            break;
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        if (error instanceof ArgError) {
          return argErrorResult(error);
        }
        return argErrorResult(error);
      }
    },
  };
}

type Snapshot = {
  counters: Record<string, Array<{ value: number; labels: Record<string, string> }>>;
  gauges: Record<string, Array<{ value: number; labels: Record<string, string> }>>;
  histograms: Record<
    string,
    Array<{
      count: number;
      sum: number;
      avg: number;
      p50: number | null;
      p95: number | null;
      p99: number | null;
      labels: Record<string, string>;
    }>
  >;
  exportedAt: number;
};

function formatSummary(s: Snapshot): string {
  const lines: string[] = ["# Health Dashboard — Summary", ""];

  const healthGauges = s.gauges["openclaw_channel_health_level"] ?? [];
  const deliveryCounters = s.counters["openclaw_channel_delivery_total"] ?? [];
  const failoverCounters = s.counters["openclaw_failover_total"] ?? [];
  const circuitGauges = s.gauges["openclaw_circuit_breaker_state"] ?? [];

  lines.push(`Channels monitored: ${healthGauges.length}`);
  lines.push(`Total deliveries: ${deliveryCounters.reduce((sum, c) => sum + c.value, 0)}`);
  lines.push(`Total failovers: ${failoverCounters.reduce((sum, c) => sum + c.value, 0)}`);
  lines.push(`Circuit breakers tracked: ${circuitGauges.length}`);
  lines.push(`Exported at: ${new Date(s.exportedAt).toISOString()}`);

  return lines.join("\n");
}

function formatChannels(s: Snapshot): string {
  const lines: string[] = ["# Health Dashboard — Channels", ""];
  const healthGauges = s.gauges["openclaw_channel_health_level"] ?? [];
  const levelNames = ["healthy", "degraded", "unhealthy", "offline"];

  if (healthGauges.length === 0) {
    lines.push("No channel health data available.");
  } else {
    for (const entry of healthGauges) {
      const level = levelNames[entry.value] ?? `unknown(${entry.value})`;
      lines.push(
        `- **${entry.labels["channel"] ?? "?"}** (${entry.labels["account"] ?? "?"}): ${level}`,
      );
    }
  }

  return lines.join("\n");
}

function formatDelivery(s: Snapshot): string {
  const lines: string[] = ["# Health Dashboard — Delivery Stats", ""];
  const deliveryCounters = s.counters["openclaw_channel_delivery_total"] ?? [];
  const latencyHistograms = s.histograms["openclaw_channel_delivery_latency_ms"] ?? [];

  if (deliveryCounters.length === 0) {
    lines.push("No delivery data available.");
  } else {
    lines.push("## Delivery Counts");
    for (const entry of deliveryCounters) {
      lines.push(
        `- ${entry.labels["channel"] ?? "?"} [${entry.labels["status"] ?? "?"}]: ${entry.value}`,
      );
    }
  }

  if (latencyHistograms.length > 0) {
    lines.push("", "## Latency (ms)");
    for (const entry of latencyHistograms) {
      const ch = entry.labels["channel"] ?? "?";
      lines.push(
        `- ${ch}: avg=${entry.avg.toFixed(1)} p50=${entry.p50?.toFixed(1) ?? "-"} p95=${entry.p95?.toFixed(1) ?? "-"} p99=${entry.p99?.toFixed(1) ?? "-"} (n=${entry.count})`,
      );
    }
  }

  return lines.join("\n");
}

function formatCircuits(s: Snapshot): string {
  const lines: string[] = ["# Health Dashboard — Circuit Breakers", ""];
  const circuitGauges = s.gauges["openclaw_circuit_breaker_state"] ?? [];
  const stateNames = ["closed", "open", "half_open"];

  if (circuitGauges.length === 0) {
    lines.push("No circuit breaker data available.");
  } else {
    for (const entry of circuitGauges) {
      const state = stateNames[entry.value] ?? `unknown(${entry.value})`;
      lines.push(`- **${entry.labels["channel"] ?? "?"}**: ${state}`);
    }
  }

  return lines.join("\n");
}
