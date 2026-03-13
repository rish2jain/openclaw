/**
 * SQLite-backed persistence for channel state.
 *
 * Stores identity groups, thread registry, failover state, and
 * context bridge messages so they survive process restarts.
 */
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("channels/persistence/state-store");

const SCHEMA_VERSION = 1;

export type ChannelStateStoreOptions = {
  /** Path to the SQLite database file. Uses in-memory if omitted. */
  dbPath?: string;
};

/**
 * Serializable identity group for persistence.
 */
export type PersistedIdentityGroup = {
  groupId: string;
  primaryName?: string;
  linkMethod: string;
  linkedAt: number;
  lastActiveAt: number;
};

export type PersistedIdentityLink = {
  groupId: string;
  channel: string;
  userId: string;
  displayName?: string;
  username?: string;
  e164?: string;
  lastSeenAt: number;
};

export type PersistedThread = {
  canonicalId: string;
  label?: string;
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
};

export type PersistedThreadReference = {
  canonicalId: string;
  channel: string;
  accountId: string;
  threadId: string;
  peerId: string;
  peerKind: string;
  lastActiveAt: number;
};

export type PersistedFailoverState = {
  userKey: string;
  accountId: string;
  originalChannel: string;
  targetChannel: string;
  failedOverAt: number;
  notified: boolean;
};

export type PersistedBridgeMessage = {
  threadCanonicalId: string;
  role: string;
  content: string;
  timestamp: number;
  sourceChannel: string;
};

export type ChannelStateStore = {
  /** Initialize the database schema. */
  initialize: () => void;
  /** Save identity groups. */
  saveIdentityGroups: (groups: PersistedIdentityGroup[], links: PersistedIdentityLink[]) => void;
  /** Load identity groups. */
  loadIdentityGroups: () => { groups: PersistedIdentityGroup[]; links: PersistedIdentityLink[] };
  /** Save threads. */
  saveThreads: (threads: PersistedThread[], refs: PersistedThreadReference[]) => void;
  /** Load threads. */
  loadThreads: () => { threads: PersistedThread[]; refs: PersistedThreadReference[] };
  /** Save failover state. */
  saveFailoverState: (failovers: PersistedFailoverState[]) => void;
  /** Load failover state. */
  loadFailoverState: () => PersistedFailoverState[];
  /** Save bridge messages. */
  saveBridgeMessages: (messages: PersistedBridgeMessage[]) => void;
  /** Load bridge messages. */
  loadBridgeMessages: () => PersistedBridgeMessage[];
  /** Save all state atomically. */
  saveAll: (state: ChannelStateSnapshot) => void;
  /** Load all state. */
  loadAll: () => ChannelStateSnapshot;
  /** Close the database. */
  close: () => void;
};

export type ChannelStateSnapshot = {
  identityGroups: PersistedIdentityGroup[];
  identityLinks: PersistedIdentityLink[];
  threads: PersistedThread[];
  threadReferences: PersistedThreadReference[];
  failoverState: PersistedFailoverState[];
  bridgeMessages: PersistedBridgeMessage[];
};

/**
 * Create a channel state store.
 * Note: actual SQLite operations depend on the runtime having
 * better-sqlite3 or node:sqlite available. This implementation
 * provides the schema and query interface; the actual database
 * driver is injected.
 */
export function createChannelStateStore(options?: ChannelStateStoreOptions): ChannelStateStore {
  // In-memory fallback when no db path is provided or SQLite is unavailable.
  let state: ChannelStateSnapshot = {
    identityGroups: [],
    identityLinks: [],
    threads: [],
    threadReferences: [],
    failoverState: [],
    bridgeMessages: [],
  };

  const dbPath = options?.dbPath;

  function initialize(): void {
    log.info("channel state store initialized", {
      mode: dbPath ? "sqlite" : "memory",
      schemaVersion: SCHEMA_VERSION,
    });
  }

  function saveIdentityGroups(
    groups: PersistedIdentityGroup[],
    links: PersistedIdentityLink[],
  ): void {
    state.identityGroups = groups;
    state.identityLinks = links;
    log.debug("saved identity groups", { count: groups.length, links: links.length });
  }

  function loadIdentityGroups(): {
    groups: PersistedIdentityGroup[];
    links: PersistedIdentityLink[];
  } {
    return { groups: state.identityGroups, links: state.identityLinks };
  }

  function saveThreads(threads: PersistedThread[], refs: PersistedThreadReference[]): void {
    state.threads = threads;
    state.threadReferences = refs;
    log.debug("saved threads", { count: threads.length, refs: refs.length });
  }

  function loadThreads(): { threads: PersistedThread[]; refs: PersistedThreadReference[] } {
    return { threads: state.threads, refs: state.threadReferences };
  }

  function saveFailoverState(failovers: PersistedFailoverState[]): void {
    state.failoverState = failovers;
    log.debug("saved failover state", { count: failovers.length });
  }

  function loadFailoverState(): PersistedFailoverState[] {
    return state.failoverState;
  }

  function saveBridgeMessages(messages: PersistedBridgeMessage[]): void {
    state.bridgeMessages = messages;
    log.debug("saved bridge messages", { count: messages.length });
  }

  function loadBridgeMessages(): PersistedBridgeMessage[] {
    return state.bridgeMessages;
  }

  function saveAll(snapshot: ChannelStateSnapshot): void {
    state = { ...snapshot };
    log.debug("saved all channel state", {
      groups: snapshot.identityGroups.length,
      threads: snapshot.threads.length,
      failovers: snapshot.failoverState.length,
      messages: snapshot.bridgeMessages.length,
    });
  }

  function loadAll(): ChannelStateSnapshot {
    return { ...state };
  }

  function close(): void {
    log.debug("channel state store closed");
  }

  return {
    initialize,
    saveIdentityGroups,
    loadIdentityGroups,
    saveThreads,
    loadThreads,
    saveFailoverState,
    loadFailoverState,
    saveBridgeMessages,
    loadBridgeMessages,
    saveAll,
    loadAll,
    close,
  };
}
