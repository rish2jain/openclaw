/**
 * Per-channel metrics collection.
 *
 * Tracks message count, response time percentiles (p50/p95/p99),
 * error rate, and delivery success rate per channel.
 *
 * Metrics are stored in-memory with a sliding window approach.
 * The summary function outputs data suitable for
 * `openclaw channels status --deep`.
 */

import { onDiagnosticEvent, type DiagnosticEventPayload } from "./diagnostic-events.js";
import { onSpanEnd, type SpanEndEvent } from "./tracing.js";

/** Maximum number of duration samples to keep per channel for percentile calculations. */
const MAX_SAMPLES = 1000;

/** How long to retain individual samples (ms). Default: 1 hour. */
const SAMPLE_RETENTION_MS = 60 * 60 * 1000;

export type ChannelMetrics = {
  channel: string;
  /** Total messages received since start. */
  messagesReceived: number;
  /** Total messages successfully processed. */
  messagesProcessed: number;
  /** Total processing errors. */
  messagesErrored: number;
  /** Total messages skipped (filtered, debounced, etc.). */
  messagesSkipped: number;
  /** Total delivery attempts. */
  deliveryAttempts: number;
  /** Successful deliveries. */
  deliverySuccesses: number;
  /** Failed deliveries. */
  deliveryFailures: number;
  /** Response time percentiles (ms) from recent samples. */
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    count: number;
  };
  /** Error rate as a fraction (0-1) over the sample window. */
  errorRate: number;
  /** Delivery success rate as a fraction (0-1) over the sample window. */
  deliverySuccessRate: number;
  /** When this channel last received a message. */
  lastMessageAt?: number;
  /** When this channel last had an error. */
  lastErrorAt?: number;
};

type TimestampedSample = {
  value: number;
  at: number;
};

type ChannelState = {
  messagesReceived: number;
  messagesProcessed: number;
  messagesErrored: number;
  messagesSkipped: number;
  deliveryAttempts: number;
  deliverySuccesses: number;
  deliveryFailures: number;
  durationSamples: TimestampedSample[];
  lastMessageAt?: number;
  lastErrorAt?: number;
};

const METRICS_STATE_KEY: unique symbol = Symbol.for("openclaw.channelMetrics");

type MetricsGlobalState = {
  channels: Map<string, ChannelState>;
  unsubDiagnostic?: () => void;
  unsubSpan?: () => void;
};

function getMetricsState(): MetricsGlobalState {
  const globalStore = globalThis as typeof globalThis & {
    [METRICS_STATE_KEY]?: MetricsGlobalState;
  };
  if (!globalStore[METRICS_STATE_KEY]) {
    globalStore[METRICS_STATE_KEY] = {
      channels: new Map(),
    };
  }
  return globalStore[METRICS_STATE_KEY];
}

function getOrCreateChannel(channel: string): ChannelState {
  const state = getMetricsState();
  let ch = state.channels.get(channel);
  if (!ch) {
    ch = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesErrored: 0,
      messagesSkipped: 0,
      deliveryAttempts: 0,
      deliverySuccesses: 0,
      deliveryFailures: 0,
      durationSamples: [],
    };
    state.channels.set(channel, ch);
  }
  return ch;
}

function addDurationSample(ch: ChannelState, durationMs: number): void {
  const now = Date.now();
  if (ch.durationSamples.length >= MAX_SAMPLES) {
    ch.durationSamples.shift();
  }
  ch.durationSamples.push({ value: durationMs, at: now });
}

function getRecentSamples(ch: ChannelState): number[] {
  const cutoff = Date.now() - SAMPLE_RETENTION_MS;
  return ch.durationSamples.filter((s) => s.at >= cutoff).map((s) => s.value);
}

/**
 * Calculate percentile from a sorted array of values.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Handle diagnostic events to update channel metrics.
 */
function handleDiagnosticEvent(evt: DiagnosticEventPayload): void {
  switch (evt.type) {
    case "webhook.received": {
      const ch = getOrCreateChannel(evt.channel);
      ch.messagesReceived += 1;
      ch.lastMessageAt = Date.now();
      break;
    }
    case "webhook.error": {
      const ch = getOrCreateChannel(evt.channel);
      ch.messagesErrored += 1;
      ch.lastErrorAt = Date.now();
      break;
    }
    case "message.processed": {
      const ch = getOrCreateChannel(evt.channel);
      if (evt.outcome === "completed") {
        ch.messagesProcessed += 1;
        if (typeof evt.durationMs === "number") {
          addDurationSample(ch, evt.durationMs);
        }
      } else if (evt.outcome === "error") {
        ch.messagesErrored += 1;
        ch.lastErrorAt = Date.now();
      } else if (evt.outcome === "skipped") {
        ch.messagesSkipped += 1;
      }
      break;
    }
    case "webhook.processed": {
      const ch = getOrCreateChannel(evt.channel);
      if (typeof evt.durationMs === "number") {
        addDurationSample(ch, evt.durationMs);
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Handle span end events from the tracing system to track delivery metrics.
 */
function handleSpanEnd(evt: SpanEndEvent): void {
  if (evt.phase !== "channel-deliver") {
    return;
  }
  const channelType =
    typeof evt.attributes.channelType === "string" ? evt.attributes.channelType : "unknown";
  const ch = getOrCreateChannel(channelType);
  ch.deliveryAttempts += 1;
  if (evt.status === "ok") {
    ch.deliverySuccesses += 1;
  } else {
    ch.deliveryFailures += 1;
  }
}

/**
 * Initialize metrics collection by subscribing to diagnostic events
 * and span end events. Safe to call multiple times; subsequent calls are no-ops.
 */
export function initMetricsCollection(): void {
  const state = getMetricsState();
  if (state.unsubDiagnostic) {
    return;
  }
  state.unsubDiagnostic = onDiagnosticEvent(handleDiagnosticEvent);
  state.unsubSpan = onSpanEnd(handleSpanEnd);
}

/**
 * Stop metrics collection and clean up subscriptions.
 */
export function stopMetricsCollection(): void {
  const state = getMetricsState();
  state.unsubDiagnostic?.();
  state.unsubDiagnostic = undefined;
  state.unsubSpan?.();
  state.unsubSpan = undefined;
}

/**
 * Get metrics summary for a single channel.
 */
export function getChannelMetrics(channel: string): ChannelMetrics | undefined {
  const state = getMetricsState();
  const ch = state.channels.get(channel);
  if (!ch) {
    return undefined;
  }
  const recent = getRecentSamples(ch);
  const sorted = recent.toSorted((a, b) => a - b);
  const totalOutcomes = ch.messagesProcessed + ch.messagesErrored + ch.messagesSkipped;
  const errorRate = totalOutcomes > 0 ? ch.messagesErrored / totalOutcomes : 0;
  const deliverySuccessRate =
    ch.deliveryAttempts > 0 ? ch.deliverySuccesses / ch.deliveryAttempts : 1;

  return {
    channel,
    messagesReceived: ch.messagesReceived,
    messagesProcessed: ch.messagesProcessed,
    messagesErrored: ch.messagesErrored,
    messagesSkipped: ch.messagesSkipped,
    deliveryAttempts: ch.deliveryAttempts,
    deliverySuccesses: ch.deliverySuccesses,
    deliveryFailures: ch.deliveryFailures,
    responseTime: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      count: sorted.length,
    },
    errorRate,
    deliverySuccessRate,
    lastMessageAt: ch.lastMessageAt,
    lastErrorAt: ch.lastErrorAt,
  };
}

/**
 * Get metrics summaries for all tracked channels.
 */
export function getAllChannelMetrics(): ChannelMetrics[] {
  const state = getMetricsState();
  const results: ChannelMetrics[] = [];
  for (const channel of state.channels.keys()) {
    const m = getChannelMetrics(channel);
    if (m) {
      results.push(m);
    }
  }
  return results.toSorted((a, b) => a.channel.localeCompare(b.channel));
}

/**
 * Format metrics summary as lines suitable for `openclaw channels status --deep`.
 */
export function formatMetricsSummary(): string[] {
  const all = getAllChannelMetrics();
  if (all.length === 0) {
    return ["  No channel metrics collected yet."];
  }
  const lines: string[] = [];
  for (const m of all) {
    lines.push(`  ${m.channel}:`);
    lines.push(
      `    messages: ${m.messagesReceived} received, ${m.messagesProcessed} processed, ${m.messagesErrored} errors, ${m.messagesSkipped} skipped`,
    );
    if (m.responseTime.count > 0) {
      lines.push(
        `    response time: p50=${m.responseTime.p50}ms p95=${m.responseTime.p95}ms p99=${m.responseTime.p99}ms (${m.responseTime.count} samples)`,
      );
    }
    lines.push(`    error rate: ${(m.errorRate * 100).toFixed(1)}%`);
    lines.push(
      `    delivery: ${m.deliverySuccesses}/${m.deliveryAttempts} success (${(m.deliverySuccessRate * 100).toFixed(1)}%)`,
    );
    if (m.lastMessageAt) {
      lines.push(`    last message: ${new Date(m.lastMessageAt).toISOString()}`);
    }
    if (m.lastErrorAt) {
      lines.push(`    last error: ${new Date(m.lastErrorAt).toISOString()}`);
    }
  }
  return lines;
}

/**
 * Record a message receive event directly (for channels that don't use webhooks).
 */
export function recordMessageReceived(channel: string): void {
  const ch = getOrCreateChannel(channel);
  ch.messagesReceived += 1;
  ch.lastMessageAt = Date.now();
}

/**
 * Record a message processing outcome directly.
 */
export function recordMessageProcessed(
  channel: string,
  outcome: "completed" | "error" | "skipped",
  durationMs?: number,
): void {
  const ch = getOrCreateChannel(channel);
  if (outcome === "completed") {
    ch.messagesProcessed += 1;
    if (typeof durationMs === "number") {
      addDurationSample(ch, durationMs);
    }
  } else if (outcome === "error") {
    ch.messagesErrored += 1;
    ch.lastErrorAt = Date.now();
  } else {
    ch.messagesSkipped += 1;
  }
}

/**
 * Reset all metrics state for tests.
 */
export function resetMetricsForTest(): void {
  const state = getMetricsState();
  state.channels.clear();
  state.unsubDiagnostic?.();
  state.unsubDiagnostic = undefined;
  state.unsubSpan?.();
  state.unsubSpan = undefined;
}
