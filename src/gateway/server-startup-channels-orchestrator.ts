/**
 * Initialize the channel orchestrator subsystem for the gateway.
 *
 * Creates and wires: MetricsExporter, delivery HealthMonitor,
 * IdentityLinker, ThreadRegistry, ContextBridge, MessageAdapter,
 * FailoverRouter, and ChannelOrchestrator.
 *
 * Returns all instances for attachment to GatewayRequestContext.
 */

import {
  createMessageAdapter,
  type MessageAdapter,
} from "../channels/adaptation/message-adapter.js";
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
import { createChannelOrchestrator, type ChannelOrchestrator } from "../channels/orchestrator.js";
import type { ChannelId } from "../channels/plugins/types.js";
import { createMetricsExporter, type MetricsExporter } from "../infra/metrics-export.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway/channels-orchestrator");

export type ChannelOrchestratorSubsystems = {
  metricsExporter: MetricsExporter;
  deliveryHealthMonitor: HealthMonitor;
  identityLinker: IdentityLinker;
  threadRegistry: ThreadRegistry;
  contextBridge: ContextBridge;
  messageAdapter: MessageAdapter;
  failoverRouter: FailoverRouter;
  channelOrchestrator: ChannelOrchestrator;
  failoverHistory: Array<Record<string, unknown>>;
};

export type OrchestratorInitDeps = {
  /** Check if a channel is currently connected. */
  isChannelConnected: (channel: ChannelId, accountId: string) => boolean;
};

/**
 * Initialize all channel orchestrator subsystems.
 * Call once during gateway startup.
 */
export function initChannelOrchestratorSubsystems(
  deps: OrchestratorInitDeps,
): ChannelOrchestratorSubsystems {
  const metricsExporter = createMetricsExporter();
  const failoverHistory: Array<Record<string, unknown>> = [];

  // Delivery health monitor feeds metrics exporter on health changes.
  const deliveryHealthMonitor = createHealthMonitor({
    isChannelConnected: deps.isChannelConnected,
    onHealthChange: (event) => {
      metricsExporter.setGauge("channel_health_level", healthLevelSeverity(event.currentLevel), {
        channel: event.channel,
        account: event.accountId,
      });

      // Record failover events in history.
      if (event.currentLevel === "unhealthy" || event.currentLevel === "offline") {
        failoverHistory.push({
          type: "health_change",
          channel: event.channel,
          accountId: event.accountId,
          from: event.previousLevel,
          to: event.currentLevel,
          timestamp: new Date().toISOString(),
        });
        // Keep history bounded.
        if (failoverHistory.length > 200) {
          failoverHistory.splice(0, failoverHistory.length - 200);
        }
      }

      log.debug("health level changed", {
        channel: event.channel,
        from: event.previousLevel,
        to: event.currentLevel,
      });
    },
  });

  const identityLinker = createIdentityLinker();
  const threadRegistry = createThreadRegistry();
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
  });

  log.info("channel orchestrator subsystems initialized");

  return {
    metricsExporter,
    deliveryHealthMonitor,
    identityLinker,
    threadRegistry,
    contextBridge,
    messageAdapter,
    failoverRouter,
    channelOrchestrator,
    failoverHistory,
  };
}
