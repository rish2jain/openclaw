import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createChannelStateStore,
  type PersistedIdentityGroup,
  type PersistedIdentityLink,
  type PersistedThread,
  type PersistedThreadReference,
  type PersistedFailoverState,
  type PersistedBridgeMessage,
} from "./channel-state-store.js";

describe("channel-state-store", () => {
  describe("in-memory mode (no dbPath)", () => {
    it("persists and loads identity groups", () => {
      const store = createChannelStateStore();
      store.initialize();
      const groups: PersistedIdentityGroup[] = [
        { groupId: "g1", linkMethod: "e164", linkedAt: 1, lastActiveAt: 2 },
      ];
      const links: PersistedIdentityLink[] = [
        { groupId: "g1", channel: "telegram", userId: "u1", lastSeenAt: 3 },
      ];
      store.saveIdentityGroups(groups, links);
      const loaded = store.loadIdentityGroups();
      expect(loaded.groups).toEqual(groups);
      expect(loaded.links).toEqual(links);
    });

    it("persists and loads threads", () => {
      const store = createChannelStateStore();
      store.initialize();
      const threads: PersistedThread[] = [
        { canonicalId: "c1", sessionKey: "s1", createdAt: 1, updatedAt: 2 },
      ];
      const refs: PersistedThreadReference[] = [
        {
          canonicalId: "c1",
          channel: "telegram",
          accountId: "a1",
          threadId: "t1",
          peerId: "p1",
          peerKind: "user",
          lastActiveAt: 3,
        },
      ];
      store.saveThreads(threads, refs);
      const loaded = store.loadThreads();
      expect(loaded.threads).toEqual(threads);
      expect(loaded.refs).toEqual(refs);
    });

    it("persists and loads failover state", () => {
      const store = createChannelStateStore();
      store.initialize();
      const failovers: PersistedFailoverState[] = [
        {
          userKey: "uk1",
          accountId: "a1",
          originalChannel: "whatsapp",
          targetChannel: "telegram",
          failedOverAt: 100,
          notified: false,
        },
      ];
      store.saveFailoverState(failovers);
      expect(store.loadFailoverState()).toEqual(failovers);
    });

    it("persists and loads bridge messages", () => {
      const store = createChannelStateStore();
      store.initialize();
      const messages: PersistedBridgeMessage[] = [
        {
          threadCanonicalId: "c1",
          role: "user",
          content: "hello",
          timestamp: 1,
          sourceChannel: "telegram",
        },
      ];
      store.saveBridgeMessages(messages);
      expect(store.loadBridgeMessages()).toEqual(messages);
    });

    it("saveAll and loadAll round-trips full snapshot", () => {
      const store = createChannelStateStore();
      store.initialize();
      const snapshot = {
        identityGroups: [{ groupId: "g1", linkMethod: "manual", linkedAt: 1, lastActiveAt: 2 }],
        identityLinks: [{ groupId: "g1", channel: "slack", userId: "u1", lastSeenAt: 3 }],
        threads: [{ canonicalId: "c1", sessionKey: "s1", createdAt: 1, updatedAt: 2 }],
        threadReferences: [
          {
            canonicalId: "c1",
            channel: "slack",
            accountId: "a1",
            threadId: "t1",
            peerId: "p1",
            peerKind: "user",
            lastActiveAt: 3,
          },
        ],
        failoverState: [
          {
            userKey: "uk1",
            accountId: "a1",
            originalChannel: "whatsapp",
            targetChannel: "telegram",
            failedOverAt: 100,
            notified: true,
          },
        ],
        bridgeMessages: [
          {
            threadCanonicalId: "c1",
            role: "assistant",
            content: "hi",
            timestamp: 10,
            sourceChannel: "telegram",
          },
        ],
      };
      store.saveAll(snapshot);
      expect(store.loadAll()).toEqual(snapshot);
    });

    it("close is safe to call", () => {
      const store = createChannelStateStore();
      store.initialize();
      store.saveIdentityGroups([], []);
      expect(() => store.close()).not.toThrow();
    });
  });

  describe("SQLite mode (with dbPath)", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "channel-state-store-test-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("persists identity groups to disk and loads after reopen", () => {
      const dbPath = join(tmpDir, "state.sqlite");
      const store1 = createChannelStateStore({ dbPath });
      store1.initialize();
      const groups: PersistedIdentityGroup[] = [
        { groupId: "g1", primaryName: "Alice", linkMethod: "e164", linkedAt: 1, lastActiveAt: 2 },
      ];
      const links: PersistedIdentityLink[] = [
        { groupId: "g1", channel: "telegram", userId: "u1", displayName: "Alice", lastSeenAt: 3 },
      ];
      store1.saveIdentityGroups(groups, links);
      store1.close();

      const store2 = createChannelStateStore({ dbPath });
      store2.initialize();
      const loaded = store2.loadIdentityGroups();
      expect(loaded.groups).toEqual(groups);
      expect(loaded.links).toEqual(links);
      store2.close();
    });

    it("persists threads to disk and loads after reopen", () => {
      const dbPath = join(tmpDir, "state.sqlite");
      const store1 = createChannelStateStore({ dbPath });
      store1.initialize();
      const threads: PersistedThread[] = [
        { canonicalId: "c1", label: "Chat", sessionKey: "s1", createdAt: 1, updatedAt: 2 },
      ];
      const refs: PersistedThreadReference[] = [
        {
          canonicalId: "c1",
          channel: "telegram",
          accountId: "a1",
          threadId: "t1",
          peerId: "p1",
          peerKind: "user",
          lastActiveAt: 3,
        },
      ];
      store1.saveThreads(threads, refs);
      store1.close();

      const store2 = createChannelStateStore({ dbPath });
      store2.initialize();
      const loaded = store2.loadThreads();
      expect(loaded.threads).toEqual(threads);
      expect(loaded.refs).toEqual(refs);
      store2.close();
    });

    it("persists failover state to disk and loads after reopen", () => {
      const dbPath = join(tmpDir, "state.sqlite");
      const store1 = createChannelStateStore({ dbPath });
      store1.initialize();
      const failovers: PersistedFailoverState[] = [
        {
          userKey: "uk1",
          accountId: "a1",
          originalChannel: "whatsapp",
          targetChannel: "telegram",
          failedOverAt: 100,
          notified: false,
        },
      ];
      store1.saveFailoverState(failovers);
      store1.close();

      const store2 = createChannelStateStore({ dbPath });
      store2.initialize();
      expect(store2.loadFailoverState()).toEqual(failovers);
      store2.close();
    });

    it("saveAll persists full snapshot and loadAll restores after reopen", () => {
      const dbPath = join(tmpDir, "state.sqlite");
      const store1 = createChannelStateStore({ dbPath });
      store1.initialize();
      const snapshot = {
        identityGroups: [{ groupId: "g1", linkMethod: "manual", linkedAt: 1, lastActiveAt: 2 }],
        identityLinks: [{ groupId: "g1", channel: "slack", userId: "u1", lastSeenAt: 3 }],
        threads: [{ canonicalId: "c1", sessionKey: "s1", createdAt: 1, updatedAt: 2 }],
        threadReferences: [
          {
            canonicalId: "c1",
            channel: "slack",
            accountId: "a1",
            threadId: "t1",
            peerId: "p1",
            peerKind: "user",
            lastActiveAt: 3,
          },
        ],
        failoverState: [
          {
            userKey: "uk1",
            accountId: "a1",
            originalChannel: "whatsapp",
            targetChannel: "telegram",
            failedOverAt: 100,
            notified: true,
          },
        ],
        bridgeMessages: [
          {
            threadCanonicalId: "c1",
            role: "assistant",
            content: "hi",
            timestamp: 10,
            sourceChannel: "telegram",
          },
        ],
      };
      store1.saveAll(snapshot);
      store1.close();

      const store2 = createChannelStateStore({ dbPath });
      store2.initialize();
      expect(store2.loadAll()).toEqual(snapshot);
      store2.close();
    });
  });
});
