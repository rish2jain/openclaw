import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig, DingTalkAccountConfig } from "./types.js";

const DINGTALK_WEBHOOK_BASE = "https://oapi.dingtalk.com/robot/send";

export function buildDingTalkWebhookUrl(accessToken: string): string {
  return `${DINGTALK_WEBHOOK_BASE}?access_token=${encodeURIComponent(accessToken)}`;
}

export type ResolvedDingTalkAccount = {
  accountId: string;
  config: DingTalkAccountConfig;
  webhookUrl: string;
};

export function listDingTalkAccountIds(cfg: CoreConfig): string[] {
  const dingtalk = cfg.channels?.dingtalk;
  if (!dingtalk) {
    return [];
  }
  const ids = Object.keys(dingtalk.accounts ?? {});
  const hasDefault =
    dingtalk.accessToken?.trim() || dingtalk.webhookUrl?.trim() || dingtalk.inboundPath?.trim();
  if (hasDefault && !ids.includes(DEFAULT_ACCOUNT_ID)) {
    ids.unshift(DEFAULT_ACCOUNT_ID);
  }
  return ids;
}

export function resolveDefaultDingTalkAccountId(cfg: CoreConfig): string {
  return listDingTalkAccountIds(cfg)[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveRawDingTalkAccountConfig(
  cfg: CoreConfig,
  accountId: string,
): DingTalkAccountConfig | undefined {
  const dingtalk = cfg.channels?.dingtalk;
  if (!dingtalk) {
    return undefined;
  }
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return dingtalk;
  }
  return dingtalk.accounts?.[accountId];
}

export function resolveDingTalkAccount(params: {
  cfg: CoreConfig;
  accountId: string;
}): ResolvedDingTalkAccount {
  const { cfg, accountId } = params;
  const raw = resolveRawDingTalkAccountConfig(cfg, accountId);
  if (!raw) {
    throw new Error(`DingTalk account "${accountId}" not found in config`);
  }

  const accessToken = raw.accessToken?.trim() ?? "";
  const webhookUrl =
    raw.webhookUrl?.trim() || (accessToken ? buildDingTalkWebhookUrl(accessToken) : "");

  return {
    accountId,
    config: raw,
    webhookUrl,
  };
}
