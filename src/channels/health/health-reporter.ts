import type { ChannelId } from "../plugins/types.js";
import type { HealthMonitor } from "./health-monitor.js";
import {
  type ChannelHealthLevel,
  type ChannelHealthMetrics,
  isOperational,
  healthLevelSeverity,
} from "./health-status.js";

export type ChannelHealthReport = {
  channel: ChannelId;
  accountId: string;
  level: ChannelHealthLevel;
  levelLabel: string;
  connected: boolean;
  operational: boolean;
  uptimePercent: string;
  avgLatency: string;
  p95Latency: string;
  errorRate: string;
  messageAttempts: number;
  messageFailures: number;
  consecutiveFailures: number;
  lastError?: string;
  levelChangedAt: number;
  evaluatedAt: number;
};

export type HealthSummary = {
  totalChannels: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  offline: number;
  overallLevel: ChannelHealthLevel;
  reports: ChannelHealthReport[];
};

export type HealthReporter = {
  getReport: (channel: ChannelId, accountId: string) => ChannelHealthReport | undefined;
  getAllReports: () => ChannelHealthReport[];
  getSummary: () => HealthSummary;
  formatReport: (report: ChannelHealthReport) => string;
  formatSummary: (summary: HealthSummary) => string;
};

function levelLabel(level: ChannelHealthLevel): string {
  switch (level) {
    case "healthy":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "unhealthy":
      return "Unhealthy";
    case "offline":
      return "Offline";
  }
}

function formatMs(value: number | null): string {
  if (value == null) {
    return "-";
  }
  if (value < 1) {
    return "<1ms";
  }
  return `${Math.round(value)}ms`;
}

function formatPercent(value: number | null): string {
  if (value == null) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

function formatErrorRate(rate: number): string {
  if (rate === 0) {
    return "0%";
  }
  return `${(rate * 100).toFixed(1)}%`;
}

function metricsToReport(metrics: ChannelHealthMetrics): ChannelHealthReport {
  return {
    channel: metrics.channel,
    accountId: metrics.accountId,
    level: metrics.level,
    levelLabel: levelLabel(metrics.level),
    connected: metrics.connected,
    operational: isOperational(metrics.level),
    uptimePercent: formatPercent(metrics.uptimePercent),
    avgLatency: formatMs(metrics.avgLatencyMs),
    p95Latency: formatMs(metrics.p95LatencyMs),
    errorRate: formatErrorRate(metrics.errorRate),
    messageAttempts: metrics.messageAttempts,
    messageFailures: metrics.messageFailures,
    consecutiveFailures: metrics.consecutiveFailures,
    lastError: metrics.lastError,
    levelChangedAt: metrics.levelChangedAt,
    evaluatedAt: metrics.evaluatedAt,
  };
}

export function createHealthReporter(monitor: HealthMonitor): HealthReporter {
  function getReport(channel: ChannelId, accountId: string): ChannelHealthReport | undefined {
    const metrics = monitor.getMetrics(channel, accountId);
    if (!metrics) {
      return undefined;
    }
    return metricsToReport(metrics);
  }

  function getAllReports(): ChannelHealthReport[] {
    return monitor
      .getAllMetrics()
      .map(metricsToReport)
      .toSorted((a, b) => {
        const severityDiff = healthLevelSeverity(b.level) - healthLevelSeverity(a.level);
        if (severityDiff !== 0) {
          return severityDiff;
        }
        return a.channel.localeCompare(b.channel);
      });
  }

  function getSummary(): HealthSummary {
    const reports = getAllReports();
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let offline = 0;
    for (const report of reports) {
      switch (report.level) {
        case "healthy":
          healthy += 1;
          break;
        case "degraded":
          degraded += 1;
          break;
        case "unhealthy":
          unhealthy += 1;
          break;
        case "offline":
          offline += 1;
          break;
      }
    }
    let overallLevel: ChannelHealthLevel = "healthy";
    if (offline > 0) {
      overallLevel = "offline";
    } else if (unhealthy > 0) {
      overallLevel = "unhealthy";
    } else if (degraded > 0) {
      overallLevel = "degraded";
    }

    return {
      totalChannels: reports.length,
      healthy,
      degraded,
      unhealthy,
      offline,
      overallLevel,
      reports,
    };
  }

  function formatReport(report: ChannelHealthReport): string {
    const lines: string[] = [];
    lines.push(`${report.channel} (${report.accountId}): ${report.levelLabel}`);
    lines.push(`  Connected: ${report.connected ? "yes" : "no"}`);
    lines.push(`  Uptime: ${report.uptimePercent}`);
    lines.push(`  Latency: avg=${report.avgLatency} p95=${report.p95Latency}`);
    lines.push(
      `  Errors: rate=${report.errorRate} (${report.messageFailures}/${report.messageAttempts})`,
    );
    if (report.consecutiveFailures > 0) {
      lines.push(`  Consecutive failures: ${report.consecutiveFailures}`);
    }
    if (report.lastError) {
      lines.push(`  Last error: ${report.lastError}`);
    }
    return lines.join("\n");
  }

  function formatSummary(summary: HealthSummary): string {
    const lines: string[] = [];
    lines.push(
      `Channel Health: ${levelLabel(summary.overallLevel)} (${summary.totalChannels} channels)`,
    );
    lines.push(
      `  Healthy: ${summary.healthy}  Degraded: ${summary.degraded}  Unhealthy: ${summary.unhealthy}  Offline: ${summary.offline}`,
    );
    lines.push("");
    for (const report of summary.reports) {
      lines.push(formatReport(report));
      lines.push("");
    }
    return lines.join("\n");
  }

  return { getReport, getAllReports, getSummary, formatReport, formatSummary };
}
