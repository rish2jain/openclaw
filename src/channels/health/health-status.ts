import type { ChannelId } from "../plugins/types.js";

export type ChannelHealthLevel = "healthy" | "degraded" | "unhealthy" | "offline";

export type ChannelHealthMetrics = {
  channel: ChannelId;
  accountId: string;
  level: ChannelHealthLevel;
  evaluatedAt: number;
  levelChangedAt: number;
  previousLevel?: ChannelHealthLevel;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  errorRate: number;
  messageAttempts: number;
  messageFailures: number;
  connected: boolean;
  consecutiveFailures: number;
  lastError?: string;
  uptimePercent: number | null;
};

export type ChannelHealthEvent = {
  type: "channel-health-change";
  channel: ChannelId;
  accountId: string;
  previousLevel: ChannelHealthLevel;
  currentLevel: ChannelHealthLevel;
  metrics: ChannelHealthMetrics;
  timestamp: number;
};

export type HealthThresholds = {
  degradedErrorRate: number;
  unhealthyErrorRate: number;
  degradedLatencyMs: number;
  unhealthyLatencyMs: number;
  unhealthyConsecutiveFailures: number;
  offlineConsecutiveFailures: number;
};

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  degradedErrorRate: 0.05,
  unhealthyErrorRate: 0.25,
  degradedLatencyMs: 5_000,
  unhealthyLatencyMs: 15_000,
  unhealthyConsecutiveFailures: 3,
  offlineConsecutiveFailures: 10,
};

export function evaluateHealthLevel(params: {
  connected: boolean;
  consecutiveFailures: number;
  errorRate: number;
  avgLatencyMs: number | null;
  thresholds: HealthThresholds;
}): ChannelHealthLevel {
  const { connected, consecutiveFailures, errorRate, avgLatencyMs, thresholds } = params;

  if (!connected) {
    if (consecutiveFailures >= thresholds.offlineConsecutiveFailures) {
      return "offline";
    }
    return "unhealthy";
  }

  if (consecutiveFailures >= thresholds.offlineConsecutiveFailures) {
    return "offline";
  }
  if (consecutiveFailures >= thresholds.unhealthyConsecutiveFailures) {
    return "unhealthy";
  }
  if (errorRate >= thresholds.unhealthyErrorRate) {
    return "unhealthy";
  }

  if (
    errorRate >= thresholds.degradedErrorRate ||
    (avgLatencyMs != null && avgLatencyMs >= thresholds.unhealthyLatencyMs)
  ) {
    return "degraded";
  }

  if (avgLatencyMs != null && avgLatencyMs >= thresholds.degradedLatencyMs) {
    return "degraded";
  }

  return "healthy";
}

export function isOperational(level: ChannelHealthLevel): boolean {
  return level === "healthy" || level === "degraded";
}

export function healthLevelSeverity(level: ChannelHealthLevel): number {
  switch (level) {
    case "healthy":
      return 0;
    case "degraded":
      return 1;
    case "unhealthy":
      return 2;
    case "offline":
      return 3;
  }
}

export function compareHealthLevels(a: ChannelHealthLevel, b: ChannelHealthLevel): number {
  return healthLevelSeverity(a) - healthLevelSeverity(b);
}
