import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  promptChannelAccessConfig,
  type ChannelOnboardingAdapter,
  type ChannelOnboardingDmPolicy,
  type DmPolicy,
} from "openclaw/plugin-sdk";
import { resolveRocketChatWebhookPath } from "./monitor.js";
import type { CoreConfig, RocketChatAccountConfig, RocketChatMode } from "./types.js";

const CHANNEL = "rocketchat" as const;

function patchAccount(
  cfg: CoreConfig,
  accountId: string,
  patch: Partial<RocketChatAccountConfig>,
): CoreConfig {
  const rc = cfg.channels?.rocketchat ?? {};
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return { ...cfg, channels: { ...cfg.channels, rocketchat: { ...rc, ...patch } } };
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      rocketchat: {
        ...rc,
        accounts: { ...rc.accounts, [accountId]: { ...rc.accounts?.[accountId], ...patch } },
      },
    },
  };
}

function setDmPolicy(cfg: CoreConfig, dmPolicy: DmPolicy, accountId: string): CoreConfig {
  const rc = cfg.channels?.rocketchat ?? {};
  const current = accountId === DEFAULT_ACCOUNT_ID ? rc : (rc.accounts?.[accountId] ?? {});
  const allowFrom =
    dmPolicy === "open" ? addWildcardAllowFrom(current.allowFrom) : current.allowFrom;
  return patchAccount(cfg, accountId, { dmPolicy, ...(allowFrom ? { allowFrom } : {}) });
}

export const rocketchatOnboardingAdapter: ChannelOnboardingAdapter<CoreConfig> = {
  channel: CHANNEL,

  async setup({ prompter, config, accountId }) {
    const aid = accountId ?? DEFAULT_ACCOUNT_ID;
    let cfg = config as CoreConfig;
    const rc = cfg.channels?.rocketchat ?? {};
    const current = aid === DEFAULT_ACCOUNT_ID ? rc : (rc.accounts?.[aid] ?? {});

    prompter.log(
      formatDocsLink(
        "Rocket.Chat integration setup",
        "/channels/rocketchat",
        "https://developer.rocket.chat/docs/webhooks",
      ),
    );

    // --- Server URL ---------------------------------------------------------
    const serverUrl = await prompter.text({
      message: "Rocket.Chat server URL (e.g. https://my.rocket.chat):",
      initialValue: current.serverUrl ?? "",
      validate: (v) => (v.trim() ? undefined : "Server URL is required"),
    });
    cfg = patchAccount(cfg, aid, { serverUrl: serverUrl.trim().replace(/\/+$/, "") });

    // --- Mode ---------------------------------------------------------------
    const mode = (await prompter.select<RocketChatMode>({
      message: "Connection mode:",
      options: [
        {
          value: "webhook",
          label: "Incoming webhook (simple, group bots)",
          hint: "Requires an incoming webhook URL from Rocket.Chat Admin",
        },
        {
          value: "api",
          label: "REST API (full DM support)",
          hint: "Requires an auth token and userId from your profile",
        },
      ],
      initialValue: current.mode ?? "webhook",
    })) as RocketChatMode;
    cfg = patchAccount(cfg, aid, { mode });

    if (mode === "webhook") {
      const webhookUrl = await prompter.text({
        message: "Incoming webhook URL (from Rocket.Chat Admin > Integrations):",
        initialValue: current.webhookUrl ?? "",
        validate: (v) => (v.trim() ? undefined : "Webhook URL is required"),
      });
      cfg = patchAccount(cfg, aid, { webhookUrl: webhookUrl.trim() });
    } else {
      const authToken = await prompter.text({
        message: "Auth token (from your Rocket.Chat profile > Personal Access Tokens):",
        initialValue: current.authToken ?? "",
        validate: (v) => (v.trim() ? undefined : "Auth token is required"),
      });
      const userId = await prompter.text({
        message: "User ID (shown next to auth token):",
        initialValue: current.userId ?? "",
        validate: (v) => (v.trim() ? undefined : "User ID is required"),
      });
      cfg = patchAccount(cfg, aid, { authToken: authToken.trim(), userId: userId.trim() });
    }

    // --- Outgoing token (for verification of inbound events) ----------------
    const outgoingToken = await prompter.text({
      message:
        "Outgoing webhook token (optional — set in Rocket.Chat Admin > Integrations > Outgoing):",
      initialValue: current.outgoingToken ?? "",
    });
    if (outgoingToken.trim()) {
      cfg = patchAccount(cfg, aid, { outgoingToken: outgoingToken.trim() });
    }

    // --- Inbound path -------------------------------------------------------
    const defaultPath = resolveRocketChatWebhookPath({ accountId: aid });
    const inboundPath = await prompter.text({
      message: "Inbound webhook path (configure in Rocket.Chat Admin > Outgoing webhook URL):",
      initialValue: current.inboundPath ?? defaultPath,
    });
    cfg = patchAccount(cfg, aid, {
      inboundPath: inboundPath.trim() || defaultPath,
    });

    // --- Default room -------------------------------------------------------
    const defaultRoom = await prompter.text({
      message: "Default room to post to (e.g. #general) — used when no session context exists:",
      initialValue: current.defaultRoom ?? "#general",
    });
    if (defaultRoom.trim()) {
      cfg = patchAccount(cfg, aid, { defaultRoom: defaultRoom.trim() });
    }

    // --- DM policy ----------------------------------------------------------
    const dmPolicyResult = await promptChannelAccessConfig<CoreConfig>({
      prompter,
      channel: CHANNEL,
      config: cfg,
      accountId: aid,
      setDmPolicy: (c, policy) => setDmPolicy(c, policy, aid),
    });
    cfg = dmPolicyResult.config;

    return { config: cfg };
  },

  resolveDmPolicy({ config, accountId }): ChannelOnboardingDmPolicy {
    const rc = (config as CoreConfig).channels?.rocketchat;
    if (!rc) return { dmPolicy: "pairing" };
    const account = accountId === DEFAULT_ACCOUNT_ID ? rc : (rc.accounts?.[accountId] ?? rc);
    return { dmPolicy: (account.dmPolicy as DmPolicy) ?? "pairing" };
  },
};
