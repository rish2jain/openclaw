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

const meta = {
  id: "dingtalk",
  label: "DingTalk",
  selectionLabel: "DingTalk (plugin)",
  detailLabel: "DingTalk Bot",
  docsPath: "/channels/dingtalk",
  docsLabel: "dingtalk",
  blurb: "DingTalk custom robot integration.",
  systemImage: "bubble.left.and.bubble.right",
  order: 80,
  quickstartAllowFrom: true,
} as const;

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
    normalizeAllowEntry: (entry: string) => entry.trim(),
    notifyApproval: async ({ id, cfg }) => {
      const account = resolveDingTalkAccount({
        cfg: cfg as CoreConfig,
        accountId: DEFAULT_ACCOUNT_ID,
      });
      await sendDingTalkMessage({
        webhookUrl: account.webhookUrl,
        secret: account.config.secret,
        message: buildDingTalkTextMessage(
          `${PAIRING_APPROVED_MESSAGE} ${formatPairingApproveHint(id)}`,
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
  configSchema: {
    schema: { type: "object", properties: {} },
  },

  config: {
    listAccountIds: (cfg) => listDingTalkAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveDingTalkAccount({
        cfg: cfg as CoreConfig,
        accountId: accountId ?? DEFAULT_ACCOUNT_ID,
      }),
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
    isConfigured: (account) => Boolean(account.config.accessToken?.trim() || account.webhookUrl),
    describeAccount: (account) => ({
      accountId: account.accountId,
      configured: Boolean(account.config.accessToken?.trim() || account.webhookUrl),
    }),
  },

  status: {
    probeAccount: async ({ account }) =>
      probeDingTalk({ webhookUrl: account.webhookUrl, secret: account.config.secret }),
    buildAccountSnapshot: ({ account }) => {
      return buildBaseAccountStatusSnapshot({
        account: {
          accountId: account.accountId,
          configured: Boolean(account.config.accessToken?.trim() || account.webhookUrl),
        },
      });
    },
  },

  // ---- Outbound ------------------------------------------------------------

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: DINGTALK_TEXT_CHUNK,
    sendText: async ({ cfg, text, accountId }) => {
      const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
      const account = resolveDingTalkAccount({
        cfg: cfg as unknown as CoreConfig,
        accountId: resolvedAccountId,
      });
      const chunks = splitText(text, account.config.textChunkLimit ?? DINGTALK_TEXT_CHUNK);
      for (const chunk of chunks) {
        await sendDingTalkMessage({
          webhookUrl: account.webhookUrl,
          secret: account.config.secret,
          message: buildDingTalkTextMessage(chunk),
        });
      }
      return { channel: "dingtalk", messageId: "" };
    },
  },

  // ---- Gateway (inbound webhook) -------------------------------------------

  gateway: {
    startAccount: async (ctx) => {
      const { cfg, accountId } = ctx;
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
        runtime: rt as unknown as Parameters<typeof monitorDingTalkProvider>[0]["runtime"],
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
        },
      });
    },
  },
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
