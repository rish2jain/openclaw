import {
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  getChatChannelMeta,
  PAIRING_APPROVED_MESSAGE,
  resolveDefaultGroupPolicy,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
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

const meta = getChatChannelMeta("rocketchat");

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
    normalizeAllowEntry: (entry) => entry.trim(),
    notifyApproval: async ({ id, accountId, config }) => {
      const account = resolveRocketChatAccount({ cfg: config as CoreConfig, accountId });
      const text = `${PAIRING_APPROVED_MESSAGE} ${formatPairingApproveHint({ id })}`;
      await sendOutbound(account, account.config.defaultRoom ?? "#general", text);
    },
  },

  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    blockStreaming: false,
  },

  reload: { configPrefixes: ["channels.rocketchat"] },
  configSchema: buildChannelConfigSchema({
    type: "object",
    additionalProperties: true,
    properties: {},
  }),

  config: {
    listAccountIds: (cfg) => listRocketChatAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveRocketChatAccount({ cfg: cfg as CoreConfig, accountId }),
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

    resolveStatus: ({ account }) => {
      const hasOutbound =
        account.mode === "api"
          ? Boolean(account.config.authToken?.trim() && account.config.userId?.trim())
          : Boolean(account.config.webhookUrl?.trim());
      const issues = hasOutbound
        ? []
        : [
            {
              kind: "warning" as const,
              message:
                account.mode === "api"
                  ? "No auth token or userId configured — messages will fail"
                  : "No incoming webhook URL configured — messages will fail",
            },
          ];
      return buildBaseAccountStatusSnapshot({ accountId: account.accountId, issues });
    },

    resolveSummary: ({ cfg }) =>
      buildBaseChannelStatusSummary({
        channelId: "rocketchat",
        accounts: listRocketChatAccountIds(cfg as CoreConfig),
      }),
  },

  // ---- Monitor (inbound outgoing-webhook) ----------------------------------

  monitor: {
    start: ({ cfg, dispatch, accountId }) => {
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
        runtime: rt as Parameters<typeof monitorRocketChatProvider>[0]["runtime"],
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

          const roomId = event.room_id ?? event.channel_id ?? account.config.defaultRoom ?? "";

          await dispatch({
            channelId: "rocketchat",
            accountId,
            senderId: userId,
            senderName: userName,
            text,
            reply: async (replyText: string) => {
              for (const chunk of splitText(replyText, account.config.textChunkLimit)) {
                await sendOutbound(account, roomId, chunk);
              }
            },
            isGroup,
            conversationId: event.room_id,
            messageId: event.message_id,
          });
        },
      });
    },
  },

  // ---- Outbound ------------------------------------------------------------

  outbound: {
    send: async ({ account, text }) => {
      const room = account.config.defaultRoom ?? "#general";
      for (const chunk of splitText(text, account.config.textChunkLimit)) {
        await sendOutbound(account, room, chunk);
      }
    },
  },

  // ---- Probe ---------------------------------------------------------------

  probe: ({ account }) => probeRocketChat({ serverUrl: account.serverUrl }),
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
