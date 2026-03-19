/**
 * SQLite-backed persistence for channel state.
 *
 * Stores identity groups, thread registry, failover state, and
 * context bridge messages so they survive process restarts.
 * When dbPath is omitted, uses in-memory state (lost on restart).
 */
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { requireNodeSqlite } from "../../memory/sqlite.js";

const log = createSubsystemLogger("channels/persistence/state-store");

const SCHEMA_VERSION = 1;

const CREATE_IDENTITY_GROUPS = `
  CREATE TABLE IF NOT EXISTS channel_identity_groups (
    group_id TEXT PRIMARY KEY,
    primary_name TEXT,
    link_method TEXT NOT NULL,
    linked_at INTEGER NOT NULL,
    last_active_at INTEGER NOT NULL
  );
`;

const CREATE_IDENTITY_LINKS = `
  CREATE TABLE IF NOT EXISTS channel_identity_links (
    group_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT,
    username TEXT,
    e164 TEXT,
    last_seen_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, channel, user_id)
  );
`;

const CREATE_THREADS = `
  CREATE TABLE IF NOT EXISTS channel_threads (
    canonical_id TEXT PRIMARY KEY,
    label TEXT,
    session_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

const CREATE_THREAD_REFS = `
  CREATE TABLE IF NOT EXISTS channel_thread_refs (
    canonical_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    account_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    peer_kind TEXT NOT NULL,
    last_active_at INTEGER NOT NULL,
    PRIMARY KEY (canonical_id, channel, account_id, thread_id)
  );
`;

const CREATE_FAILOVER_STATE = `
  CREATE TABLE IF NOT EXISTS channel_failover_state (
    user_key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    original_channel TEXT NOT NULL,
    target_channel TEXT NOT NULL,
    failed_over_at INTEGER NOT NULL,
    notified INTEGER NOT NULL,
    PRIMARY KEY (user_key, account_id, original_channel, target_channel)
  );
`;

const CREATE_BRIDGE_MESSAGES = `
  CREATE TABLE IF NOT EXISTS channel_bridge_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_canonical_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    source_channel TEXT NOT NULL
  );
`;

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

function createMemoryStore(): ChannelStateStore {
  let state: ChannelStateSnapshot = {
    identityGroups: [],
    identityLinks: [],
    threads: [],
    threadReferences: [],
    failoverState: [],
    bridgeMessages: [],
  };
  return {
    initialize: () =>
      log.info("channel state store initialized", {
        mode: "memory",
        schemaVersion: SCHEMA_VERSION,
      }),
    saveIdentityGroups: (groups, links) => {
      state.identityGroups = groups;
      state.identityLinks = links;
    },
    loadIdentityGroups: () => ({ groups: state.identityGroups, links: state.identityLinks }),
    saveThreads: (threads, refs) => {
      state.threads = threads;
      state.threadReferences = refs;
    },
    loadThreads: () => ({ threads: state.threads, refs: state.threadReferences }),
    saveFailoverState: (failovers) => {
      state.failoverState = failovers;
    },
    loadFailoverState: () => state.failoverState,
    saveBridgeMessages: (messages) => {
      state.bridgeMessages = messages;
    },
    loadBridgeMessages: () => state.bridgeMessages,
    saveAll: (snapshot) => {
      state = { ...snapshot };
    },
    loadAll: () => ({ ...state }),
    close: () => {},
  };
}

function createSqliteStore(dbPath: string): ChannelStateStore {
  const { DatabaseSync } = requireNodeSqlite();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 3000;");
  db.exec(CREATE_IDENTITY_GROUPS);
  db.exec(CREATE_IDENTITY_LINKS);
  db.exec(CREATE_THREADS);
  db.exec(CREATE_THREAD_REFS);
  db.exec(CREATE_FAILOVER_STATE);
  db.exec(CREATE_BRIDGE_MESSAGES);

  const insGroup = db.prepare(
    `INSERT INTO channel_identity_groups (group_id, primary_name, link_method, linked_at, last_active_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insLink = db.prepare(
    `INSERT INTO channel_identity_links (group_id, channel, user_id, display_name, username, e164, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insThread = db.prepare(
    `INSERT INTO channel_threads (canonical_id, label, session_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insRef = db.prepare(
    `INSERT INTO channel_thread_refs (canonical_id, channel, account_id, thread_id, peer_id, peer_kind, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insFailover = db.prepare(
    `INSERT INTO channel_failover_state (user_key, account_id, original_channel, target_channel, failed_over_at, notified)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insBridge = db.prepare(
    `INSERT INTO channel_bridge_messages (thread_canonical_id, role, content, timestamp, source_channel)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const selGroups = db.prepare("SELECT * FROM channel_identity_groups");
  const selLinks = db.prepare("SELECT * FROM channel_identity_links");
  const selThreads = db.prepare("SELECT * FROM channel_threads");
  const selRefs = db.prepare("SELECT * FROM channel_thread_refs");
  const selFailover = db.prepare("SELECT * FROM channel_failover_state");
  const selBridge = db.prepare("SELECT * FROM channel_bridge_messages");

  const delGroups = db.prepare("DELETE FROM channel_identity_groups");
  const delLinks = db.prepare("DELETE FROM channel_identity_links");
  const delThreads = db.prepare("DELETE FROM channel_threads");
  const delRefs = db.prepare("DELETE FROM channel_thread_refs");
  const delFailover = db.prepare("DELETE FROM channel_failover_state");
  const delBridge = db.prepare("DELETE FROM channel_bridge_messages");

  function runInTx(fn: () => void): void {
    db.exec("BEGIN TRANSACTION");
    try {
      fn();
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }

  return {
    initialize: () =>
      log.info("channel state store initialized", {
        mode: "sqlite",
        schemaVersion: SCHEMA_VERSION,
        path: dbPath,
      }),
    saveIdentityGroups: (groups, links) => {
      runInTx(() => {
        delGroups.run();
        delLinks.run();
        for (const g of groups) {
          insGroup.run(g.groupId, g.primaryName ?? null, g.linkMethod, g.linkedAt, g.lastActiveAt);
        }
        for (const l of links) {
          insLink.run(
            l.groupId,
            l.channel,
            l.userId,
            l.displayName ?? null,
            l.username ?? null,
            l.e164 ?? null,
            l.lastSeenAt,
          );
        }
      });
    },
    loadIdentityGroups: () => {
      const optStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
      const groups: PersistedIdentityGroup[] = [];
      const links: PersistedIdentityLink[] = [];
      for (const row of selGroups.all() as Array<Record<string, unknown>>) {
        groups.push({
          groupId: String(row.group_id),
          primaryName: optStr(row.primary_name),
          linkMethod: String(row.link_method),
          linkedAt: Number(row.linked_at),
          lastActiveAt: Number(row.last_active_at),
        });
      }
      for (const row of selLinks.all() as Array<Record<string, unknown>>) {
        links.push({
          groupId: String(row.group_id),
          channel: String(row.channel),
          userId: String(row.user_id),
          displayName: optStr(row.display_name),
          username: optStr(row.username),
          e164: optStr(row.e164),
          lastSeenAt: Number(row.last_seen_at),
        });
      }
      return { groups, links };
    },
    saveThreads: (threads, refs) => {
      runInTx(() => {
        delThreads.run();
        delRefs.run();
        for (const t of threads) {
          insThread.run(t.canonicalId, t.label ?? null, t.sessionKey, t.createdAt, t.updatedAt);
        }
        for (const r of refs) {
          insRef.run(
            r.canonicalId,
            r.channel,
            r.accountId,
            r.threadId,
            r.peerId,
            r.peerKind,
            r.lastActiveAt,
          );
        }
      });
    },
    loadThreads: () => {
      const threads: PersistedThread[] = [];
      const refs: PersistedThreadReference[] = [];
      const optStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
      for (const row of selThreads.all() as Array<Record<string, unknown>>) {
        threads.push({
          canonicalId: String(row.canonical_id),
          label: optStr(row.label),
          sessionKey: String(row.session_key),
          createdAt: Number(row.created_at),
          updatedAt: Number(row.updated_at),
        });
      }
      for (const row of selRefs.all() as Array<Record<string, unknown>>) {
        refs.push({
          canonicalId: String(row.canonical_id),
          channel: String(row.channel),
          accountId: String(row.account_id),
          threadId: String(row.thread_id),
          peerId: String(row.peer_id),
          peerKind: String(row.peer_kind),
          lastActiveAt: Number(row.last_active_at),
        });
      }
      return { threads, refs };
    },
    saveFailoverState: (failovers) => {
      runInTx(() => {
        delFailover.run();
        for (const f of failovers) {
          insFailover.run(
            f.userKey,
            f.accountId,
            f.originalChannel,
            f.targetChannel,
            f.failedOverAt,
            f.notified ? 1 : 0,
          );
        }
      });
    },
    loadFailoverState: () => {
      const out: PersistedFailoverState[] = [];
      for (const row of selFailover.all() as Array<Record<string, unknown>>) {
        out.push({
          userKey: String(row.user_key),
          accountId: String(row.account_id),
          originalChannel: String(row.original_channel),
          targetChannel: String(row.target_channel),
          failedOverAt: Number(row.failed_over_at),
          notified: Number(row.notified) !== 0,
        });
      }
      return out;
    },
    saveBridgeMessages: (messages) => {
      runInTx(() => {
        delBridge.run();
        for (const m of messages) {
          insBridge.run(m.threadCanonicalId, m.role, m.content, m.timestamp, m.sourceChannel);
        }
      });
    },
    loadBridgeMessages: () => {
      const out: PersistedBridgeMessage[] = [];
      for (const row of selBridge.all() as Array<Record<string, unknown>>) {
        out.push({
          threadCanonicalId: String(row.thread_canonical_id),
          role: String(row.role),
          content: String(row.content),
          timestamp: Number(row.timestamp),
          sourceChannel: String(row.source_channel),
        });
      }
      return out;
    },
    saveAll: (snapshot) => {
      runInTx(() => {
        delGroups.run();
        delLinks.run();
        delThreads.run();
        delRefs.run();
        delFailover.run();
        delBridge.run();
        for (const g of snapshot.identityGroups) {
          insGroup.run(g.groupId, g.primaryName ?? null, g.linkMethod, g.linkedAt, g.lastActiveAt);
        }
        for (const l of snapshot.identityLinks) {
          insLink.run(
            l.groupId,
            l.channel,
            l.userId,
            l.displayName ?? null,
            l.username ?? null,
            l.e164 ?? null,
            l.lastSeenAt,
          );
        }
        for (const t of snapshot.threads) {
          insThread.run(t.canonicalId, t.label ?? null, t.sessionKey, t.createdAt, t.updatedAt);
        }
        for (const r of snapshot.threadReferences) {
          insRef.run(
            r.canonicalId,
            r.channel,
            r.accountId,
            r.threadId,
            r.peerId,
            r.peerKind,
            r.lastActiveAt,
          );
        }
        for (const f of snapshot.failoverState) {
          insFailover.run(
            f.userKey,
            f.accountId,
            f.originalChannel,
            f.targetChannel,
            f.failedOverAt,
            f.notified ? 1 : 0,
          );
        }
        for (const m of snapshot.bridgeMessages) {
          insBridge.run(m.threadCanonicalId, m.role, m.content, m.timestamp, m.sourceChannel);
        }
      });
    },
    loadAll: () => {
      const g = selGroups.all() as Array<Record<string, unknown>>;
      const l = selLinks.all() as Array<Record<string, unknown>>;
      const t = selThreads.all() as Array<Record<string, unknown>>;
      const r = selRefs.all() as Array<Record<string, unknown>>;
      const f = selFailover.all() as Array<Record<string, unknown>>;
      const b = selBridge.all() as Array<Record<string, unknown>>;
      const optStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
      const rowToGroup = (row: Record<string, unknown>): PersistedIdentityGroup => ({
        groupId: String(row.group_id),
        primaryName: optStr(row.primary_name),
        linkMethod: String(row.link_method),
        linkedAt: Number(row.linked_at),
        lastActiveAt: Number(row.last_active_at),
      });
      const rowToLink = (row: Record<string, unknown>): PersistedIdentityLink => ({
        groupId: String(row.group_id),
        channel: String(row.channel),
        userId: String(row.user_id),
        displayName: optStr(row.display_name),
        username: optStr(row.username),
        e164: optStr(row.e164),
        lastSeenAt: Number(row.last_seen_at),
      });
      const rowToThread = (row: Record<string, unknown>): PersistedThread => ({
        canonicalId: String(row.canonical_id),
        label: optStr(row.label),
        sessionKey: String(row.session_key),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
      });
      const rowToRef = (row: Record<string, unknown>): PersistedThreadReference => ({
        canonicalId: String(row.canonical_id),
        channel: String(row.channel),
        accountId: String(row.account_id),
        threadId: String(row.thread_id),
        peerId: String(row.peer_id),
        peerKind: String(row.peer_kind),
        lastActiveAt: Number(row.last_active_at),
      });
      const rowToFailover = (row: Record<string, unknown>): PersistedFailoverState => ({
        userKey: String(row.user_key),
        accountId: String(row.account_id),
        originalChannel: String(row.original_channel),
        targetChannel: String(row.target_channel),
        failedOverAt: Number(row.failed_over_at),
        notified: Number(row.notified) !== 0,
      });
      const rowToBridge = (row: Record<string, unknown>): PersistedBridgeMessage => ({
        threadCanonicalId: String(row.thread_canonical_id),
        role: String(row.role),
        content: String(row.content),
        timestamp: Number(row.timestamp),
        sourceChannel: String(row.source_channel),
      });
      return {
        identityGroups: g.map(rowToGroup),
        identityLinks: l.map(rowToLink),
        threads: t.map(rowToThread),
        threadReferences: r.map(rowToRef),
        failoverState: f.map(rowToFailover),
        bridgeMessages: b.map(rowToBridge),
      };
    },
    close: () => {
      db.close();
      log.debug("channel state store closed", { path: dbPath });
    },
  };
}

/**
 * Create a channel state store.
 * When dbPath is provided, uses SQLite for durable persistence (survives restarts).
 * When omitted, uses in-memory state (lost on restart).
 */
export function createChannelStateStore(options?: ChannelStateStoreOptions): ChannelStateStore {
  const dbPath = options?.dbPath;
  if (dbPath) {
    return createSqliteStore(dbPath);
  }
  return createMemoryStore();
}
