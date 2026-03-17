import { describe, it, expect, vi } from "vitest";
import { createHealthDashboardTool } from "./health-dashboard.js";

type Snapshot = {
  counters: Record<string, Array<{ value: number; labels: Record<string, string> }>>;
  gauges: Record<string, Array<{ value: number; labels: Record<string, string> }>>;
  histograms: Record<
    string,
    Array<{
      count: number;
      sum: number;
      avg: number;
      p50: number | null;
      p95: number | null;
      p99: number | null;
      labels: Record<string, string>;
    }>
  >;
  exportedAt: number;
};

function emptySnapshot(): Snapshot {
  return { counters: {}, gauges: {}, histograms: {}, exportedAt: Date.now() };
}

function richSnapshot(): Snapshot {
  return {
    counters: {
      openclaw_channel_delivery_total: [
        { value: 100, labels: { channel: "telegram", status: "success" } },
        { value: 5, labels: { channel: "telegram", status: "failed" } },
      ],
      openclaw_failover_total: [{ value: 2, labels: { channel: "telegram" } }],
    },
    gauges: {
      openclaw_channel_health_level: [
        { value: 0, labels: { channel: "telegram", account: "default" } },
        { value: 2, labels: { channel: "discord", account: "default" } },
      ],
      openclaw_circuit_breaker_state: [
        { value: 0, labels: { channel: "telegram" } },
        { value: 1, labels: { channel: "discord" } },
      ],
    },
    histograms: {
      openclaw_channel_delivery_latency_ms: [
        {
          count: 50,
          sum: 5000,
          avg: 100,
          p50: 90,
          p95: 200,
          p99: 500,
          labels: { channel: "telegram" },
        },
      ],
    },
    exportedAt: 1710500000000,
  };
}

function mockGateway(snapshot: Snapshot) {
  return vi.fn().mockResolvedValue(snapshot);
}

describe("health_dashboard tool", () => {
  describe("definition", () => {
    it("has correct name and schema", () => {
      const tool = createHealthDashboardTool(mockGateway(emptySnapshot()));
      expect(tool.definition.name).toBe("health_dashboard");
      expect(tool.definition.inputSchema.properties).toHaveProperty("view");
    });
  });

  describe("execute — summary (default)", () => {
    it("returns summary view when no view specified", async () => {
      const tool = createHealthDashboardTool(mockGateway(richSnapshot()));

      const result = await tool.execute({});

      expect(result.content[0].text).toContain("Summary");
      expect(result.content[0].text).toContain("Channels monitored: 2");
      expect(result.content[0].text).toContain("Total deliveries: 105");
      expect(result.content[0].text).toContain("Total failovers: 2");
      expect(result.content[0].text).toContain("Circuit breakers tracked: 2");
    });

    it("handles empty metrics gracefully", async () => {
      const tool = createHealthDashboardTool(mockGateway(emptySnapshot()));

      const result = await tool.execute({});

      expect(result.content[0].text).toContain("Channels monitored: 0");
      expect(result.content[0].text).toContain("Total deliveries: 0");
    });
  });

  describe("execute — channels", () => {
    it("shows per-channel health levels", async () => {
      const tool = createHealthDashboardTool(mockGateway(richSnapshot()));

      const result = await tool.execute({ view: "channels" });

      expect(result.content[0].text).toContain("Channels");
      expect(result.content[0].text).toContain("telegram");
      expect(result.content[0].text).toContain("healthy");
      expect(result.content[0].text).toContain("discord");
      expect(result.content[0].text).toContain("unhealthy");
    });

    it("shows 'No channel health data' when empty", async () => {
      const tool = createHealthDashboardTool(mockGateway(emptySnapshot()));

      const result = await tool.execute({ view: "channels" });

      expect(result.content[0].text).toContain("No channel health data available.");
    });
  });

  describe("execute — delivery", () => {
    it("shows delivery counts and latency", async () => {
      const tool = createHealthDashboardTool(mockGateway(richSnapshot()));

      const result = await tool.execute({ view: "delivery" });

      expect(result.content[0].text).toContain("Delivery Stats");
      expect(result.content[0].text).toContain("telegram [success]: 100");
      expect(result.content[0].text).toContain("telegram [failed]: 5");
      expect(result.content[0].text).toContain("Latency (ms)");
      expect(result.content[0].text).toContain("avg=100.0");
    });

    it("shows 'No delivery data' when empty", async () => {
      const tool = createHealthDashboardTool(mockGateway(emptySnapshot()));

      const result = await tool.execute({ view: "delivery" });

      expect(result.content[0].text).toContain("No delivery data available.");
    });
  });

  describe("execute — circuits", () => {
    it("shows circuit breaker states", async () => {
      const tool = createHealthDashboardTool(mockGateway(richSnapshot()));

      const result = await tool.execute({ view: "circuits" });

      expect(result.content[0].text).toContain("Circuit Breakers");
      expect(result.content[0].text).toContain("telegram");
      expect(result.content[0].text).toContain("closed");
      expect(result.content[0].text).toContain("discord");
      expect(result.content[0].text).toContain("open");
    });

    it("shows 'No circuit breaker data' when empty", async () => {
      const tool = createHealthDashboardTool(mockGateway(emptySnapshot()));

      const result = await tool.execute({ view: "circuits" });

      expect(result.content[0].text).toContain("No circuit breaker data available.");
    });
  });

  describe("execute — invalid view", () => {
    it("returns error for unknown view", async () => {
      const tool = createHealthDashboardTool(mockGateway(emptySnapshot()));

      const result = await tool.execute({ view: "invalid" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("must be one of");
    });
  });
});
