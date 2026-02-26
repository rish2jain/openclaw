import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig, RocketChatAccountConfig } from "./types.js";

export type ResolvedRocketChatAccount = {
  accountId: string;
  config: RocketChatAccountConfig;
  serverUrl: string;
  mode: "webhook" | "api";
};

export function listRocketChatAccountIds(cfg: CoreConfig): string[] {
  const rc = cfg.channels?.rocketchat;
  if (!rc) {
    return [];
  }
  const ids = Object.keys(rc.accounts ?? {});
  const hasDefault = rc.serverUrl?.trim() || rc.webhookUrl?.trim();
  if (hasDefault && !ids.includes(DEFAULT_ACCOUNT_ID)) {
    ids.unshift(DEFAULT_ACCOUNT_ID);
  }
  return ids;
}

export function resolveDefaultRocketChatAccountId(cfg: CoreConfig): string {
  return listRocketChatAccountIds(cfg)[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveRawRocketChatAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): RocketChatAccountConfig | undefined {
  const rc = cfg.channels?.rocketchat;
  if (!rc) {
    return undefined;
  }
  return accountId === DEFAULT_ACCOUNT_ID ? rc : rc.accounts?.[accountId];
}

export function resolveRocketChatAccount(params: {
  cfg: CoreConfig;
  accountId: string;
}): ResolvedRocketChatAccount {
  const { cfg, accountId } = params;
  const raw = resolveRawRocketChatAccountConfig(cfg, accountId);
  if (!raw) {
    throw new Error(`Rocket.Chat account "${accountId}" not found in config`);
  }

  const serverUrl = (raw.serverUrl ?? "").replace(/\/+$/, "");
  const mode = raw.mode ?? (raw.webhookUrl ? "webhook" : raw.authToken ? "api" : "webhook");

  return { accountId, config: raw, serverUrl, mode };
}
