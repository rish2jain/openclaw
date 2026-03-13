import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createIdentityLinker, type IdentityLinker } from "../continuity/identity-linker.js";
import { createHealthMonitor, type HealthMonitor } from "../health/health-monitor.js";
import type { FailoverConfig } from "./failover-config.js";
import { createFailoverRouter, type FailoverRouter } from "./failover-router.js";

describe("FailoverRouter", () => {
  let healthMonitor: HealthMonitor;
  let identityLinker: IdentityLinker;
  let router: FailoverRouter;
  let connectedChannels: Set<string>;

  const config: FailoverConfig = {
    enabled: true,
    defaultFallbackOrder: ["telegram", "discord", "slack"],
    userPreferences: new Map(),
    failoverGracePeriodMs: 0,
    failbackGracePeriodMs: 0,
  };

  beforeEach(() => {
    connectedChannels = new Set(["telegram:default", "discord:default", "slack:default"]);
    healthMonitor = createHealthMonitor(
      {
        isChannelConnected: (channel, accountId) =>
          connectedChannels.has(`${channel}:${accountId}`),
      },
      { checkIntervalMs: 999_999 },
    );
    identityLinker = createIdentityLinker();
    router = createFailoverRouter({ healthMonitor, identityLinker, config });
  });

  afterEach(() => {
    healthMonitor.stop();
  });

  describe("evaluateFailover", () => {
    it("does not trigger for healthy channels", () => {
      healthMonitor.recordDelivery({
        channel: "telegram",
        accountId: "default",
        latencyMs: 100,
        success: true,
      });
      const decision = router.evaluateFailover({
        channel: "telegram",
        accountId: "default",
        userKey: "user-1",
      });
      expect(decision.triggered).toBe(false);
    });

    it("triggers when unhealthy and identity linked", () => {
      connectedChannels.delete("telegram:default");
      for (let i = 0; i < 4; i++) {
        healthMonitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: 0,
          success: false,
        });
      }
      identityLinker.linkIdentities({
        identityA: { channel: "discord", userId: "user-1" },
        identityB: { channel: "telegram", userId: "user-1" },
        method: "config",
      });
      const decision = router.evaluateFailover({
        channel: "telegram",
        accountId: "default",
        userKey: "user-1",
      });
      expect(decision.triggered).toBe(true);
      expect(decision.targetChannel).toBeDefined();
    });

    it("does not trigger without linked identity", () => {
      connectedChannels.delete("telegram:default");
      for (let i = 0; i < 4; i++) {
        healthMonitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: 0,
          success: false,
        });
      }
      const decision = router.evaluateFailover({
        channel: "telegram",
        accountId: "default",
        userKey: "unlinked",
      });
      expect(decision.triggered).toBe(false);
    });

    it("does not trigger when globally disabled", () => {
      const disabled = createFailoverRouter({
        healthMonitor,
        identityLinker,
        config: { ...config, enabled: false },
      });
      const decision = disabled.evaluateFailover({
        channel: "telegram",
        accountId: "default",
        userKey: "user-1",
      });
      expect(decision.triggered).toBe(false);
    });

    it("returns existing failover", () => {
      connectedChannels.delete("telegram:default");
      for (let i = 0; i < 4; i++) {
        healthMonitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: 0,
          success: false,
        });
      }
      identityLinker.linkIdentities({
        identityA: { channel: "discord", userId: "user-1" },
        identityB: { channel: "telegram", userId: "user-1" },
        method: "config",
      });
      router.evaluateFailover({ channel: "telegram", accountId: "default", userKey: "user-1" });
      const second = router.evaluateFailover({
        channel: "telegram",
        accountId: "default",
        userKey: "user-1",
      });
      expect(second.triggered).toBe(true);
      expect(second.reason).toContain("active failover");
    });
  });

  describe("getActiveFailovers", () => {
    it("lists active failovers", () => {
      connectedChannels.delete("telegram:default");
      for (let i = 0; i < 4; i++) {
        healthMonitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: 0,
          success: false,
        });
      }
      identityLinker.linkIdentities({
        identityA: { channel: "discord", userId: "user-1" },
        identityB: { channel: "telegram", userId: "user-1" },
        method: "config",
      });
      router.evaluateFailover({ channel: "telegram", accountId: "default", userKey: "user-1" });
      expect(router.getActiveFailovers()).toHaveLength(1);
    });
  });

  describe("clearFailover", () => {
    it("removes an active failover", () => {
      connectedChannels.delete("telegram:default");
      for (let i = 0; i < 4; i++) {
        healthMonitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: 0,
          success: false,
        });
      }
      identityLinker.linkIdentities({
        identityA: { channel: "discord", userId: "user-1" },
        identityB: { channel: "telegram", userId: "user-1" },
        method: "config",
      });
      router.evaluateFailover({ channel: "telegram", accountId: "default", userKey: "user-1" });
      router.clearFailover("user-1", "telegram");
      expect(router.getActiveFailovers()).toHaveLength(0);
    });
  });

  describe("markNotified", () => {
    it("marks a failover as notified", () => {
      connectedChannels.delete("telegram:default");
      for (let i = 0; i < 4; i++) {
        healthMonitor.recordDelivery({
          channel: "telegram",
          accountId: "default",
          latencyMs: 0,
          success: false,
        });
      }
      identityLinker.linkIdentities({
        identityA: { channel: "discord", userId: "user-1" },
        identityB: { channel: "telegram", userId: "user-1" },
        method: "config",
      });
      router.evaluateFailover({ channel: "telegram", accountId: "default", userKey: "user-1" });
      router.markNotified("user-1", "telegram");
      expect(router.getActiveFailovers()[0]?.notified).toBe(true);
    });
  });
});
