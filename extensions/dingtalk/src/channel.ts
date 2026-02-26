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
  listDingTalkAccountIds,
  resolveDingTalkAccount,
  resolveDefaultDingTalkAccountId,
  type ResolvedDingTalkAccount,
} from "./accounts.js";
import { monitorDingTalkProvider, resolveDingTalkWebhookPath } from "./monitor.js";
import { dingtalkOnboardingAdapter } from "./onboarding.js";
import { isDingTalkSenderAllowed, resolveDingTalkDmAllowFrom } from "./policy.js";
import { probeDingTalk } from "./probe.js";
import { getDingTalkRuntime } from "./runtime.js";
import { buildDingTalkTextMessage, sendDingTalkMessage, sendDingTalkSessionReply } from "./send.js";
import type { CoreConfig, DingTalkInboundEvent, DingTalkProbe } from "./types.js";

const meta = getChatChannelMeta("dingtalk");

const DINGTALK_TEXT_CHUNK = 4096;

export const dingtalkPlugin: ChannelPlugin<ResolvedDingTalkAccount, DingTalkProbe> = {
  id: "dingtalk",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  onboarding: dingtalkOnboardingAdapter,

  pairing: {
    idLabel: "senderId",
    normalizeAllowEntry: (entry) => entry.trim(),
    notifyApproval: async ({ id, accountId, config }) => {
      const account = resolveDingTalkAccount({ cfg: config as CoreConfig, accountId });
      await sendDingTalkMessage({
        webhookUrl: account.webhookUrl,
        secret: account.config.secret,
        message: buildDingTalkTextMessage(
          `${PAIRING_APPROVED_MESSAGE} ${formatPairingApproveHint({ id })}`,
        ),
      });
    },
  },

  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    blockStreaming: false,
  },

  reload: { configPrefixes: ["channels.dingtalk"] },
  configSchema: buildChannelConfigSchema({
    type: "object",
    additionalProperties: true,
    properties: {},
  }),

  config: {
    listAccountIds: (cfg) => listDingTalkAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultDingTalkAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "dingtalk",
        accountId,
        enabled,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "dingtalk",
        accountId,
      }),

    resolveStatus: ({ cfg, account }) => {
      const hasToken = Boolean(account.config.accessToken?.trim() || account.webhookUrl);
      const issues = hasToken
        ? []
        : [
            {
              kind: "warning" as const,
              message: "No access token configured — outbound messages will fail",
            },
          ];
      return buildBaseAccountStatusSnapshot({ accountId: account.accountId, issues });
    },

    resolveSummary: ({ cfg }) =>
      buildBaseChannelStatusSummary({
        channelId: "dingtalk",
        accounts: listDingTalkAccountIds(cfg as CoreConfig),
      }),
  },

  // ---- Monitor (inbound webhook) -------------------------------------------

  monitor: {
    start: ({ cfg, dispatch, accountId }) => {
      const account = resolveDingTalkAccount({ cfg: cfg as CoreConfig, accountId });
      const rt = getDingTalkRuntime();

      const inboundPath = resolveDingTalkWebhookPath({
        accountId,
        configuredPath: account.config.inboundPath,
      });

      return monitorDingTalkProvider({
        accountId,
        inboundPath,
        secret: account.config.secret,
        runtime: rt as Parameters<typeof monitorDingTalkProvider>[0]["runtime"],
        onMessage: async (event: DingTalkInboundEvent) => {
          const senderId = event.senderId ?? "";
          const senderNick = event.senderNick ?? "";
          const text = event.text?.content?.trim() ?? event.content?.trim() ?? "";
          if (!text) {
            return;
          }

          const allowFrom = resolveDingTalkDmAllowFrom(cfg as CoreConfig, accountId);
          const isGroup = event.conversationType === "2";

          if (!isGroup) {
            const allowed = isDingTalkSenderAllowed({ senderId, senderNick, allowFrom });
            if (!allowed) {
              return;
            }
          }

          const replyFn = event.sessionWebhook
            ? async (replyText: string) => {
                await sendDingTalkSessionReply({
                  sessionWebhook: event.sessionWebhook!,
                  message: buildDingTalkTextMessage(replyText),
                });
              }
            : async (replyText: string) => {
                await sendDingTalkMessage({
                  webhookUrl: account.webhookUrl,
                  secret: account.config.secret,
                  message: buildDingTalkTextMessage(replyText),
                });
              };

          await dispatch({
            channelId: "dingtalk",
            accountId,
            senderId,
            senderName: senderNick,
            text,
            reply: replyFn,
            isGroup,
            conversationId: event.conversationId,
            messageId: event.msgId,
          });
        },
      });
    },
  },

  // ---- Outbound ------------------------------------------------------------

  outbound: {
    send: async ({ account, text }) => {
      const chunks = splitText(text, account.config.textChunkLimit ?? DINGTALK_TEXT_CHUNK);
      for (const chunk of chunks) {
        await sendDingTalkMessage({
          webhookUrl: account.webhookUrl,
          secret: account.config.secret,
          message: buildDingTalkTextMessage(chunk),
        });
      }
    },
  },

  // ---- Probe ---------------------------------------------------------------

  probe: ({ account }) =>
    probeDingTalk({ webhookUrl: account.webhookUrl, secret: account.config.secret }),
};

function splitText(text: string, chunkSize: number): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, chunkSize));
    remaining = remaining.slice(chunkSize);
  }
  return chunks;
}
