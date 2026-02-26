import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type DmPolicy,
} from "openclaw/plugin-sdk";
import { resolveDingTalkWebhookPath } from "./monitor.js";
import type { CoreConfig, DingTalkAccountConfig } from "./types.js";

const CHANNEL = "dingtalk" as const;

function setDingTalkDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy, accountId: string): CoreConfig {
  const dt = cfg.channels?.dingtalk ?? {};
  const current = accountId === DEFAULT_ACCOUNT_ID ? dt : (dt.accounts?.[accountId] ?? {});
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(current.allowFrom) : current.allowFrom;

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        dingtalk: { ...dt, dmPolicy, ...(allowFrom ? { allowFrom } : {}) },
      },
    };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      dingtalk: {
        ...dt,
        accounts: {
          ...dt.accounts,
          [accountId]: { ...current, dmPolicy, ...(allowFrom ? { allowFrom } : {}) },
        },
      },
    },
  };
}

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

export const dingtalkOnboardingAdapter: ChannelOnboardingAdapter<CoreConfig> = {
  channel: CHANNEL,

  async setup({ prompter, config, accountId }) {
    const aid = accountId ?? DEFAULT_ACCOUNT_ID;
    let cfg = config as CoreConfig;
    const existing = cfg.channels?.dingtalk ?? {};
    const accountCfg = aid === DEFAULT_ACCOUNT_ID ? existing : (existing.accounts?.[aid] ?? {});

    prompter.log(
      formatDocsLink(
        "DingTalk custom robot setup",
        "/channels/dingtalk",
        "https://open.dingtalk.com/document/robots/custom-robot-access",
      ),
    );

    // --- Access token -------------------------------------------------------
    const accessToken = await prompter.text({
      message: "DingTalk robot access token (from the 'Custom Robot' settings):",
      initialValue: accountCfg.accessToken ?? "",
      validate: (v) => (v.trim() ? undefined : "Access token is required"),
    });

    cfg = patchDingTalkAccount(cfg, aid, { accessToken: accessToken.trim() });

    // --- Signing secret (optional but recommended) ---------------------------
    const secret = await prompter.text({
      message: "DingTalk signing secret (optional but strongly recommended):",
      initialValue: accountCfg.secret ?? "",
    });
    if (secret.trim()) {
      cfg = patchDingTalkAccount(cfg, aid, { secret: secret.trim() });
    }

    // --- Inbound path -------------------------------------------------------
    const defaultInboundPath = resolveDingTalkWebhookPath({ accountId: aid });
    prompter.log(
      `Inbound webhook path (configure this URL in DingTalk bot settings: <gateway>/<path>):`,
    );
    const inboundPath = await prompter.text({
      message: "Inbound webhook path:",
      initialValue: accountCfg.inboundPath ?? defaultInboundPath,
    });
    cfg = patchDingTalkAccount(cfg, aid, {
      inboundPath: inboundPath.trim() || defaultInboundPath,
    });

    // --- DM policy ----------------------------------------------------------
    const dmPolicyResult = await promptChannelAccessConfig<CoreConfig>({
      prompter,
      channel: CHANNEL,
      config: cfg,
      accountId: aid,
      setDmPolicy: (c, policy) => setDingTalkDmPolicy(c, policy, aid),
    });
    cfg = dmPolicyResult.config;

    return { config: cfg };
  },

  resolveDmPolicy({ config, accountId }): ChannelOnboardingDmPolicy {
    const dt = (config as CoreConfig).channels?.dingtalk;
    if (!dt) {
      return { dmPolicy: "pairing" };
    }
    const account = accountId === DEFAULT_ACCOUNT_ID ? dt : (dt.accounts?.[accountId] ?? dt);
    return { dmPolicy: (account.dmPolicy as DmPolicy) ?? "pairing" };
  },
};
