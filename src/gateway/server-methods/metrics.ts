/**
 * Gateway methods for metrics and health dashboard.
 *
 * - metrics.snapshot: raw JSON snapshot of all metrics
 */
import type { GatewayRequestHandlers } from "./types.js";

export const metricsHandlers: GatewayRequestHandlers = {
  "metrics.snapshot": async ({ respond, context }) => {
    const exporter = context.metricsExporter;
    if (!exporter) {
      respond(true, {
        counters: {},
        gauges: {},
        histograms: {},
        exportedAt: Date.now(),
      });
      return;
    }
    respond(true, exporter.getSnapshot());
  },
};
