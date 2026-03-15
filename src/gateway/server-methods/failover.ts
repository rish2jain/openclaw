/**
 * Gateway methods for failover status queries.
 *
 * - failover.active: list active failovers
 * - failover.history: recent failover events (from in-memory log)
 * - failover.sla: SLA metrics derived from metrics exporter
 */
import type { GatewayRequestHandlers } from "./types.js";

export const failoverHandlers: GatewayRequestHandlers = {
  "failover.active": async ({ respond, context }) => {
    const router = context.failoverRouter;
    if (!router) {
      respond(true, { failovers: [] });
      return;
    }
    const active = router.getActiveFailovers();
    respond(true, {
      failovers: active.map((f) => ({
        userKey: f.userKey,
        sourceChannel: f.originalChannel,
        targetChannel: f.targetChannel,
        startedAt: new Date(f.failedOverAt).toISOString(),
        messagesRouted: 0,
      })),
    });
  },

  "failover.history": async ({ respond, context, params }) => {
    const log = context.getFailoverHistory?.() ?? [];
    const limit = typeof params.limit === "number" ? Math.max(0, Math.min(params.limit, 100)) : 20;
    respond(true, { events: log.slice(-limit) });
  },

  "failover.sla": async ({ respond, context }) => {
    const exporter = context.metricsExporter;
    if (!exporter) {
      respond(true, {
        totalFailovers: 0,
        avgDurationSeconds: 0,
        autoFailbackRate: 0,
      });
      return;
    }
    const snapshot = exporter.getSnapshot();
    const failoverCounters = snapshot.counters["openclaw_failover_total"] ?? [];
    const totalFailovers = failoverCounters.reduce((sum, c) => sum + c.value, 0);
    const failoverDuration = snapshot.histograms["openclaw_failover_duration_seconds"] ?? [];
    let totalWeighted = 0;
    let totalCount = 0;
    for (const entry of failoverDuration) {
      totalWeighted += entry.avg * entry.count;
      totalCount += entry.count;
    }
    const avgDuration = totalCount > 0 ? totalWeighted / totalCount : 0;

    respond(true, {
      totalFailovers,
      avgDurationSeconds: Math.round(avgDuration * 100) / 100,
      autoFailbackRate: 0,
    });
  },
};
