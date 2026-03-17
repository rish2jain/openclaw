import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { IdentityLinker } from "../continuity/identity-linker.js";
import type { HealthMonitor } from "../health/health-monitor.js";
import { isOperational, type ChannelHealthEvent } from "../health/health-status.js";
import type { ChannelId } from "../plugins/types.js";
import {
  resolveFailoverPreference,
  type FailoverConfig,
  DEFAULT_FAILOVER_CONFIG,
} from "./failover-config.js";

const log = createSubsystemLogger("channels/failover/router");

export type FailoverDecision = {
  triggered: boolean;
  originalChannel: ChannelId;
  targetChannel?: ChannelId;
  targetUserId?: string;
  targetAccountId?: string;
  reason: string;
};

type ActiveFailover = {
  originalChannel: ChannelId;
  targetChannel: ChannelId;
  userKey: string;
  failedOverAt: number;
  notified: boolean;
};

export type FailoverRouterDeps = {
  healthMonitor: HealthMonitor;
  identityLinker: IdentityLinker;
  config?: FailoverConfig;
};

export type FailoverRouter = {
  evaluateFailover: (params: EvaluateFailoverParams) => FailoverDecision;
  handleHealthChange: (event: ChannelHealthEvent) => FailoverAction[];
  getActiveFailovers: () => ActiveFailover[];
  markNotified: (userKey: string, originalChannel: ChannelId) => void;
  clearFailover: (userKey: string, originalChannel: ChannelId) => void;
};

export type EvaluateFailoverParams = {
  channel: ChannelId;
  accountId: string;
  userKey: string;
};

export type FailoverAction = {
  type: "failover" | "failback";
  userKey: string;
  fromChannel: ChannelId;
  toChannel: ChannelId;
  targetUserId?: string;
  shouldNotify: boolean;
};

export function createFailoverRouter(deps: FailoverRouterDeps): FailoverRouter {
  const config = deps.config ?? { ...DEFAULT_FAILOVER_CONFIG, userPreferences: new Map() };
  const activeFailovers = new Map<string, ActiveFailover>();

  function failoverKey(userKey: string, channel: ChannelId): string {
    return `${userKey}:${channel}`;
  }

  function findAvailableChannel(
    fallbackChannels: ChannelId[],
    userKey: string,
    accountId: string,
  ): { channel: ChannelId; userId?: string; accountId: string } | undefined {
    for (const candidate of fallbackChannels) {
      const metrics = deps.healthMonitor.getMetrics(candidate, accountId);
      if (metrics && !isOperational(metrics.level)) {
        continue;
      }

      const identities = deps.identityLinker.getLinkedIdentities(candidate, userKey);
      if (identities.length > 0) {
        const identity = identities[0];
        if (identity) {
          return { channel: candidate, userId: identity.userId, accountId };
        }
      }
    }
    return undefined;
  }

  function evaluateFailover(params: EvaluateFailoverParams): FailoverDecision {
    if (!config.enabled) {
      return {
        triggered: false,
        originalChannel: params.channel,
        reason: "failover globally disabled",
      };
    }

    const key = failoverKey(params.userKey, params.channel);
    const existing = activeFailovers.get(key);
    if (existing) {
      return {
        triggered: true,
        originalChannel: params.channel,
        targetChannel: existing.targetChannel,
        reason: "active failover in progress",
      };
    }

    const metrics = deps.healthMonitor.getMetrics(params.channel, params.accountId);
    if (!metrics || isOperational(metrics.level)) {
      return {
        triggered: false,
        originalChannel: params.channel,
        reason: "channel is operational",
      };
    }

    const unhealthyDuration = Date.now() - metrics.levelChangedAt;
    if (unhealthyDuration < config.failoverGracePeriodMs) {
      return {
        triggered: false,
        originalChannel: params.channel,
        reason: `channel unhealthy for ${unhealthyDuration}ms, grace period is ${config.failoverGracePeriodMs}ms`,
      };
    }

    const preference = resolveFailoverPreference(config, params.userKey, params.channel);
    if (!preference.enabled) {
      return {
        triggered: false,
        originalChannel: params.channel,
        reason: "failover disabled for this user",
      };
    }

    const target = findAvailableChannel(
      preference.fallbackChannels,
      params.userKey,
      params.accountId,
    );
    if (!target) {
      log.warn("no available failover target", {
        channel: params.channel,
        userKey: params.userKey,
      });
      return {
        triggered: false,
        originalChannel: params.channel,
        reason: "no available fallback channel with linked identity",
      };
    }

    activeFailovers.set(key, {
      originalChannel: params.channel,
      targetChannel: target.channel,
      userKey: params.userKey,
      failedOverAt: Date.now(),
      notified: false,
    });

    log.info("failover triggered", {
      from: params.channel,
      to: target.channel,
      userKey: params.userKey,
    });

    return {
      triggered: true,
      originalChannel: params.channel,
      targetChannel: target.channel,
      targetUserId: target.userId,
      targetAccountId: target.accountId,
      reason: `channel ${metrics.level}, failing over to ${target.channel}`,
    };
  }

  function handleHealthChange(event: ChannelHealthEvent): FailoverAction[] {
    const actions: FailoverAction[] = [];

    if (isOperational(event.currentLevel) && !isOperational(event.previousLevel)) {
      for (const [key, failover] of activeFailovers) {
        if (failover.originalChannel !== event.channel) {
          continue;
        }
        // Only fail back if the target channel is still operational.
        const targetMetrics = deps.healthMonitor
          .getAllMetrics()
          .find((m) => m.channel === failover.targetChannel);
        if (!targetMetrics || !isOperational(targetMetrics.level)) {
          log.info("deferring failback: target channel not operational", {
            originalChannel: failover.originalChannel,
            targetChannel: failover.targetChannel,
            targetLevel: targetMetrics?.level,
          });
          continue;
        }
        const preference = resolveFailoverPreference(
          config,
          failover.userKey,
          failover.originalChannel,
        );
        if (preference.autoFailback) {
          const elapsed = Date.now() - failover.failedOverAt;
          if (elapsed < config.failbackGracePeriodMs) {
            log.info("deferring failback: grace period not elapsed", {
              originalChannel: failover.originalChannel,
              targetChannel: failover.targetChannel,
              elapsedMs: elapsed,
              gracePeriodMs: config.failbackGracePeriodMs,
            });
            continue;
          }
          actions.push({
            type: "failback",
            userKey: failover.userKey,
            fromChannel: failover.targetChannel,
            toChannel: failover.originalChannel,
            shouldNotify: preference.notifyOnFailover,
          });
          activeFailovers.delete(key);
        }
      }
    }

    if (!isOperational(event.currentLevel) && isOperational(event.previousLevel)) {
      log.info("channel became non-operational", {
        channel: event.channel,
        level: event.currentLevel,
        accountId: event.accountId,
      });
    }

    return actions;
  }

  function getActiveFailovers(): ActiveFailover[] {
    return Array.from(activeFailovers.values());
  }

  function markNotified(userKey: string, originalChannel: ChannelId): void {
    const key = failoverKey(userKey, originalChannel);
    const failover = activeFailovers.get(key);
    if (failover) {
      failover.notified = true;
    }
  }

  function clearFailover(userKey: string, originalChannel: ChannelId): void {
    const key = failoverKey(userKey, originalChannel);
    activeFailovers.delete(key);
  }

  return { evaluateFailover, handleHealthChange, getActiveFailovers, markNotified, clearFailover };
}
