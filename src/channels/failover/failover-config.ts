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

type RawUserPreferences = Record<
  string,
  Partial<{
    primaryChannel: string;
    fallbackChannels: string[];
    enabled: boolean;
    notifyOnFailover: boolean;
    autoFailback: boolean;
  }>
>;

function parseUserPreferences(
  raw: RawUserPreferences | undefined,
  resolvedDefaultOrder: ChannelId[],
): Map<string, FailoverPreference> {
  const map = new Map<string, FailoverPreference>();
  if (!raw || typeof raw !== "object") {
    return map;
  }
  if (resolvedDefaultOrder.length === 0) {
    throw new Error("Failover config: defaultFallbackOrder must be non-empty");
  }
  for (const [userKey, pref] of Object.entries(raw)) {
    if (!pref) {
      continue;
    }
    const trimmed = typeof pref.primaryChannel === "string" ? pref.primaryChannel.trim() : "";
    const prefPrimary = trimmed || undefined;
    const rawFallback =
      Array.isArray(pref.fallbackChannels) && pref.fallbackChannels.length > 0
        ? pref.fallbackChannels[0]
        : undefined;
    const trimmedFallback = typeof rawFallback === "string" ? rawFallback.trim() : "";
    const fromFallback = trimmedFallback || undefined;
    const primaryChannel = prefPrimary ?? fromFallback ?? resolvedDefaultOrder[0];
    const fallbackChannels = Array.isArray(pref.fallbackChannels)
      ? pref.fallbackChannels.filter((ch): ch is string => typeof ch === "string")
      : resolvedDefaultOrder.filter((ch) => ch !== primaryChannel);
    map.set(userKey, {
      primaryChannel,
      fallbackChannels,
      enabled: pref.enabled ?? DEFAULT_FAILOVER_CONFIG.enabled,
      notifyOnFailover: pref.notifyOnFailover ?? true,
      autoFailback: pref.autoFailback ?? false,
    });
  }
  return map;
}

export function parseFailoverConfig(
  raw:
    | Partial<{
        enabled: boolean;
        defaultFallbackOrder: string[];
        failoverGracePeriodMs: number;
        failbackGracePeriodMs: number;
        userPreferences: RawUserPreferences;
      }>
    | undefined,
): FailoverConfig {
  if (!raw) {
    return { ...DEFAULT_FAILOVER_CONFIG, userPreferences: new Map() };
  }
  const defaultFallbackOrder =
    Array.isArray(raw.defaultFallbackOrder) && raw.defaultFallbackOrder.length > 0
      ? raw.defaultFallbackOrder
      : DEFAULT_FAILOVER_CONFIG.defaultFallbackOrder;
  return {
    enabled: raw.enabled ?? DEFAULT_FAILOVER_CONFIG.enabled,
    defaultFallbackOrder,
    userPreferences: parseUserPreferences(raw.userPreferences, defaultFallbackOrder),
    failoverGracePeriodMs:
      raw.failoverGracePeriodMs ?? DEFAULT_FAILOVER_CONFIG.failoverGracePeriodMs,
    failbackGracePeriodMs:
      raw.failbackGracePeriodMs ?? DEFAULT_FAILOVER_CONFIG.failbackGracePeriodMs,
  };
}
