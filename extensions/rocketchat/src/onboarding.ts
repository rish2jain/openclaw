import {
  DEFAULT_ACCOUNT_ID,
  type ChannelOnboardingAdapter,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import { listRocketChatAccountIds, resolveRocketChatAccount } from "./accounts.js";
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

export const rocketchatOnboardingAdapter: ChannelOnboardingAdapter = {
  channel: CHANNEL,

  getStatus: async ({ cfg }) => {
    const ids = listRocketChatAccountIds(cfg as CoreConfig);
    const configured = ids.some((accountId) => {
      const account = resolveRocketChatAccount({ cfg: cfg as CoreConfig, accountId });
      return account.mode === "api"
        ? Boolean(account.config.authToken?.trim() && account.config.userId?.trim())
        : Boolean(account.config.webhookUrl?.trim());
    });
    return {
      channel: CHANNEL,
      configured,
      statusLines: [`Rocket.Chat: ${configured ? "configured" : "needs setup"}`],
      selectionHint: configured ? "configured" : "needs setup",
      quickstartScore: configured ? 2 : 1,
    };
  },

  configure: async ({ cfg, prompter }) => {
    const aid = DEFAULT_ACCOUNT_ID;
    let next = cfg as CoreConfig;
    const rc = next.channels?.rocketchat ?? {};
    const current = rc;

    // --- Server URL ---------------------------------------------------------
    const serverUrl = String(
      await prompter.text({
        message: "Rocket.Chat server URL (e.g. https://my.rocket.chat):",
        initialValue: current.serverUrl ?? "",
        validate: (v: string) => (v.trim() ? undefined : "Server URL is required"),
      }),
    );
    next = patchAccount(next, aid, { serverUrl: serverUrl.trim().replace(/\/+$/, "") });

    // --- Mode ---------------------------------------------------------------
    const modeResult = await prompter.select({
      message: "Connection mode:",
      options: [
        {
          value: "webhook",
          label: "Incoming webhook (simple, group bots)",
        },
        {
          value: "api",
          label: "REST API (full DM support)",
        },
      ],
      initialValue: current.mode ?? "webhook",
    });
    const mode = String(modeResult) as RocketChatMode;
    next = patchAccount(next, aid, { mode });

    if (mode === "webhook") {
      const webhookUrl = String(
        await prompter.text({
          message: "Incoming webhook URL (from Rocket.Chat Admin > Integrations):",
          initialValue: current.webhookUrl ?? "",
          validate: (v: string) => (v.trim() ? undefined : "Webhook URL is required"),
        }),
      );
      next = patchAccount(next, aid, { webhookUrl: webhookUrl.trim() });
    } else {
      const authToken = String(
        await prompter.text({
          message: "Auth token (from your Rocket.Chat profile > Personal Access Tokens):",
          initialValue: current.authToken ?? "",
          validate: (v: string) => (v.trim() ? undefined : "Auth token is required"),
        }),
      );
      const userId = String(
        await prompter.text({
          message: "User ID (shown next to auth token):",
          initialValue: current.userId ?? "",
          validate: (v: string) => (v.trim() ? undefined : "User ID is required"),
        }),
      );
      next = patchAccount(next, aid, { authToken: authToken.trim(), userId: userId.trim() });
    }

    // --- Outgoing token (for verification of inbound events) ----------------
    const outgoingToken = String(
      await prompter.text({
        message:
          "Outgoing webhook token (optional — set in Rocket.Chat Admin > Integrations > Outgoing):",
        initialValue: current.outgoingToken ?? "",
      }),
    );
    if (outgoingToken.trim()) {
      next = patchAccount(next, aid, { outgoingToken: outgoingToken.trim() });
    }

    // --- Inbound path -------------------------------------------------------
    const defaultPath = resolveRocketChatWebhookPath({ accountId: aid });
    const inboundPath = String(
      await prompter.text({
        message: "Inbound webhook path (configure in Rocket.Chat Admin > Outgoing webhook URL):",
        initialValue: current.inboundPath ?? defaultPath,
      }),
    );
    next = patchAccount(next, aid, {
      inboundPath: inboundPath.trim() || defaultPath,
    });

    // --- Default room -------------------------------------------------------
    const defaultRoom = String(
      await prompter.text({
        message: "Default room to post to (e.g. #general):",
        initialValue: current.defaultRoom ?? "#general",
      }),
    );
    if (defaultRoom.trim()) {
      next = patchAccount(next, aid, { defaultRoom: defaultRoom.trim() });
    }

    return { cfg: next as OpenClawConfig };
  },

  disable: (cfg: OpenClawConfig) => {
    const channels = cfg.channels as Record<string, unknown> | undefined;
    const rocketchat = (channels?.rocketchat ?? {}) as Record<string, unknown>;
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        rocketchat: { ...rocketchat, enabled: false },
      },
    };
  },
};
