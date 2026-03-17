import {
  DEFAULT_ACCOUNT_ID,
  type ChannelOnboardingAdapter,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import { listDingTalkAccountIds, resolveDingTalkAccount } from "./accounts.js";
import { resolveDingTalkWebhookPath } from "./monitor.js";
import type { CoreConfig, DingTalkAccountConfig } from "./types.js";

const CHANNEL = "dingtalk" as const;

function patchDingTalkAccount(
  cfg: CoreConfig,
  accountId: string,
  patch: Partial<DingTalkAccountConfig>,
): CoreConfig {
  const dt = cfg.channels?.dingtalk ?? {};
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: { ...cfg.channels, dingtalk: { ...dt, ...patch } },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      dingtalk: {
        ...dt,
        accounts: { ...dt.accounts, [accountId]: { ...dt.accounts?.[accountId], ...patch } },
      },
    },
  };
}

export const dingtalkOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: CHANNEL,

  getStatus: async ({ cfg }) => {
    const ids = listDingTalkAccountIds(cfg as CoreConfig);
    const configured = ids.some((accountId) => {
      const account = resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId });
      return Boolean(account.config.accessToken?.trim() || account.webhookUrl);
    });
    return {
      channel: CHANNEL,
      configured,
      statusLines: [`DingTalk: ${configured ? "configured" : "needs access token"}`],
      selectionHint: configured ? "configured" : "needs setup",
      quickstartScore: configured ? 2 : 1,
    };
  },

  configure: async ({ cfg, prompter }) => {
    const aid = DEFAULT_ACCOUNT_ID;
    let next = cfg as CoreConfig;
    const existing = next.channels?.dingtalk ?? {};
    const accountCfg = existing;

    // --- Access token -------------------------------------------------------
    const accessToken = String(
      await prompter.text({
        message: "DingTalk robot access token (from the 'Custom Robot' settings):",
        initialValue: accountCfg.accessToken ?? "",
        validate: (v: string) => (v.trim() ? undefined : "Access token is required"),
      }),
    );

    next = patchDingTalkAccount(next, aid, { accessToken: accessToken.trim() });

    // --- Signing secret (optional but recommended) ---------------------------
    const secret = String(
      await prompter.text({
        message: "DingTalk signing secret (optional but strongly recommended):",
        initialValue: accountCfg.secret ?? "",
      }),
    );
    if (secret.trim()) {
      next = patchDingTalkAccount(next, aid, { secret: secret.trim() });
    }

    // --- Inbound path -------------------------------------------------------
    const defaultInboundPath = resolveDingTalkWebhookPath({ accountId: aid });
    const inboundPath = String(
      await prompter.text({
        message: "Inbound webhook path:",
        initialValue: accountCfg.inboundPath ?? defaultInboundPath,
      }),
    );
    next = patchDingTalkAccount(next, aid, {
      inboundPath: inboundPath.trim() || defaultInboundPath,
    });

    return { cfg: next as OpenClawConfig };
  },

  disable: (cfg: OpenClawConfig) => {
    const channels = cfg.channels as Record<string, unknown> | undefined;
    const dingtalk = (channels?.dingtalk ?? {}) as Record<string, unknown>;
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        dingtalk: { ...dingtalk, enabled: false },
      },
    };
  },
};
