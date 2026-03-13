import { describe, it, expect, beforeEach } from "vitest";
import { createContextBridge, type ContextBridge } from "./context-bridge.js";
import { createThreadRegistry, type ThreadRegistry } from "./thread-registry.js";

describe("ContextBridge", () => {
  let threadRegistry: ThreadRegistry;
  let bridge: ContextBridge;

  beforeEach(() => {
    threadRegistry = createThreadRegistry();
    bridge = createContextBridge(
      { threadRegistry },
      { maxMessages: 5, maxMessageAgeMs: 60 * 60_000 },
    );
  });

  describe("recordMessage + buildBridgeContext", () => {
    it("carries recent messages across channels", () => {
      const canonicalId = "test-thread";
      threadRegistry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "user-1",
        peerKind: "direct",
      });
      threadRegistry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "discord",
        accountId: "default",
        threadId: "dc-1",
        peerId: "user-1-dc",
        peerKind: "direct",
      });

      bridge.recordMessage({
        threadCanonicalId: canonicalId,
        channel: "telegram",
        role: "user",
        content: "Hello from Telegram",
      });
      bridge.recordMessage({
        threadCanonicalId: canonicalId,
        channel: "telegram",
        role: "assistant",
        content: "Hi there!",
      });

      const context = bridge.buildBridgeContext({
        threadCanonicalId: canonicalId,
        sourceChannel: "telegram",
        targetChannel: "discord",
        reason: "failover",
      });
      expect(context).toBeDefined();
      expect(context?.recentMessages).toHaveLength(2);
      expect(context?.reason).toBe("failover");
    });

    it("respects maxMessages limit", () => {
      const canonicalId = "busy-thread";
      threadRegistry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "user-1",
        peerKind: "direct",
      });
      for (let i = 0; i < 10; i++) {
        bridge.recordMessage({
          threadCanonicalId: canonicalId,
          channel: "telegram",
          role: "user",
          content: `Message ${i}`,
        });
      }
      const context = bridge.buildBridgeContext({
        threadCanonicalId: canonicalId,
        sourceChannel: "telegram",
        targetChannel: "discord",
        reason: "user-initiated",
      });
      expect(context?.recentMessages).toHaveLength(5);
    });

    it("returns undefined when thread does not exist", () => {
      expect(
        bridge.buildBridgeContext({
          threadCanonicalId: "nonexistent",
          sourceChannel: "telegram",
          targetChannel: "discord",
          reason: "user-initiated",
        }),
      ).toBeUndefined();
    });
  });

  describe("formatContextForAgent", () => {
    it("formats failover context", () => {
      const canonicalId = "format-test";
      threadRegistry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "user-1",
        peerKind: "direct",
      });
      bridge.recordMessage({
        threadCanonicalId: canonicalId,
        channel: "telegram",
        role: "user",
        content: "What is the weather?",
      });
      const context = bridge.buildBridgeContext({
        threadCanonicalId: canonicalId,
        sourceChannel: "telegram",
        targetChannel: "discord",
        reason: "failover",
      });
      const formatted = bridge.formatContextForAgent(context!);
      expect(formatted).toContain("moved from telegram to discord");
      expect(formatted).toContain("became unavailable");
    });
  });

  describe("formatSwitchNotice", () => {
    it("formats a failover notice", () => {
      const canonicalId = "notice-test";
      threadRegistry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "whatsapp",
        accountId: "default",
        threadId: "wa-1",
        peerId: "user-1",
        peerKind: "direct",
      });
      bridge.recordMessage({
        threadCanonicalId: canonicalId,
        channel: "whatsapp",
        role: "user",
        content: "Test",
      });
      const context = bridge.buildBridgeContext({
        threadCanonicalId: canonicalId,
        sourceChannel: "whatsapp",
        targetChannel: "telegram",
        reason: "channel-offline",
      });
      const notice = bridge.formatSwitchNotice(context!);
      expect(notice).toContain("whatsapp is currently unavailable");
    });
  });
});
