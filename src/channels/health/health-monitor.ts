import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { ChannelId } from "../plugins/types.js";
import {
  evaluateHealthLevel,
  DEFAULT_HEALTH_THRESHOLDS,
  type ChannelHealthLevel,
  type ChannelHealthMetrics,
  type ChannelHealthEvent,
  type HealthThresholds,
} from "./health-status.js";

const log = createSubsystemLogger("channels/health/monitor");

const DEFAULT_CHECK_INTERVAL_MS = 30_000;
const DEFAULT_SAMPLE_WINDOW_MS = 5 * 60_000;
const DEFAULT_LATENCY_SAMPLE_SIZE = 100;

type DeliveryAttempt = {
  timestamp: number;
  latencyMs: number;
  success: boolean;
  error?: string;
};

type ChannelTracker = {
  channel: ChannelId;
  accountId: string;
  attempts: DeliveryAttempt[];
  level: ChannelHealthLevel;
  levelChangedAt: number;
  previousLevel?: ChannelHealthLevel;
  connected: boolean;
  consecutiveFailures: number;
  lastError?: string;
  lastSuccessAt?: number;
  uptimeSamples: number;
  uptimeSuccesses: number;
};

export type HealthMonitorDeps = {
  isChannelConnected: (channel: ChannelId, accountId: string) => boolean;
  onHealthChange?: (event: ChannelHealthEvent) => void;
};

export type HealthMonitorOptions = {
  checkIntervalMs?: number;
  sampleWindowMs?: number;
  maxLatencySamples?: number;
  thresholds?: Partial<HealthThresholds>;
  abortSignal?: AbortSignal;
};

export type HealthMonitor = {
  recordDelivery: (params: RecordDeliveryParams) => void;
  recordConnectivity: (params: RecordConnectivityParams) => void;
  getMetrics: (channel: ChannelId, accountId: string) => ChannelHealthMetrics | undefined;
  getAllMetrics: () => ChannelHealthMetrics[];
  getChannelsAtLevel: (level: ChannelHealthLevel) => ChannelHealthMetrics[];
  runCheck: () => void;
  stop: () => void;
};

export type RecordDeliveryParams = {
  channel: ChannelId;
  accountId: string;
  latencyMs: number;
  success: boolean;
  error?: string;
};

export type RecordConnectivityParams = {
  channel: ChannelId;
  accountId: string;
  connected: boolean;
  error?: string;
};

function trackerKey(channel: ChannelId, accountId: string): string {
  return `${channel}:${accountId}`;
}

function computePercentile(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((a, b) => a - b);
  const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? null;
}

export function createHealthMonitor(
  deps: HealthMonitorDeps,
  options?: HealthMonitorOptions,
): HealthMonitor {
  const checkIntervalMs = options?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  const sampleWindowMs = options?.sampleWindowMs ?? DEFAULT_SAMPLE_WINDOW_MS;
  const maxLatencySamples = options?.maxLatencySamples ?? DEFAULT_LATENCY_SAMPLE_SIZE;
  const thresholds: HealthThresholds = { ...DEFAULT_HEALTH_THRESHOLDS, ...options?.thresholds };

  const trackers = new Map<string, ChannelTracker>();
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function getOrCreateTracker(channel: ChannelId, accountId: string): ChannelTracker {
    const key = trackerKey(channel, accountId);
    let tracker = trackers.get(key);
    if (!tracker) {
      const now = Date.now();
      tracker = {
        channel,
        accountId,
        attempts: [],
        level: "offline",
        levelChangedAt: now,
        connected: false,
        consecutiveFailures: 0,
        uptimeSamples: 0,
        uptimeSuccesses: 0,
      };
      trackers.set(key, tracker);
      evaluateTracker(tracker);
    }
    return tracker;
  }

  function pruneAttempts(tracker: ChannelTracker, now: number): void {
    const cutoff = now - sampleWindowMs;
    tracker.attempts = tracker.attempts.filter((a) => a.timestamp >= cutoff);
    if (tracker.attempts.length > maxLatencySamples) {
      tracker.attempts = tracker.attempts.slice(tracker.attempts.length - maxLatencySamples);
    }
  }

  function computeMetrics(tracker: ChannelTracker): ChannelHealthMetrics {
    const now = Date.now();
    pruneAttempts(tracker, now);

    const attempts = tracker.attempts;
    const total = attempts.length;
    const failures = attempts.filter((a) => !a.success).length;
    const errorRate = total > 0 ? failures / total : 0;

    const latencies = attempts.filter((a) => a.success).map((a) => a.latencyMs);
    const avgLatency =
      latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : null;
    const p95Latency = computePercentile(latencies, 95);

    const uptimePercent =
      tracker.uptimeSamples > 0 ? (tracker.uptimeSuccesses / tracker.uptimeSamples) * 100 : null;

    return {
      channel: tracker.channel,
      accountId: tracker.accountId,
      level: tracker.level,
      evaluatedAt: now,
      levelChangedAt: tracker.levelChangedAt,
      previousLevel: tracker.previousLevel,
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95Latency,
      errorRate,
      messageAttempts: total,
      messageFailures: failures,
      connected: tracker.connected,
      consecutiveFailures: tracker.consecutiveFailures,
      lastError: tracker.lastError,
      uptimePercent,
    };
  }

  function emitHealthChange(
    tracker: ChannelTracker,
    previousLevel: ChannelHealthLevel,
    metrics: ChannelHealthMetrics,
  ): void {
    const event: ChannelHealthEvent = {
      type: "channel-health-change",
      channel: tracker.channel,
      accountId: tracker.accountId,
      previousLevel,
      currentLevel: tracker.level,
      metrics,
      timestamp: Date.now(),
    };
    log.info("channel health changed", {
      channel: tracker.channel,
      accountId: tracker.accountId,
      from: previousLevel,
      to: tracker.level,
    });
    deps.onHealthChange?.(event);
  }

  function evaluateTracker(tracker: ChannelTracker): void {
    const metrics = computeMetrics(tracker);
    const connected = deps.isChannelConnected(tracker.channel, tracker.accountId);
    tracker.connected = connected;

    const newLevel = evaluateHealthLevel({
      connected,
      consecutiveFailures: tracker.consecutiveFailures,
      errorRate: metrics.errorRate,
      avgLatencyMs: metrics.avgLatencyMs,
      thresholds,
    });

    tracker.uptimeSamples += 1;
    if (connected && newLevel !== "offline") {
      tracker.uptimeSuccesses += 1;
    }

    if (newLevel !== tracker.level) {
      const previousLevel = tracker.level;
      tracker.previousLevel = previousLevel;
      tracker.level = newLevel;
      tracker.levelChangedAt = Date.now();
      const updatedMetrics = computeMetrics(tracker);
      emitHealthChange(tracker, previousLevel, updatedMetrics);
    }
  }

  function recordDelivery(params: RecordDeliveryParams): void {
    const tracker = getOrCreateTracker(params.channel, params.accountId);
    const now = Date.now();
    tracker.attempts.push({
      timestamp: now,
      latencyMs: params.latencyMs,
      success: params.success,
      error: params.error,
    });
    if (params.success) {
      tracker.consecutiveFailures = 0;
      tracker.lastSuccessAt = now;
    } else {
      tracker.consecutiveFailures += 1;
      tracker.lastError = params.error;
    }
    evaluateTracker(tracker);
  }

  function recordConnectivity(params: RecordConnectivityParams): void {
    const tracker = getOrCreateTracker(params.channel, params.accountId);
    const wasConnected = tracker.connected;
    tracker.connected = params.connected;
    if (!params.connected) {
      tracker.lastError = params.error;
      if (wasConnected) {
        tracker.consecutiveFailures += 1;
      }
    } else if (!wasConnected) {
      tracker.consecutiveFailures = 0;
    }
    evaluateTracker(tracker);
  }

  function getMetrics(channel: ChannelId, accountId: string): ChannelHealthMetrics | undefined {
    const key = trackerKey(channel, accountId);
    const tracker = trackers.get(key);
    if (!tracker) {
      return undefined;
    }
    return computeMetrics(tracker);
  }

  function getAllMetrics(): ChannelHealthMetrics[] {
    const results: ChannelHealthMetrics[] = [];
    for (const tracker of trackers.values()) {
      results.push(computeMetrics(tracker));
    }
    return results;
  }

  function getChannelsAtLevel(level: ChannelHealthLevel): ChannelHealthMetrics[] {
    return getAllMetrics().filter((m) => m.level === level);
  }

  function runCheck(): void {
    for (const tracker of trackers.values()) {
      evaluateTracker(tracker);
    }
  }

  function startPeriodicChecks(): void {
    if (stopped || timer) {
      return;
    }
    timer = setInterval(() => {
      if (stopped) {
        return;
      }
      runCheck();
    }, checkIntervalMs);
    if (timer && typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
  }

  function stop(): void {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  if (options?.abortSignal) {
    options.abortSignal.addEventListener("abort", stop, { once: true });
  }

  startPeriodicChecks();

  return {
    recordDelivery,
    recordConnectivity,
    getMetrics,
    getAllMetrics,
    getChannelsAtLevel,
    runCheck,
    stop,
  };
}
