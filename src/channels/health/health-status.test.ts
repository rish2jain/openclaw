import { describe, it, expect } from "vitest";
import {
  evaluateHealthLevel,
  isOperational,
  healthLevelSeverity,
  compareHealthLevels,
  DEFAULT_HEALTH_THRESHOLDS,
} from "./health-status.js";

describe("HealthStatus", () => {
  describe("evaluateHealthLevel", () => {
    it("returns healthy when all good", () => {
      expect(
        evaluateHealthLevel({
          connected: true,
          consecutiveFailures: 0,
          errorRate: 0,
          avgLatencyMs: 100,
          thresholds: DEFAULT_HEALTH_THRESHOLDS,
        }),
      ).toBe("healthy");
    });
    it("returns unhealthy when not connected", () => {
      expect(
        evaluateHealthLevel({
          connected: false,
          consecutiveFailures: 2,
          errorRate: 0,
          avgLatencyMs: null,
          thresholds: DEFAULT_HEALTH_THRESHOLDS,
        }),
      ).toBe("unhealthy");
    });
    it("returns offline when not connected with many failures", () => {
      expect(
        evaluateHealthLevel({
          connected: false,
          consecutiveFailures: 10,
          errorRate: 0,
          avgLatencyMs: null,
          thresholds: DEFAULT_HEALTH_THRESHOLDS,
        }),
      ).toBe("offline");
    });
    it("returns degraded with moderate error rate", () => {
      expect(
        evaluateHealthLevel({
          connected: true,
          consecutiveFailures: 0,
          errorRate: 0.08,
          avgLatencyMs: 100,
          thresholds: DEFAULT_HEALTH_THRESHOLDS,
        }),
      ).toBe("degraded");
    });
    it("returns unhealthy with high error rate", () => {
      expect(
        evaluateHealthLevel({
          connected: true,
          consecutiveFailures: 0,
          errorRate: 0.3,
          avgLatencyMs: 100,
          thresholds: DEFAULT_HEALTH_THRESHOLDS,
        }),
      ).toBe("unhealthy");
    });
    it("returns degraded with high latency", () => {
      expect(
        evaluateHealthLevel({
          connected: true,
          consecutiveFailures: 0,
          errorRate: 0,
          avgLatencyMs: 6_000,
          thresholds: DEFAULT_HEALTH_THRESHOLDS,
        }),
      ).toBe("degraded");
    });
    it("handles null latency", () => {
      expect(
        evaluateHealthLevel({
          connected: true,
          consecutiveFailures: 0,
          errorRate: 0,
          avgLatencyMs: null,
          thresholds: DEFAULT_HEALTH_THRESHOLDS,
        }),
      ).toBe("healthy");
    });
  });

  describe("isOperational", () => {
    it("healthy is operational", () => {
      expect(isOperational("healthy")).toBe(true);
    });
    it("degraded is operational", () => {
      expect(isOperational("degraded")).toBe(true);
    });
    it("unhealthy is not operational", () => {
      expect(isOperational("unhealthy")).toBe(false);
    });
    it("offline is not operational", () => {
      expect(isOperational("offline")).toBe(false);
    });
  });

  describe("healthLevelSeverity", () => {
    it("orders levels correctly", () => {
      expect(healthLevelSeverity("healthy")).toBeLessThan(healthLevelSeverity("degraded"));
      expect(healthLevelSeverity("degraded")).toBeLessThan(healthLevelSeverity("unhealthy"));
      expect(healthLevelSeverity("unhealthy")).toBeLessThan(healthLevelSeverity("offline"));
    });
  });

  describe("compareHealthLevels", () => {
    it("returns negative when a is better", () => {
      expect(compareHealthLevels("healthy", "degraded")).toBeLessThan(0);
    });
    it("returns positive when a is worse", () => {
      expect(compareHealthLevels("offline", "healthy")).toBeGreaterThan(0);
    });
    it("returns zero when equal", () => {
      expect(compareHealthLevels("degraded", "degraded")).toBe(0);
    });
  });
});
