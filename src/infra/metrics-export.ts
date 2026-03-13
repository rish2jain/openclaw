/**
 * Lightweight metrics aggregator for OpenClaw observability.
 *
 * Collects metrics from channel health, failover, and delivery systems.
 * Exposes as JSON snapshot and Prometheus exposition format.
 */
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/metrics-export");

export type MetricType = "counter" | "gauge" | "histogram";

type MetricEntry = {
  name: string;
  type: MetricType;
  help: string;
  labels: Record<string, string>;
  value: number;
  updatedAt: number;
};

type HistogramEntry = {
  name: string;
  help: string;
  labels: Record<string, string>;
  samples: number[];
  maxSamples: number;
  updatedAt: number;
};

export type MetricsSnapshot = {
  counters: Record<string, { value: number; labels: Record<string, string> }[]>;
  gauges: Record<string, { value: number; labels: Record<string, string> }[]>;
  histograms: Record<
    string,
    {
      count: number;
      sum: number;
      avg: number;
      p50: number | null;
      p95: number | null;
      p99: number | null;
      labels: Record<string, string>;
    }[]
  >;
  exportedAt: number;
};

export type MetricsExporter = {
  /** Increment a counter. */
  incrementCounter: (name: string, labels?: Record<string, string>, delta?: number) => void;
  /** Set a gauge value. */
  setGauge: (name: string, value: number, labels?: Record<string, string>) => void;
  /** Record a histogram observation. */
  observeHistogram: (name: string, value: number, labels?: Record<string, string>) => void;
  /** Register a metric with description. */
  register: (name: string, type: MetricType, help: string) => void;
  /** Get a JSON snapshot of all metrics. */
  getSnapshot: () => MetricsSnapshot;
  /** Get metrics in Prometheus exposition format. */
  getPrometheusText: () => string;
  /** Reset all metrics. */
  reset: () => void;
};

export type MetricsExporterOptions = {
  /** Max histogram samples per metric+labels. Default: 1000. */
  maxHistogramSamples?: number;
  /** Metric name prefix. Default: "openclaw_". */
  prefix?: string;
};

function metricKey(name: string, labels: Record<string, string>): string {
  const sorted = Object.entries(labels).toSorted(([a], [b]) => a.localeCompare(b));
  const labelStr = sorted.map(([k, v]) => `${k}="${v}"`).join(",");
  return labelStr ? `${name}{${labelStr}}` : name;
}

function computePercentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? null;
}

export function createMetricsExporter(options?: MetricsExporterOptions): MetricsExporter {
  const maxHistogramSamples = options?.maxHistogramSamples ?? 1000;
  const prefix = options?.prefix ?? "openclaw_";

  const counters = new Map<string, MetricEntry>();
  const gauges = new Map<string, MetricEntry>();
  const histograms = new Map<string, HistogramEntry>();
  const helpMap = new Map<string, { type: MetricType; help: string }>();

  function register(name: string, type: MetricType, help: string): void {
    helpMap.set(prefix + name, { type, help });
  }

  function incrementCounter(name: string, labels: Record<string, string> = {}, delta = 1): void {
    const fullName = prefix + name;
    const key = metricKey(fullName, labels);
    const existing = counters.get(key);
    if (existing) {
      existing.value += delta;
      existing.updatedAt = Date.now();
    } else {
      counters.set(key, {
        name: fullName,
        type: "counter",
        help: helpMap.get(fullName)?.help ?? "",
        labels,
        value: delta,
        updatedAt: Date.now(),
      });
    }
  }

  function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const fullName = prefix + name;
    const key = metricKey(fullName, labels);
    gauges.set(key, {
      name: fullName,
      type: "gauge",
      help: helpMap.get(fullName)?.help ?? "",
      labels,
      value,
      updatedAt: Date.now(),
    });
  }

  function observeHistogram(
    name: string,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    const fullName = prefix + name;
    const key = metricKey(fullName, labels);
    const existing = histograms.get(key);
    if (existing) {
      existing.samples.push(value);
      if (existing.samples.length > maxHistogramSamples) {
        existing.samples = existing.samples.slice(existing.samples.length - maxHistogramSamples);
      }
      existing.updatedAt = Date.now();
    } else {
      histograms.set(key, {
        name: fullName,
        help: helpMap.get(fullName)?.help ?? "",
        labels,
        samples: [value],
        maxSamples: maxHistogramSamples,
        updatedAt: Date.now(),
      });
    }
  }

  function getSnapshot(): MetricsSnapshot {
    const snapshot: MetricsSnapshot = {
      counters: {},
      gauges: {},
      histograms: {},
      exportedAt: Date.now(),
    };

    for (const entry of counters.values()) {
      if (!snapshot.counters[entry.name]) {
        snapshot.counters[entry.name] = [];
      }
      snapshot.counters[entry.name].push({ value: entry.value, labels: entry.labels });
    }

    for (const entry of gauges.values()) {
      if (!snapshot.gauges[entry.name]) {
        snapshot.gauges[entry.name] = [];
      }
      snapshot.gauges[entry.name].push({ value: entry.value, labels: entry.labels });
    }

    for (const entry of histograms.values()) {
      if (!snapshot.histograms[entry.name]) {
        snapshot.histograms[entry.name] = [];
      }
      const sorted = entry.samples.toSorted((a, b) => a - b);
      const sum = sorted.reduce((s, v) => s + v, 0);
      snapshot.histograms[entry.name].push({
        count: sorted.length,
        sum,
        avg: sorted.length > 0 ? sum / sorted.length : 0,
        p50: computePercentile(sorted, 50),
        p95: computePercentile(sorted, 95),
        p99: computePercentile(sorted, 99),
        labels: entry.labels,
      });
    }

    return snapshot;
  }

  function formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) {
      return "";
    }
    return "{" + entries.map(([k, v]) => `${k}="${v}"`).join(",") + "}";
  }

  function getPrometheusText(): string {
    const lines: string[] = [];
    const seen = new Set<string>();

    for (const entry of counters.values()) {
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        const info = helpMap.get(entry.name);
        if (info) {
          lines.push(`# HELP ${entry.name} ${info.help}`);
        }
        lines.push(`# TYPE ${entry.name} counter`);
      }
      lines.push(`${entry.name}${formatLabels(entry.labels)} ${entry.value}`);
    }

    for (const entry of gauges.values()) {
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        const info = helpMap.get(entry.name);
        if (info) {
          lines.push(`# HELP ${entry.name} ${info.help}`);
        }
        lines.push(`# TYPE ${entry.name} gauge`);
      }
      lines.push(`${entry.name}${formatLabels(entry.labels)} ${entry.value}`);
    }

    for (const entry of histograms.values()) {
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        const info = helpMap.get(entry.name);
        if (info) {
          lines.push(`# HELP ${entry.name} ${info.help}`);
        }
        lines.push(`# TYPE ${entry.name} summary`);
      }
      const sorted = entry.samples.toSorted((a, b) => a - b);
      const sum = sorted.reduce((s, v) => s + v, 0);
      const lbls = formatLabels(entry.labels);
      const p50 = computePercentile(sorted, 50);
      const p95 = computePercentile(sorted, 95);
      const p99 = computePercentile(sorted, 99);
      if (p50 !== null) {
        lines.push(`${entry.name}${formatLabels({ ...entry.labels, quantile: "0.5" })} ${p50}`);
      }
      if (p95 !== null) {
        lines.push(`${entry.name}${formatLabels({ ...entry.labels, quantile: "0.95" })} ${p95}`);
      }
      if (p99 !== null) {
        lines.push(`${entry.name}${formatLabels({ ...entry.labels, quantile: "0.99" })} ${p99}`);
      }
      lines.push(`${entry.name}_sum${lbls} ${sum}`);
      lines.push(`${entry.name}_count${lbls} ${sorted.length}`);
    }

    return lines.join("\n") + "\n";
  }

  function reset(): void {
    counters.clear();
    gauges.clear();
    histograms.clear();
    log.debug("metrics reset");
  }

  // Register default OpenClaw metrics.
  register(
    "channel_health_level",
    "gauge",
    "Current health level of a channel (0=healthy, 1=degraded, 2=unhealthy, 3=offline)",
  );
  register("channel_delivery_total", "counter", "Total message delivery attempts");
  register("channel_delivery_latency_ms", "histogram", "Message delivery latency in milliseconds");
  register("failover_total", "counter", "Total failover events triggered");
  register("failover_duration_seconds", "histogram", "Duration of failover episodes in seconds");
  register("memory_entries_total", "gauge", "Total entries in memory tiers");
  register("agent_requests_total", "counter", "Total agent requests processed");
  register(
    "circuit_breaker_state",
    "gauge",
    "Circuit breaker state (0=closed, 1=open, 2=half_open)",
  );

  return {
    incrementCounter,
    setGauge,
    observeHistogram,
    register,
    getSnapshot,
    getPrometheusText,
    reset,
  };
}
