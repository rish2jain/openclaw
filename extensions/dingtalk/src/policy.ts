import type { CoreConfig } from "./types.js";

/**
 * Resolve the effective DM allowlist for a given account.
 */
export function resolveDingTalkDmAllowFrom(cfg: CoreConfig, accountId: string): string[] {
  const dt = cfg.channels?.dingtalk;
  if (!dt) {
    return [];
  }
  if (accountId === "default") {
    return (dt.allowFrom ?? []).map(String);
  }
  return (dt.accounts?.[accountId]?.allowFrom ?? []).map(String);
}

/**
 * Check whether a sender is on the allowlist.
 * Supports "*" wildcard for open access.
 */
export function isDingTalkSenderAllowed(params: {
  senderId: string;
  senderNick?: string;
  allowFrom: string[];
}): boolean {
  const { senderId, senderNick, allowFrom } = params;
  if (allowFrom.includes("*")) {
    return true;
  }
  return allowFrom.some(
    (entry) =>
      entry.trim().toLowerCase() === senderId.trim().toLowerCase() ||
      (senderNick && entry.trim().toLowerCase() === senderNick.trim().toLowerCase()),
  );
}
