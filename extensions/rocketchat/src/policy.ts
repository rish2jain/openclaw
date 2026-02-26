import type { CoreConfig } from "./types.js";

export function resolveRocketChatDmAllowFrom(cfg: CoreConfig, accountId: string): string[] {
  const rc = cfg.channels?.rocketchat;
  if (!rc) return [];
  const account = accountId === "default" ? rc : (rc.accounts?.[accountId] ?? rc);
  return (account.allowFrom ?? []).map(String);
}

export function isRocketChatSenderAllowed(params: {
  userId: string;
  userName?: string;
  allowFrom: string[];
}): boolean {
  const { userId, userName, allowFrom } = params;
  if (allowFrom.includes("*")) return true;
  return allowFrom.some(
    (entry) =>
      entry.trim().toLowerCase() === userId.trim().toLowerCase() ||
      (userName && entry.trim().toLowerCase() === userName.trim().toLowerCase()),
  );
}
