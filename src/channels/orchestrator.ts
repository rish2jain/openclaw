/**
 * Channel orchestrator — coordinates subsystems for message send/receive.
 *
 * Wires together: health monitor, failover router, message adapter,
 * context bridge, identity linker, and thread registry into a unified
 * inbound/outbound message flow.
 */
import { createSubsystemLogger } from "../logging/subsystem.js";
import type {
  MessageAdapter,
  AdaptableMessage,
  AdaptedMessage,
} from "./adaptation/message-adapter.js";
import type { ChatType } from "./chat-type.js";
import type { ContextBridge, BridgeReason } from "./continuity/context-bridge.js";
import type { IdentityLinker } from "./continuity/identity-linker.js";
import type { ThreadRegistry } from "./continuity/thread-registry.js";
import type { FailoverRouter, FailoverDecision } from "./failover/failover-router.js";
import type { HealthMonitor } from "./health/health-monitor.js";
import type { ChannelId } from "./plugins/types.js";

const log = createSubsystemLogger("channels/orchestrator");

/** Optional holder for failover history; when provided, orchestrator exposes getFailoverHistory/addFailoverEvent. */
export type FailoverHistoryHolder = {
  getFailoverHistory: () => ReadonlyArray<Record<string, unknown>>;
  addFailoverEvent: (event: Record<string, unknown>) => void;
};

export type ChannelOrchestratorDeps = {
  healthMonitor: HealthMonitor;
  failoverRouter: FailoverRouter;
  messageAdapter: MessageAdapter;
  contextBridge: ContextBridge;
  identityLinker: IdentityLinker;
  threadRegistry: ThreadRegistry;
  /** When set, orchestrator exposes getFailoverHistory and addFailoverEvent. */
  failoverHistoryHolder?: FailoverHistoryHolder;
};

export type InboundMessageParams = {
  channel: ChannelId;
  accountId: string;
  threadId: string;
  peerId: string;
  peerKind: ChatType;
  sessionKey: string;
  message: AdaptableMessage;
  label?: string;
};

export type InboundResult = {
  adaptedMessage: AdaptedMessage;
  canonicalThreadId: string;
  identityGroupId?: string;
};

export type OutboundMessageParams = {
  channel: ChannelId;
  accountId: string;
  userKey: string;
  message: AdaptableMessage;
  threadCanonicalId?: string;
};

export type OutboundResult = {
  targetChannel: ChannelId;
  adaptedMessage: AdaptedMessage;
  failoverDecision: FailoverDecision;
  bridgeContext?: string;
  switchNotice?: string;
};

export type DeliveryOutcome = {
  channel: ChannelId;
  accountId: string;
  success: boolean;
  latencyMs: number;
  error?: string;
};

export type ChannelOrchestrator = {
  /** Process an inbound message from a channel. */
  handleInbound: (params: InboundMessageParams) => InboundResult;
  /** Prepare an outbound message for delivery. */
  prepareOutbound: (params: OutboundMessageParams) => OutboundResult;
  /** Record delivery outcome after sending. */
  recordDelivery: (outcome: DeliveryOutcome) => void;
  /** Read-only failover event history (when failoverHistoryHolder was provided). */
  getFailoverHistory?: () => ReadonlyArray<Record<string, unknown>>;
  /** Append a failover event (enforces 200-entry cap). */
  addFailoverEvent?: (event: Record<string, unknown>) => void;
};

export function createChannelOrchestrator(deps: ChannelOrchestratorDeps): ChannelOrchestrator {
  function handleInbound(params: InboundMessageParams): InboundResult {
    // 1. Adapt message formatting for agent consumption.
    const adaptedMessage = deps.messageAdapter.adaptMessage(params.message, params.channel);

    // 2. Register/update thread in registry.
    const thread = deps.threadRegistry.registerThread({
      sessionKey: params.sessionKey,
      channel: params.channel,
      accountId: params.accountId,
      threadId: params.threadId,
      peerId: params.peerId,
      peerKind: params.peerKind,
      label: params.label,
    });

    // 3. Record message in context bridge buffer.
    deps.contextBridge.recordMessage({
      threadCanonicalId: thread.canonicalId,
      channel: params.channel,
      role: "user",
      content: params.message.text,
    });

    // 4. Resolve identity group (if linked).
    const group = deps.identityLinker.findGroup(params.channel, params.peerId);

    log.debug("inbound processed", {
      channel: params.channel,
      canonicalId: thread.canonicalId,
      groupId: group?.groupId,
    });

    return {
      adaptedMessage,
      canonicalThreadId: thread.canonicalId,
      identityGroupId: group?.groupId,
    };
  }

  function prepareOutbound(params: OutboundMessageParams): OutboundResult {
    // 1. Evaluate failover.
    const failoverDecision = deps.failoverRouter.evaluateFailover({
      channel: params.channel,
      accountId: params.accountId,
      userKey: params.userKey,
    });

    const targetChannel =
      failoverDecision.triggered && failoverDecision.targetChannel
        ? failoverDecision.targetChannel
        : params.channel;

    // 2. If failover triggered, build bridge context.
    let bridgeContext: string | undefined;
    let switchNotice: string | undefined;

    if (failoverDecision.triggered && failoverDecision.targetChannel && params.threadCanonicalId) {
      const reason: BridgeReason = "failover";
      const context = deps.contextBridge.buildBridgeContext({
        threadCanonicalId: params.threadCanonicalId,
        sourceChannel: params.channel,
        targetChannel,
        reason,
      });

      if (context) {
        bridgeContext = deps.contextBridge.formatContextForAgent(context);
        switchNotice = deps.contextBridge.formatSwitchNotice(context);
      }
    }

    // 3. Adapt message for target channel.
    const adaptedMessage = deps.messageAdapter.adaptMessage(params.message, targetChannel);

    // 4. Record outbound message in context bridge.
    if (params.threadCanonicalId) {
      deps.contextBridge.recordMessage({
        threadCanonicalId: params.threadCanonicalId,
        channel: targetChannel,
        role: "assistant",
        content: params.message.text,
      });
    }

    log.debug("outbound prepared", {
      originalChannel: params.channel,
      targetChannel,
      failover: failoverDecision.triggered,
    });

    return {
      targetChannel,
      adaptedMessage,
      failoverDecision,
      bridgeContext,
      switchNotice,
    };
  }

  function recordDelivery(outcome: DeliveryOutcome): void {
    deps.healthMonitor.recordDelivery({
      channel: outcome.channel,
      accountId: outcome.accountId,
      latencyMs: outcome.latencyMs,
      success: outcome.success,
      error: outcome.error,
    });
  }

  const orchestrator: ChannelOrchestrator = {
    handleInbound,
    prepareOutbound,
    recordDelivery,
  };
  if (deps.failoverHistoryHolder) {
    const holder = deps.failoverHistoryHolder;
    orchestrator.getFailoverHistory = () => holder.getFailoverHistory();
    orchestrator.addFailoverEvent = (event) => holder.addFailoverEvent(event);
  }
  return orchestrator;
}
