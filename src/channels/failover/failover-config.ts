import type { ChannelId } from "../plugins/types.js";

export type FailoverPreference = {
  primaryChannel: ChannelId;
  fallbackChannels: ChannelId[];
  enabled: boolean;
  notifyOnFailover: boolean;
  autoFailback: boolean;
};

export type FailoverConfig = {
  enabled: boolean;
  defaultFallbackOrder: ChannelId[];
  userPreferences: Map<string, FailoverPreference>;
  failoverGracePeriodMs: number;
  failbackGracePeriodMs: number;
};

export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  enabled: true,
  defaultFallbackOrder: ["telegram", "discord", "slack", "whatsapp", "signal", "imessage"],
  userPreferences: new Map(),
  failoverGracePeriodMs: 60_000,
  failbackGracePeriodMs: 5 * 60_000,
};

export function resolveFailoverPreference(
  config: FailoverConfig,
  userKey: string,
  currentChannel: ChannelId,
): FailoverPreference {
  const userPref = config.userPreferences.get(userKey);
  if (userPref) {
    return userPref;
  }
  return {
    primaryChannel: currentChannel,
    fallbackChannels: config.defaultFallbackOrder.filter((ch) => ch !== currentChannel),
    enabled: config.enabled,
    notifyOnFailover: true,
    autoFailback: false,
  };
}

export function parseFailoverConfig(
  raw:
    | Partial<{
        enabled: boolean;
        defaultFallbackOrder: string[];
        failoverGracePeriodMs: number;
        failbackGracePeriodMs: number;
      }>
    | undefined,
): FailoverConfig {
  if (!raw) {
    return { ...DEFAULT_FAILOVER_CONFIG, userPreferences: new Map() };
  }
  return {
    enabled: raw.enabled ?? DEFAULT_FAILOVER_CONFIG.enabled,
    defaultFallbackOrder:
      Array.isArray(raw.defaultFallbackOrder) && raw.defaultFallbackOrder.length > 0
        ? raw.defaultFallbackOrder
        : DEFAULT_FAILOVER_CONFIG.defaultFallbackOrder,
    userPreferences: new Map(),
    failoverGracePeriodMs:
      raw.failoverGracePeriodMs ?? DEFAULT_FAILOVER_CONFIG.failoverGracePeriodMs,
    failbackGracePeriodMs:
      raw.failbackGracePeriodMs ?? DEFAULT_FAILOVER_CONFIG.failbackGracePeriodMs,
  };
}
