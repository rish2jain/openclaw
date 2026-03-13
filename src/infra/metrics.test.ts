import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { emitDiagnosticEvent, resetDiagnosticEventsForTest } from "./diagnostic-events.js";
import {
  initMetricsCollection,
  stopMetricsCollection,
  getChannelMetrics,
  getAllChannelMetrics,
  formatMetricsSummary,
  recordMessageReceived,
  recordMessageProcessed,
  resetMetricsForTest,
} from "./metrics.js";
import { resetSpanListenersForTest } from "./tracing.js";

describe("metrics", () => {
  beforeEach(() => {
    resetMetricsForTest();
    resetDiagnosticEventsForTest();
    resetSpanListenersForTest();
    initMetricsCollection();
  });

  afterEach(() => {
    stopMetricsCollection();
    resetMetricsForTest();
    resetDiagnosticEventsForTest();
  });

  it("returns undefined for unknown channels", () => {
    expect(getChannelMetrics("nonexistent")).toBeUndefined();
  });

  it("tracks webhook received events", () => {
    emitDiagnosticEvent({
      type: "webhook.received",
      channel: "telegram",
      updateType: "message",
    });

    const m = getChannelMetrics("telegram");
    expect(m).toBeDefined();
    expect(m?.messagesReceived).toBe(1);
    expect(m?.lastMessageAt).toBeDefined();
  });

  it("tracks message processing outcomes", () => {
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "discord",
      outcome: "completed",
      durationMs: 150,
    });
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "discord",
      outcome: "error",
      error: "timeout",
    });
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "discord",
      outcome: "skipped",
      reason: "debounced",
    });

    const m = getChannelMetrics("discord");
    expect(m?.messagesProcessed).toBe(1);
    expect(m?.messagesErrored).toBe(1);
    expect(m?.messagesSkipped).toBe(1);
  });

  it("tracks webhook errors", () => {
    emitDiagnosticEvent({
      type: "webhook.error",
      channel: "slack",
      error: "invalid signature",
    });

    const m = getChannelMetrics("slack");
    expect(m?.messagesErrored).toBe(1);
    expect(m?.lastErrorAt).toBeDefined();
  });

  it("calculates response time percentiles", () => {
    for (let i = 1; i <= 10; i++) {
      emitDiagnosticEvent({
        type: "message.processed",
        channel: "telegram",
        outcome: "completed",
        durationMs: i * 10,
      });
    }

    const m = getChannelMetrics("telegram");
    expect(m?.responseTime.count).toBe(10);
    expect(m?.responseTime.p50).toBeGreaterThan(0);
    expect(m?.responseTime.p95).toBeGreaterThanOrEqual(m?.responseTime.p50 ?? 0);
    expect(m?.responseTime.p99).toBeGreaterThanOrEqual(m?.responseTime.p95 ?? 0);
  });

  it("calculates error rate", () => {
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "signal",
      outcome: "completed",
      durationMs: 50,
    });
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "signal",
      outcome: "completed",
      durationMs: 60,
    });
    emitDiagnosticEvent({
      type: "message.processed",
      channel: "signal",
      outcome: "error",
      error: "fail",
    });

    const m = getChannelMetrics("signal");
    expect(m?.errorRate).toBeCloseTo(1 / 3, 2);
  });

  it("returns all channel metrics sorted alphabetically", () => {
    recordMessageReceived("zalo");
    recordMessageReceived("discord");
    recordMessageReceived("apple");

    const all = getAllChannelMetrics();
    expect(all).toHaveLength(3);
    expect(all.map((m) => m.channel)).toEqual(["apple", "discord", "zalo"]);
  });

  it("formats metrics summary lines", () => {
    recordMessageReceived("telegram");
    recordMessageProcessed("telegram", "completed", 100);
    recordMessageProcessed("telegram", "error");

    const lines = formatMetricsSummary();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("telegram"))).toBe(true);
    expect(lines.some((l) => l.includes("error rate"))).toBe(true);
  });

  it("returns placeholder when no metrics collected", () => {
    resetMetricsForTest();
    const lines = formatMetricsSummary();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("No channel metrics");
  });

  it("recordMessageReceived directly tracks messages", () => {
    recordMessageReceived("whatsapp");
    recordMessageReceived("whatsapp");

    const m = getChannelMetrics("whatsapp");
    expect(m?.messagesReceived).toBe(2);
  });

  it("recordMessageProcessed directly tracks outcomes", () => {
    recordMessageProcessed("imessage", "completed", 80);
    recordMessageProcessed("imessage", "completed", 120);
    recordMessageProcessed("imessage", "skipped");

    const m = getChannelMetrics("imessage");
    expect(m?.messagesProcessed).toBe(2);
    expect(m?.messagesSkipped).toBe(1);
    expect(m?.responseTime.count).toBe(2);
  });

  it("delivery success rate defaults to 1 with no delivery attempts", () => {
    recordMessageReceived("matrix");
    const m = getChannelMetrics("matrix");
    expect(m?.deliverySuccessRate).toBe(1);
  });
});
