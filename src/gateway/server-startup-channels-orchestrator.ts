/**
 * Initialize the channel orchestrator subsystem for the gateway.
 *
 * Creates and wires: MetricsExporter, delivery HealthMonitor,
 * IdentityLinker, ThreadRegistry, ContextBridge, MessageAdapter,
 * FailoverRouter, and ChannelOrchestrator.
 *
 * When stateDir is provided, channel state (identity groups, threads) is
 * persisted to SQLite and restored on startup.
 *
 * Returns all instances for attachment to GatewayRequestContext.
 */

import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMessageAdapter,
  type MessageAdapter,
} from "../channels/adaptation/message-adapter.js";
import type { ChatType } from "../channels/chat-type.js";
import { createContextBridge, type ContextBridge } from "../channels/continuity/context-bridge.js";
import {
  createIdentityLinker,
  type IdentityLinker,
} from "../channels/continuity/identity-linker.js";
import {
  createThreadRegistry,
  type ThreadRegistry,
} from "../channels/continuity/thread-registry.js";
import { createFailoverRouter, type FailoverRouter } from "../channels/failover/failover-router.js";
import { createHealthMonitor, type HealthMonitor } from "../channels/health/health-monitor.js";
import { healthLevelSeverity } from "../channels/health/health-status.js";
import {
  createChannelOrchestrator,
  type ChannelOrchestrator,
  type FailoverHistoryHolder,
} from "../channels/orchestrator.js";
import { createChannelStateStore } from "../channels/persistence/channel-state-store.js";
import type { ChannelId } from "../channels/plugins/types.js";
import { createMetricsExporter, type MetricsExporter } from "../infra/metrics-export.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway/channels-orchestrator");

const CHANNEL_STATE_DEBOUNCE_MS = 2_000;
const CHANNEL_STATE_OPEN_ATTEMPTS = 3;
const CHANNEL_STATE_RETRY_DELAYS_MS = [100, 250] as const;

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function verifyChannelStateDirWritable(channelsDir: string): void {
  mkdirSync(channelsDir, { recursive: true });
  accessSync(channelsDir, constants.R_OK | constants.W_OK);
  const probePath = join(channelsDir, `.write-test-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(probePath, "ok", { encoding: "utf8", flag: "w" });
  rmSync(probePath, { force: true });
}

export type ChannelOrchestratorSubsystems = {
  metricsExporter: MetricsExporter;
  deliveryHealthMonitor: HealthMonitor;
  identityLinker: IdentityLinker;
  threadRegistry: ThreadRegistry;
  contextBridge: ContextBridge;
  messageAdapter: MessageAdapter;
  failoverRouter: FailoverRouter;
  channelOrchestrator: ChannelOrchestrator;
  /** Flush pending channel state to disk (call on shutdown). No-op when persistence unavailable. */
  flushPendingState?: () => void;
};

export type OrchestratorInitDeps = {
  /** Check if a channel is currently connected. */
  isChannelConnected: (channel: ChannelId, accountId: string) => boolean;
  /** State directory for durable channel state (SQLite). When set, identity groups and threads persist across restarts. */
  stateDir?: string;
};

/**
 * Initialize all channel orchestrator subsystems.
 * Call once during gateway startup.
 */
export function initChannelOrchestratorSubsystems(
  deps: OrchestratorInitDeps,
): ChannelOrchestratorSubsystems {
  const metricsExporter = createMetricsExporter();

  const FAILOVER_HISTORY_CAP = 200;
  const failoverHistoryBuffer: Record<string, unknown>[] = [];
  const failoverHistoryHolder: FailoverHistoryHolder = {
    getFailoverHistory: (): ReadonlyArray<Record<string, unknown>> =>
      [...failoverHistoryBuffer] as ReadonlyArray<Record<string, unknown>>,
    addFailoverEvent(event: Record<string, unknown>): void {
      failoverHistoryBuffer.push(event);
      if (failoverHistoryBuffer.length > FAILOVER_HISTORY_CAP) {
        failoverHistoryBuffer.splice(0, failoverHistoryBuffer.length - FAILOVER_HISTORY_CAP);
      }
    },
  };

  // Delivery health monitor feeds metrics exporter on health changes.
  const deliveryHealthMonitor = createHealthMonitor({
    isChannelConnected: deps.isChannelConnected,
    onHealthChange: (event) => {
      metricsExporter.setGauge("channel_health_level", healthLevelSeverity(event.currentLevel), {
        channel: event.channel,
      });
      log.debug("health level changed", {
        channel: event.channel,
        accountId: event.accountId,
        from: event.previousLevel,
        to: event.currentLevel,
      });

      if (event.currentLevel === "unhealthy" || event.currentLevel === "offline") {
        failoverHistoryHolder.addFailoverEvent({
          type: "health_change",
          channel: event.channel,
          accountId: event.accountId,
          from: event.previousLevel,
          to: event.currentLevel,
          timestamp: new Date().toISOString(),
        });
      }
    },
  });

  const identityLinker = createIdentityLinker();
  const threadRegistry = createThreadRegistry();

  const stateDir = deps.stateDir;
  let afterStateChange: (() => void) | undefined;
  let flushPendingState: (() => void) | undefined;

  if (stateDir) {
    const channelsDir = join(stateDir, "channels");
    const dbPath = join(channelsDir, "state.sqlite");
    try {
      verifyChannelStateDirWritable(channelsDir);

      let store: ReturnType<typeof createChannelStateStore> | undefined;
      let openError: unknown;
      for (let attempt = 1; attempt <= CHANNEL_STATE_OPEN_ATTEMPTS; attempt += 1) {
        try {
          store = createChannelStateStore({ dbPath });
          break;
        } catch (err) {
          openError = err;
          if (attempt >= CHANNEL_STATE_OPEN_ATTEMPTS) {
            throw err;
          }
          const retryDelayMs = CHANNEL_STATE_RETRY_DELAYS_MS[attempt - 1] ?? 0;
          log.warn("channel state store open failed; retrying", {
            dbPath,
            attempt,
            retryDelayMs,
            error: String(err),
          });
          if (retryDelayMs > 0) {
            sleepSync(retryDelayMs);
          }
        }
      }
      if (!store) {
        throw openError instanceof Error ? openError : new Error(String(openError));
      }
      store.initialize();

      const loaded = store.loadAll();
      if (loaded.identityGroups.length > 0 || loaded.threads.length > 0) {
        identityLinker.restoreFromPersisted(
          loaded.identityGroups as Parameters<IdentityLinker["restoreFromPersisted"]>[0],
          loaded.identityLinks as Parameters<IdentityLinker["restoreFromPersisted"]>[1],
        );
        const refsByCanonicalId = new Map<string, (typeof loaded.threadReferences)[number][]>();
        for (const r of loaded.threadReferences) {
          const arr = refsByCanonicalId.get(r.canonicalId);
          if (arr) {
            arr.push(r);
          } else {
            refsByCanonicalId.set(r.canonicalId, [r]);
          }
        }
        const threads = loaded.threads.map((t) => ({
          canonicalId: t.canonicalId,
          label: t.label,
          sessionKey: t.sessionKey,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          references: (refsByCanonicalId.get(t.canonicalId) ?? []).map((r) => ({
            channel: r.channel,
            accountId: r.accountId,
            threadId: r.threadId,
            peerId: r.peerId,
            peerKind: r.peerKind as ChatType,
            lastActiveAt: r.lastActiveAt,
          })),
        })) as Parameters<ThreadRegistry["restoreFromPersisted"]>[0];
        threadRegistry.restoreFromPersisted(threads);
        log.info("restored channel state from persistence", {
          groups: loaded.identityGroups.length,
          threads: loaded.threads.length,
        });
      }

      let saveTimeout: ReturnType<typeof setTimeout> | undefined;

      const performSave = () => {
        try {
          const groups = identityLinker.exportGroups();
          const snap = threadRegistry.snapshot();
          const identityGroups = groups.map((g) => ({
            groupId: g.groupId,
            primaryName: g.primaryName,
            linkMethod: g.linkMethod,
            linkedAt: g.linkedAt,
            lastActiveAt: g.lastActiveAt,
          }));
          const identityLinks = groups.flatMap((g) =>
            g.identities.map((i) => ({
              groupId: g.groupId,
              channel: i.channel,
              userId: i.userId,
              displayName: i.displayName,
              username: i.username,
              e164: i.e164,
              lastSeenAt: i.lastSeenAt,
            })),
          );
          const threads = snap.threads.map((t) => ({
            canonicalId: t.canonicalId,
            label: t.label,
            sessionKey: t.sessionKey,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          }));
          const threadReferences = snap.threads.flatMap((t) =>
            t.references.map((r) => ({
              canonicalId: t.canonicalId,
              channel: r.channel,
              accountId: r.accountId,
              threadId: r.threadId,
              peerId: r.peerId,
              peerKind: r.peerKind,
              lastActiveAt: r.lastActiveAt,
            })),
          );
          store.saveAll({
            identityGroups,
            identityLinks,
            threads,
            threadReferences,
            failoverState: [],
            bridgeMessages: [],
          });
        } catch (err) {
          log.warn("channel state save failed", { dbPath, error: String(err) });
        }
      };

      afterStateChange = () => {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
          saveTimeout = undefined;
          performSave();
        }, CHANNEL_STATE_DEBOUNCE_MS);
      };

      flushPendingState = () => {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = undefined;
        }
        performSave();
      };
    } catch (err) {
      log.warn("channel state persistence unavailable; continuing with in-memory state", {
        dbPath,
        error: String(err),
      });
    }
  }

  const contextBridge = createContextBridge({ threadRegistry });
  const messageAdapter = createMessageAdapter();

  const failoverRouter = createFailoverRouter({
    healthMonitor: deliveryHealthMonitor,
    identityLinker,
  });

  const channelOrchestrator = createChannelOrchestrator({
    healthMonitor: deliveryHealthMonitor,
    failoverRouter,
    messageAdapter,
    contextBridge,
    identityLinker,
    threadRegistry,
    failoverHistoryHolder,
    afterStateChange,
  });

  log.info("channel orchestrator subsystems initialized", {
    stateDir: stateDir ? "persisted" : "in-memory",
  });

  return {
    metricsExporter,
    deliveryHealthMonitor,
    identityLinker,
    threadRegistry,
    contextBridge,
    messageAdapter,
    failoverRouter,
    channelOrchestrator,
    flushPendingState,
  };
}
