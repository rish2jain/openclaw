import {
  buildBaseAccountStatusSnapshot,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  PAIRING_APPROVED_MESSAGE,
  resolveDefaultGroupPolicy,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import {
  listRocketChatAccountIds,
  resolveDefaultRocketChatAccountId,
  resolveRocketChatAccount,
  type ResolvedRocketChatAccount,
} from "./accounts.js";
import { monitorRocketChatProvider, resolveRocketChatWebhookPath } from "./monitor.js";
import { rocketchatOnboardingAdapter } from "./onboarding.js";
import { isRocketChatSenderAllowed, resolveRocketChatDmAllowFrom } from "./policy.js";
import { probeRocketChat } from "./probe.js";
import { getRocketChatRuntime } from "./runtime.js";
import { sendRocketChatApi, sendRocketChatWebhook, splitText } from "./send.js";
import type { CoreConfig, RocketChatOutgoingWebhookEvent, RocketChatProbe } from "./types.js";

const meta = {
  id: "rocketchat",
  label: "Rocket.Chat",
  selectionLabel: "Rocket.Chat (plugin)",
  detailLabel: "Rocket.Chat Bot",
  docsPath: "/channels/rocketchat",
  docsLabel: "rocketchat",
  blurb: "Self-hosted Rocket.Chat integration.",
  systemImage: "bubble.left.and.bubble.right",
  order: 81,
  quickstartAllowFrom: true,
} as const;

const DEFAULT_ALIAS = "OpenClaw";
const DEFAULT_EMOJI = ":robot:";

export const rocketchatPlugin: ChannelPlugin<ResolvedRocketChatAccount, RocketChatProbe> = {
  id: "rocketchat",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  onboarding: rocketchatOnboardingAdapter,

  pairing: {
    idLabel: "userId",
    normalizeAllowEntry: (entry: string) => entry.trim(),
    notifyApproval: async ({ id, cfg }) => {
      const account = resolveRocketChatAccount({
        cfg: cfg as CoreConfig,
        accountId: DEFAULT_ACCOUNT_ID,
      });
      const text = `${PAIRING_APPROVED_MESSAGE} ${formatPairingApproveHint(id)}`;
      await sendOutbound(account, account.config.defaultRoom ?? "#general", text);
    },
  },

  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    blockStreaming: false,
  },

  reload: { configPrefixes: ["channels.rocketchat"] },
  configSchema: {
    schema: { type: "object", properties: {} },
  },

  config: {
    listAccountIds: (cfg) => listRocketChatAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveRocketChatAccount({
        cfg: cfg as CoreConfig,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      }),
    defaultAccountId: (cfg) => resolveDefaultRocketChatAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "rocketchat",
        accountId,
        enabled,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "rocketchat",
        accountId,
      }),
    isConfigured: (account) => {
      return account.mode === "api"
        ? Boolean(account.config.authToken?.trim() && account.config.userId?.trim())
        : Boolean(account.config.webhookUrl?.trim());
    },
    describeAccount: (account) => ({
      accountId: account.accountId,
      configured:
        account.mode === "api"
          ? Boolean(account.config.authToken?.trim() && account.config.userId?.trim())
          : Boolean(account.config.webhookUrl?.trim()),
    }),
  },

  status: {
    probeAccount: async ({ account }) => probeRocketChat({ serverUrl: account.serverUrl }),
    buildAccountSnapshot: ({ account }) => {
      return buildBaseAccountStatusSnapshot({
        account: {
          accountId: account.accountId,
          configured:
            account.mode === "api"
              ? Boolean(account.config.authToken?.trim() && account.config.userId?.trim())
              : Boolean(account.config.webhookUrl?.trim()),
        },
      });
    },
  },

  // ---- Outbound ------------------------------------------------------------

  outbound: {
    deliveryMode: "direct",
    sendText: async ({ cfg, text, accountId }) => {
      const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
      const account = resolveRocketChatAccount({
        cfg: cfg as unknown as CoreConfig,
        accountId: resolvedAccountId,
      });
      const room = account.config.defaultRoom ?? "#general";
      for (const chunk of splitText(text, account.config.textChunkLimit)) {
        await sendOutbound(account, room, chunk);
      }
      return { channel: "rocketchat", messageId: "" };
    },
  },

  // ---- Gateway (inbound outgoing-webhook) ----------------------------------

  gateway: {
    startAccount: async (ctx) => {
      const { cfg, accountId } = ctx;
      const account = resolveRocketChatAccount({ cfg: cfg as CoreConfig, accountId });
      const rt = getRocketChatRuntime();
      const inboundPath = resolveRocketChatWebhookPath({
        accountId,
        configuredPath: account.config.inboundPath,
      });

      return monitorRocketChatProvider({
        accountId,
        inboundPath,
        outgoingToken: account.config.outgoingToken,
        runtime: rt as unknown as Parameters<typeof monitorRocketChatProvider>[0]["runtime"],
        onMessage: async (event: RocketChatOutgoingWebhookEvent) => {
          const userId = event.user_id ?? "";
          const userName = event.user_name ?? "";
          const text = (event.text ?? "").trim();
          if (!text) return;

          const allowFrom = resolveRocketChatDmAllowFrom(cfg as CoreConfig, accountId);
          const isGroup = Boolean(event.channel_name && !event.channel_name.startsWith("@"));

          if (!isGroup) {
            const allowed = isRocketChatSenderAllowed({ userId, userName, allowFrom });
            if (!allowed) return;
          }
        },
      });
    },
  },
};

async function sendOutbound(
  account: ResolvedRocketChatAccount,
  room: string,
  text: string,
): Promise<void> {
  const alias = account.config.alias ?? DEFAULT_ALIAS;
  const emoji = account.config.emoji ?? DEFAULT_EMOJI;

  if (account.mode === "api") {
    const authToken = account.config.authToken?.trim() ?? "";
    const userId = account.config.userId?.trim() ?? "";
    await sendRocketChatApi({
      serverUrl: account.serverUrl,
      authToken,
      userId,
      message: {
        channel: room,
        text,
        alias,
        emoji,
      },
    });
  } else {
    const webhookUrl = account.config.webhookUrl?.trim() ?? "";
    await sendRocketChatWebhook({
      webhookUrl,
      message: { text, alias, emoji, channel: room },
    });
  }
}
