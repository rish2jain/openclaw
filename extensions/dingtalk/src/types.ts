import type { DmPolicy, GroupPolicy, OpenClawConfig } from "openclaw/plugin-sdk";

export type DingTalkAccountConfig = {
  name?: string;
  enabled?: boolean;
  /** DingTalk custom robot access token */
  accessToken?: string;
  /** DingTalk custom robot signing secret */
  secret?: string;
  /**
   * Outbound webhook URL. If not set, built automatically from accessToken.
   * Can be overridden for self-hosted / enterprise DingTalk.
   */
  webhookUrl?: string;
  /**
   * Inbound HTTP path for receiving messages from DingTalk.
   * DingTalk calls this URL on your gateway when users @ the bot.
   */
  inboundPath?: string;
  dmPolicy?: DmPolicy;
  allowFrom?: Array<string>;
  groupPolicy?: GroupPolicy;
  groupAllowFrom?: Array<string>;
  /** Maximum plain-text chunk size in characters before splitting. */
  textChunkLimit?: number;
};

export type DingTalkConfig = DingTalkAccountConfig & {
  accounts?: Record<string, DingTalkAccountConfig>;
};

export type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & {
    dingtalk?: DingTalkConfig;
  };
};

// ---- DingTalk API wire types ------------------------------------------------

export type DingTalkTextMessage = {
  msgtype: "text";
  text: { content: string };
  at?: { atMobiles?: string[]; atUserIds?: string[]; isAtAll?: boolean };
};

export type DingTalkMarkdownMessage = {
  msgtype: "markdown";
  markdown: { title: string; text: string };
  at?: { atMobiles?: string[]; atUserIds?: string[]; isAtAll?: boolean };
};

export type DingTalkOutboundMessage = DingTalkTextMessage | DingTalkMarkdownMessage;

/** Inbound event received from DingTalk when a user sends a message */
export type DingTalkInboundEvent = {
  msgtype?: string;
  text?: { content?: string };
  content?: string;
  senderNick?: string;
  senderId?: string;
  senderCorpId?: string;
  chatbotCorpId?: string;
  conversationId?: string;
  conversationType?: "1" | "2"; // 1=DM, 2=group
  conversationTitle?: string;
  /** Session webhook URL to reply directly to this conversation */
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
  msgId?: string;
  createAt?: number;
  robotCode?: string;
};

export type DingTalkProbe = {
  ok: boolean;
  statusLabel: string;
  webhookReachable?: boolean;
};
