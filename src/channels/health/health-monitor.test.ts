import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHealthMonitor, type HealthMonitor } from "./health-monitor.js";
import type { ChannelHealthEvent } from "./health-status.js";

describe("HealthMonitor", () => {
  let monitor: HealthMonitor;
  let healthEvents: ChannelHealthEvent[];
  let connectedChannels: Set<string>;

  beforeEach(() => {
    healthEvents = [];
    connectedChannels = new Set(["telegram:default", "discord:default"]);
    monitor = createHealthMonitor(
      {
        isChannelConnected: (channel, accountId) =>
          connectedChannels.has(`${channel}:${accountId}`),
        onHealthChange: (event) => healthEvents.push(event),
      },
      { checkIntervalMs: 60_000, sampleWindowMs: 5 * 60_000 },
    );
  });

  afterEach(() => {
    monitor.stop();
  });

  describe("recordDelivery", () => {
    it("tracks successful deliveries", () => {
      monitor.recordDelivery({
        channel: "telegram",
        accountId: "default",
        latencyMs: 150,
        success: true,
      });
      const metrics = monitor.getMetrics("telegram", "default");
      expect(metrics?.level).toBe("healthy");
      expect(metrics?.messageAttempts).toBe(1);
    });

    it("tracks failed deliveries", () => {
      monitor.recordDelivery({
        channel: "telegram",
        accountId: "default",
        latencyMs: 0,
        success: false,
        error: "timeout",
      });
      const metrics = monitor.getMetrics("telegram", "default");
      expect(metrics?.messageFailures).toBe(1);
      expect(metrics?.lastError).toBe("timeout");
    });

    it("resets consecutive failures on success", () => {
      monitor.recordDelivery({
        channel: "telegram",
        accountId: "default",
        latencyMs: 0,
        success: false,
      });
      monitor.recordDelivery({
        channel: "telegram",
        accountId: "default",
        latencyMs: 0,
        success: false,
      });
      expect(monitor.getMetrics("telegram", "default")?.consecutiveFailures).toBe(2);
      monitor.recordDelivery({
        channel: "telegram",
        accountId: "default",
        latencyMs: 100,
        success: true,
      });
      expect(monitor.getMetrics("telegram", "default")?.consecutiveFailures).toBe(0);
    });

    it("emits health change on unhealthy transition", () => {
      for (let i = 0; i < 4; i++) {
        monitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: 0,
          success: false,
          error: "connection refused",
        });
      }
      expect(
        healthEvents.some((e) => e.currentLevel === "unhealthy" || e.currentLevel === "offline"),
      ).toBe(true);
    });
  });

  describe("recordConnectivity", () => {
    it("marks channel as disconnected", () => {
      connectedChannels.delete("telegram:default");
      monitor.recordConnectivity({
        channel: "telegram",
        accountId: "default",
        connected: false,
        error: "socket closed",
      });
      const metrics = monitor.getMetrics("telegram", "default");
      expect(metrics?.connected).toBe(false);
    });

    it("resets failures on reconnect", () => {
      connectedChannels.delete("telegram:default");
      monitor.recordConnectivity({ channel: "telegram", accountId: "default", connected: false });
      connectedChannels.add("telegram:default");
      monitor.recordConnectivity({ channel: "telegram", accountId: "default", connected: true });
      expect(monitor.getMetrics("telegram", "default")?.consecutiveFailures).toBe(0);
    });
  });

  describe("getAllMetrics", () => {
    it("returns all tracked channels", () => {
      monitor.recordDelivery({
        channel: "telegram",
        accountId: "default",
        latencyMs: 100,
        success: true,
      });
      monitor.recordDelivery({
        channel: "discord",
        accountId: "default",
        latencyMs: 200,
        success: true,
      });
      expect(monitor.getAllMetrics()).toHaveLength(2);
    });
  });

  describe("getMetrics returns undefined for untracked", () => {
    it("returns undefined for unknown channel", () => {
      expect(monitor.getMetrics("unknown", "default")).toBeUndefined();
    });
  });

  describe("latency metrics", () => {
    it("computes average and p95 latency", () => {
      for (const latency of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
        monitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: latency,
          success: true,
        });
      }
      const metrics = monitor.getMetrics("telegram", "default");
      expect(metrics?.avgLatencyMs).toBeCloseTo(550, 0);
      expect(metrics?.p95LatencyMs).toBe(1000);
    });
  });
});
