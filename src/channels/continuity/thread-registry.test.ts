import { describe, it, expect, beforeEach } from "vitest";
import {
  createThreadRegistry,
  buildCanonicalThreadId,
  type ThreadRegistry,
} from "./thread-registry.js";

describe("ThreadRegistry", () => {
  let registry: ThreadRegistry;

  beforeEach(() => {
    registry = createThreadRegistry({ maxThreads: 100 });
  });

  describe("registerThread", () => {
    it("creates a new thread with a single reference", () => {
      const thread = registry.registerThread({
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "chat-123",
        peerId: "user-456",
        peerKind: "direct",
        label: "Test User",
      });
      expect(thread.canonicalId).toBe("thread:telegram:user-456");
      expect(thread.label).toBe("Test User");
      expect(thread.sessionKey).toBe("agent:main:main");
      expect(thread.references).toHaveLength(1);
      expect(thread.references[0]?.channel).toBe("telegram");
    });

    it("adds a second reference on a different channel", () => {
      const canonicalId = "shared-thread-1";
      registry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-chat-1",
        peerId: "tg-user-1",
        peerKind: "direct",
      });
      const thread = registry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "discord",
        accountId: "default",
        threadId: "dc-channel-1",
        peerId: "dc-user-1",
        peerKind: "direct",
      });
      expect(thread.references).toHaveLength(2);
    });

    it("updates an existing reference when re-registered with same channel+peer", () => {
      const canonicalId = "update-thread";
      registry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "old-thread-id",
        peerId: "user-1",
        peerKind: "direct",
      });
      const thread = registry.registerThread({
        canonicalId,
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "new-thread-id",
        peerId: "user-1",
        peerKind: "direct",
      });
      expect(thread.references).toHaveLength(1);
      expect(thread.references[0]?.threadId).toBe("new-thread-id");
    });
  });

  describe("findThreadsByChannelPeer", () => {
    it("finds threads by channel and peer ID", () => {
      registry.registerThread({
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "chat-1",
        peerId: "user-100",
        peerKind: "direct",
      });
      const results = registry.findThreadsByChannelPeer("telegram", "user-100");
      expect(results).toHaveLength(1);
    });

    it("returns empty for unknown peer", () => {
      expect(registry.findThreadsByChannelPeer("telegram", "unknown")).toHaveLength(0);
    });
  });

  describe("findThreadByChannelThread", () => {
    it("finds by channel thread ID", () => {
      registry.registerThread({
        sessionKey: "agent:main:main",
        channel: "discord",
        accountId: "default",
        threadId: "discord-thread-999",
        peerId: "user-1",
        peerKind: "direct",
      });
      const result = registry.findThreadByChannelThread("discord", "discord-thread-999");
      expect(result).toBeDefined();
    });
  });

  describe("linkThreads", () => {
    it("merges two threads into one", () => {
      registry.registerThread({
        canonicalId: "thread-a",
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "tg-user",
        peerKind: "direct",
      });
      registry.registerThread({
        canonicalId: "thread-b",
        sessionKey: "agent:main:main",
        channel: "discord",
        accountId: "default",
        threadId: "dc-1",
        peerId: "dc-user",
        peerKind: "direct",
      });
      const merged = registry.linkThreads("thread-a", "thread-b");
      expect(merged).toBeDefined();
      expect(merged?.references).toHaveLength(2);
      expect(registry.getThread("thread-b")).toBeUndefined();
    });

    it("returns undefined when one thread does not exist", () => {
      registry.registerThread({
        canonicalId: "thread-a",
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "tg-user",
        peerKind: "direct",
      });
      expect(registry.linkThreads("thread-a", "nonexistent")).toBeUndefined();
    });

    it("is a no-op when linking a thread to itself", () => {
      registry.registerThread({
        canonicalId: "thread-a",
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "tg-user",
        peerKind: "direct",
      });
      const result = registry.linkThreads("thread-a", "thread-a");
      expect(result?.references).toHaveLength(1);
    });
  });

  describe("pruneStaleThreads", () => {
    it("removes threads older than the threshold", () => {
      const thread = registry.registerThread({
        canonicalId: "old-thread",
        sessionKey: "agent:main:main",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "tg-user",
        peerKind: "direct",
      });
      thread.updatedAt = Date.now() - 2 * 60 * 60_000;
      expect(registry.pruneStaleThreads(60 * 60_000)).toBe(1);
      expect(registry.getThread("old-thread")).toBeUndefined();
    });
  });

  describe("getThreadsForSession", () => {
    it("returns all threads for a session key", () => {
      const sessionKey = "agent:main:main";
      registry.registerThread({
        canonicalId: "thread-1",
        sessionKey,
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "user-1",
        peerKind: "direct",
      });
      registry.registerThread({
        canonicalId: "thread-2",
        sessionKey,
        channel: "discord",
        accountId: "default",
        threadId: "dc-1",
        peerId: "user-2",
        peerKind: "direct",
      });
      expect(registry.getThreadsForSession(sessionKey)).toHaveLength(2);
    });
  });

  describe("buildCanonicalThreadId", () => {
    it("builds deterministic canonical ID", () => {
      expect(buildCanonicalThreadId("telegram", "user-123")).toBe("thread:telegram:user-123");
    });
    it("normalizes to lowercase", () => {
      expect(buildCanonicalThreadId("Telegram", "User-123")).toBe("thread:telegram:user-123");
    });
  });

  describe("eviction", () => {
    it("evicts oldest thread when maxThreads exceeded", () => {
      const small = createThreadRegistry({ maxThreads: 2 });
      const t1 = small.registerThread({
        canonicalId: "t1",
        sessionKey: "s1",
        channel: "telegram",
        accountId: "default",
        threadId: "tg-1",
        peerId: "u1",
        peerKind: "direct",
      });
      t1.updatedAt = Date.now() - 10_000;
      small.registerThread({
        canonicalId: "t2",
        sessionKey: "s1",
        channel: "discord",
        accountId: "default",
        threadId: "dc-1",
        peerId: "u2",
        peerKind: "direct",
      });
      small.registerThread({
        canonicalId: "t3",
        sessionKey: "s1",
        channel: "slack",
        accountId: "default",
        threadId: "sl-1",
        peerId: "u3",
        peerKind: "direct",
      });
      expect(small.getThread("t1")).toBeUndefined();
      expect(small.getThread("t2")).toBeDefined();
      expect(small.getThread("t3")).toBeDefined();
    });
  });
});
