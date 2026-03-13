import { describe, it, expect, beforeEach } from "vitest";
import { createIdentityLinker, type IdentityLinker } from "./identity-linker.js";

describe("IdentityLinker", () => {
  let linker: IdentityLinker;
  beforeEach(() => {
    linker = createIdentityLinker();
  });

  describe("registerIdentity", () => {
    it("creates a singleton group for a new identity", () => {
      linker.registerIdentity({
        channel: "telegram",
        userId: "tg-1",
        displayName: "Alice",
        lastSeenAt: Date.now(),
      });
      const group = linker.findGroup("telegram", "tg-1");
      expect(group).toBeDefined();
      expect(group?.identities).toHaveLength(1);
      expect(group?.identities[0]?.displayName).toBe("Alice");
    });

    it("updates an existing identity", () => {
      linker.registerIdentity({
        channel: "telegram",
        userId: "tg-1",
        displayName: "Alice",
        lastSeenAt: Date.now() - 1000,
      });
      linker.registerIdentity({
        channel: "telegram",
        userId: "tg-1",
        displayName: "Alice Updated",
        lastSeenAt: Date.now(),
      });
      const group = linker.findGroup("telegram", "tg-1");
      expect(group?.identities).toHaveLength(1);
      expect(group?.identities[0]?.displayName).toBe("Alice Updated");
    });
  });

  describe("linkIdentities", () => {
    it("links two identities from different channels", () => {
      const group = linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "discord", userId: "dc-1" },
        method: "manual",
      });
      expect(group.identities).toHaveLength(2);
    });

    it("merges groups when linking already-grouped identities", () => {
      linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "whatsapp", userId: "wa-1" },
        method: "e164",
      });
      linker.linkIdentities({
        identityA: { channel: "discord", userId: "dc-1" },
        identityB: { channel: "slack", userId: "sl-1" },
        method: "username",
      });
      const merged = linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "discord", userId: "dc-1" },
        method: "verified",
      });
      expect(merged.identities).toHaveLength(4);
      const g1 = linker.findGroup("telegram", "tg-1");
      const g4 = linker.findGroup("slack", "sl-1");
      expect(g1?.groupId).toBe(g4?.groupId);
    });

    it("is idempotent", () => {
      linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "discord", userId: "dc-1" },
        method: "manual",
      });
      const group = linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "discord", userId: "dc-1" },
        method: "manual",
      });
      expect(group.identities).toHaveLength(2);
    });
  });

  describe("resolveIdentityOnChannel", () => {
    it("resolves a linked identity", () => {
      linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-alice" },
        identityB: { channel: "discord", userId: "dc-alice" },
        method: "config",
      });
      const resolved = linker.resolveIdentityOnChannel("telegram", "tg-alice", "discord");
      expect(resolved?.userId).toBe("dc-alice");
    });

    it("returns undefined for unknown source", () => {
      expect(linker.resolveIdentityOnChannel("telegram", "unknown", "discord")).toBeUndefined();
    });

    it("returns undefined when no identity on target channel", () => {
      linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "discord", userId: "dc-1" },
        method: "manual",
      });
      expect(linker.resolveIdentityOnChannel("telegram", "tg-1", "slack")).toBeUndefined();
    });
  });

  describe("loadFromConfig", () => {
    it("loads config-style identity links", () => {
      linker.loadFromConfig({ "telegram:123": ["discord:456", "slack:789"] });
      const group = linker.findGroup("telegram", "123");
      expect(group?.identities).toHaveLength(3);
      expect(linker.resolveIdentityOnChannel("telegram", "123", "discord")?.userId).toBe("456");
    });

    it("handles invalid entries gracefully", () => {
      linker.loadFromConfig({ invalid: ["also-invalid"], "telegram:valid": ["discord:valid"] });
      expect(linker.findGroup("telegram", "valid")?.identities).toHaveLength(2);
    });
  });

  describe("pruneStale", () => {
    it("removes stale groups", () => {
      const group = linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "discord", userId: "dc-1" },
        method: "manual",
      });
      group.lastActiveAt = Date.now() - 2 * 60 * 60_000;
      expect(linker.pruneStale(60 * 60_000)).toBe(1);
      expect(linker.findGroup("telegram", "tg-1")).toBeUndefined();
    });
  });

  describe("exportGroups", () => {
    it("exports all groups", () => {
      linker.linkIdentities({
        identityA: { channel: "telegram", userId: "tg-1" },
        identityB: { channel: "discord", userId: "dc-1" },
        method: "manual",
      });
      expect(linker.exportGroups()).toHaveLength(1);
    });
  });
});
