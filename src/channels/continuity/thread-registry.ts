import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { ChatType } from "../chat-type.js";
import type { ChannelId } from "../plugins/types.js";

const log = createSubsystemLogger("channels/continuity/thread-registry");

/**
 * A conversation thread reference that can span multiple channels.
 * Each entry represents the same logical conversation on a specific channel.
 */
export type ThreadReference = {
  channel: ChannelId;
  accountId: string;
  /** Platform-specific thread/conversation ID. */
  threadId: string;
  /** Platform-specific user/peer ID. */
  peerId: string;
  peerKind: ChatType;
  /** When this thread reference was last active. */
  lastActiveAt: number;
};

/**
 * A cross-channel conversation thread that links related threads across platforms.
 * The `canonicalId` is a stable identifier for the logical conversation.
 */
export type ConversationThread = {
  canonicalId: string;
  /** Human-readable label for the conversation. */
  label?: string;
  /** The agent session key that owns this conversation. */
  sessionKey: string;
  /** All channel-specific thread references for this conversation. */
  references: ThreadReference[];
  createdAt: number;
  updatedAt: number;
};

export type ThreadRegistrySnapshot = {
  threads: ConversationThread[];
  byCanonicalId: Map<string, ConversationThread>;
};

export type ThreadRegistry = {
  /** Register or update a thread reference for a conversation. */
  registerThread: (params: RegisterThreadParams) => ConversationThread;
  /** Find a conversation by its canonical ID. */
  getThread: (canonicalId: string) => ConversationThread | undefined;
  /** Find all conversations that include a specific channel+peer. */
  findThreadsByChannelPeer: (channel: ChannelId, peerId: string) => ConversationThread[];
  /** Find a conversation that links a specific channel thread. */
  findThreadByChannelThread: (
    channel: ChannelId,
    threadId: string,
  ) => ConversationThread | undefined;
  /** Get all active threads for a session key. */
  getThreadsForSession: (sessionKey: string) => ConversationThread[];
  /** Link two existing threads as part of the same conversation. */
  linkThreads: (canonicalIdA: string, canonicalIdB: string) => ConversationThread | undefined;
  /** Remove stale thread references older than the given threshold. */
  pruneStaleThreads: (maxAgeMs: number) => number;
  /** Get a snapshot of the registry state. */
  snapshot: () => ThreadRegistrySnapshot;
};

export type RegisterThreadParams = {
  /** Stable conversation ID. If not provided, one is generated from channel+peer. */
  canonicalId?: string;
  sessionKey: string;
  channel: ChannelId;
  accountId: string;
  threadId: string;
  peerId: string;
  peerKind: ChatType;
  label?: string;
};

const DEFAULT_MAX_THREADS = 10_000;

export type ThreadRegistryOptions = {
  maxThreads?: number;
};

/**
 * Build a default canonical ID from a channel + peer combination.
 */
export function buildCanonicalThreadId(channel: ChannelId, peerId: string): string {
  return `thread:${channel}:${peerId}`.toLowerCase();
}

function buildChannelThreadKey(channel: ChannelId, threadId: string): string {
  return `${channel}:${threadId}`.toLowerCase();
}

function buildChannelPeerKey(channel: ChannelId, peerId: string): string {
  return `${channel}:${peerId}`.toLowerCase();
}

export function createThreadRegistry(options?: ThreadRegistryOptions): ThreadRegistry {
  const maxThreads = options?.maxThreads ?? DEFAULT_MAX_THREADS;

  const byCanonicalId = new Map<string, ConversationThread>();
  const byChannelThread = new Map<string, string>();
  const byChannelPeer = new Map<string, Set<string>>();
  const bySessionKey = new Map<string, Set<string>>();

  function indexReference(ref: ThreadReference, canonicalId: string): void {
    const threadKey = buildChannelThreadKey(ref.channel, ref.threadId);
    byChannelThread.set(threadKey, canonicalId);

    const peerKey = buildChannelPeerKey(ref.channel, ref.peerId);
    let peerSet = byChannelPeer.get(peerKey);
    if (!peerSet) {
      peerSet = new Set();
      byChannelPeer.set(peerKey, peerSet);
    }
    peerSet.add(canonicalId);
  }

  function removeIndex(ref: ThreadReference, canonicalId: string): void {
    const threadKey = buildChannelThreadKey(ref.channel, ref.threadId);
    if (byChannelThread.get(threadKey) === canonicalId) {
      byChannelThread.delete(threadKey);
    }

    const peerKey = buildChannelPeerKey(ref.channel, ref.peerId);
    const peerSet = byChannelPeer.get(peerKey);
    if (peerSet) {
      peerSet.delete(canonicalId);
      if (peerSet.size === 0) {
        byChannelPeer.delete(peerKey);
      }
    }
  }

  function indexSession(sessionKey: string, canonicalId: string): void {
    let sessionSet = bySessionKey.get(sessionKey);
    if (!sessionSet) {
      sessionSet = new Set();
      bySessionKey.set(sessionKey, sessionSet);
    }
    sessionSet.add(canonicalId);
  }

  function evictOldest(): void {
    if (byCanonicalId.size <= maxThreads) {
      return;
    }
    let oldestId: string | undefined;
    let oldestUpdatedAt = Number.POSITIVE_INFINITY;
    for (const [id, thread] of byCanonicalId) {
      if (thread.updatedAt < oldestUpdatedAt) {
        oldestUpdatedAt = thread.updatedAt;
        oldestId = id;
      }
    }
    if (oldestId) {
      const thread = byCanonicalId.get(oldestId);
      if (thread) {
        for (const ref of thread.references) {
          removeIndex(ref, oldestId);
        }
        const sessionSet = bySessionKey.get(thread.sessionKey);
        if (sessionSet) {
          sessionSet.delete(oldestId);
          if (sessionSet.size === 0) {
            bySessionKey.delete(thread.sessionKey);
          }
        }
        byCanonicalId.delete(oldestId);
        log.debug("evicted oldest thread", { canonicalId: oldestId });
      }
    }
  }

  function registerThread(params: RegisterThreadParams): ConversationThread {
    const now = Date.now();
    const canonicalId = params.canonicalId || buildCanonicalThreadId(params.channel, params.peerId);

    const existing = byCanonicalId.get(canonicalId);
    if (existing) {
      const refIdx = existing.references.findIndex(
        (r) => r.channel === params.channel && r.peerId === params.peerId,
      );

      const ref: ThreadReference = {
        channel: params.channel,
        accountId: params.accountId,
        threadId: params.threadId,
        peerId: params.peerId,
        peerKind: params.peerKind,
        lastActiveAt: now,
      };

      if (refIdx >= 0) {
        const oldRef = existing.references[refIdx];
        if (oldRef && oldRef.threadId !== params.threadId) {
          removeIndex(oldRef, canonicalId);
        }
        existing.references[refIdx] = ref;
      } else {
        existing.references.push(ref);
      }

      indexReference(ref, canonicalId);
      existing.updatedAt = now;
      if (params.label) {
        existing.label = params.label;
      }
      log.debug("updated thread reference", {
        canonicalId,
        channel: params.channel,
        peerId: params.peerId,
      });
      return existing;
    }

    const ref: ThreadReference = {
      channel: params.channel,
      accountId: params.accountId,
      threadId: params.threadId,
      peerId: params.peerId,
      peerKind: params.peerKind,
      lastActiveAt: now,
    };

    const thread: ConversationThread = {
      canonicalId,
      label: params.label,
      sessionKey: params.sessionKey,
      references: [ref],
      createdAt: now,
      updatedAt: now,
    };

    byCanonicalId.set(canonicalId, thread);
    indexReference(ref, canonicalId);
    indexSession(params.sessionKey, canonicalId);
    evictOldest();

    log.debug("registered new thread", {
      canonicalId,
      channel: params.channel,
      peerId: params.peerId,
    });
    return thread;
  }

  function getThread(canonicalId: string): ConversationThread | undefined {
    return byCanonicalId.get(canonicalId);
  }

  function findThreadsByChannelPeer(channel: ChannelId, peerId: string): ConversationThread[] {
    const peerKey = buildChannelPeerKey(channel, peerId);
    const ids = byChannelPeer.get(peerKey);
    if (!ids) {
      return [];
    }
    const results: ConversationThread[] = [];
    for (const id of ids) {
      const thread = byCanonicalId.get(id);
      if (thread) {
        results.push(thread);
      }
    }
    return results;
  }

  function findThreadByChannelThread(
    channel: ChannelId,
    threadId: string,
  ): ConversationThread | undefined {
    const threadKey = buildChannelThreadKey(channel, threadId);
    const canonicalId = byChannelThread.get(threadKey);
    if (!canonicalId) {
      return undefined;
    }
    return byCanonicalId.get(canonicalId);
  }

  function getThreadsForSession(sessionKey: string): ConversationThread[] {
    const ids = bySessionKey.get(sessionKey);
    if (!ids) {
      return [];
    }
    const results: ConversationThread[] = [];
    for (const id of ids) {
      const thread = byCanonicalId.get(id);
      if (thread) {
        results.push(thread);
      }
    }
    return results;
  }

  function linkThreads(canonicalIdA: string, canonicalIdB: string): ConversationThread | undefined {
    if (canonicalIdA === canonicalIdB) {
      return byCanonicalId.get(canonicalIdA);
    }
    const threadA = byCanonicalId.get(canonicalIdA);
    const threadB = byCanonicalId.get(canonicalIdB);
    if (!threadA || !threadB) {
      log.warn("cannot link threads: one or both not found", {
        canonicalIdA,
        canonicalIdB,
        aExists: Boolean(threadA),
        bExists: Boolean(threadB),
      });
      return undefined;
    }

    for (const ref of threadB.references) {
      const existingIdx = threadA.references.findIndex(
        (r) => r.channel === ref.channel && r.peerId === ref.peerId,
      );
      if (existingIdx >= 0) {
        const existingRef = threadA.references[existingIdx];
        if (existingRef && ref.lastActiveAt > existingRef.lastActiveAt) {
          threadA.references[existingIdx] = ref;
        }
      } else {
        threadA.references.push(ref);
      }
      indexReference(ref, canonicalIdA);
    }

    threadA.updatedAt = Math.max(threadA.updatedAt, threadB.updatedAt);

    const sessionSetB = bySessionKey.get(threadB.sessionKey);
    if (sessionSetB) {
      sessionSetB.delete(canonicalIdB);
      if (sessionSetB.size === 0) {
        bySessionKey.delete(threadB.sessionKey);
      }
    }
    byCanonicalId.delete(canonicalIdB);

    log.info("linked threads", {
      survivor: canonicalIdA,
      merged: canonicalIdB,
      totalRefs: threadA.references.length,
    });
    return threadA;
  }

  function pruneStaleThreads(maxAgeMs: number): number {
    const now = Date.now();
    const cutoff = now - maxAgeMs;
    let pruned = 0;

    for (const [id, thread] of byCanonicalId) {
      if (thread.updatedAt < cutoff) {
        for (const ref of thread.references) {
          removeIndex(ref, id);
        }
        const sessionSet = bySessionKey.get(thread.sessionKey);
        if (sessionSet) {
          sessionSet.delete(id);
          if (sessionSet.size === 0) {
            bySessionKey.delete(thread.sessionKey);
          }
        }
        byCanonicalId.delete(id);
        pruned += 1;
      }
    }

    if (pruned > 0) {
      log.info("pruned stale threads", { pruned, cutoffMs: maxAgeMs });
    }
    return pruned;
  }

  function snapshot(): ThreadRegistrySnapshot {
    return {
      threads: Array.from(byCanonicalId.values()),
      byCanonicalId: new Map(byCanonicalId),
    };
  }

  return {
    registerThread,
    getThread,
    findThreadsByChannelPeer,
    findThreadByChannelThread,
    getThreadsForSession,
    linkThreads,
    pruneStaleThreads,
    snapshot,
  };
}
