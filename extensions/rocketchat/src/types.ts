import type { DmPolicy, GroupPolicy, OpenClawConfig } from "openclaw/plugin-sdk";

/**
 * How outbound messages are sent:
 * - "webhook": POST to an incoming webhook URL (simple, token-only)
 * - "api": Rocket.Chat REST API with user auth token + userId (full DM support)
 */
export type RocketChatMode = "webhook" | "api";

export type RocketChatAccountConfig = {
  name?: string;
  enabled?: boolean;
  /**
   * Rocket.Chat server URL, e.g. "https://my.rocket.chat"
   */
  serverUrl?: string;
  /**
   * Mode: "webhook" (default) or "api".
   */
  mode?: RocketChatMode;
  /**
   * Incoming webhook URL (mode=webhook). Created in Rocket.Chat Admin > Integrations.
   */
  webhookUrl?: string;
  /**
   * Outgoing webhook token sent by Rocket.Chat for verification.
   */
  outgoingToken?: string;
  /**
   * REST API auth token (mode=api). From user profile / Admin.
   */
  authToken?: string;
  /**
   * REST API userId (mode=api).
   */
  userId?: string;
  /**
   * Default room to post to when no session context is available.
   */
  defaultRoom?: string;
  /**
   * HTTP path for receiving outgoing webhook events from Rocket.Chat.
   */
  inboundPath?: string;
  /**
   * Bot alias shown as sender name in Rocket.Chat.
   */
  alias?: string;
  /**
   * Bot emoji shown as avatar.
   */
  emoji?: string;
  dmPolicy?: DmPolicy;
  allowFrom?: Array<string>;
  groupPolicy?: GroupPolicy;
  groupAllowFrom?: Array<string>;
  textChunkLimit?: number;
};

export type RocketChatConfig = RocketChatAccountConfig & {
  accounts?: Record<string, RocketChatAccountConfig>;
};

export type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & {
    rocketchat?: RocketChatConfig;
  };
};

// ---- Wire types ------------------------------------------------------------

/** Inbound outgoing-webhook payload from Rocket.Chat */
export type RocketChatOutgoingWebhookEvent = {
  token?: string;
  channel_id?: string;
  channel_name?: string;
  timestamp?: string;
  user_id?: string;
  user_name?: string;
  text?: string;
  trigger_word?: string;
  message_id?: string;
  room_id?: string;
  room_name?: string;
  /** Reply-to channel info for threaded response */
  bot?: {
    i?: string;
  };
};

/** Outbound incoming-webhook body for Rocket.Chat */
export type RocketChatIncomingMessage = {
  text: string;
  alias?: string;
  emoji?: string;
  avatar?: string;
  roomId?: string;
  channel?: string;
  attachments?: Array<{ text: string; color?: string }>;
};

/** REST API request body for chat.postMessage */
export type RocketChatApiMessage = {
  roomId?: string;
  channel?: string;
  text: string;
  alias?: string;
  emoji?: string;
};

export type RocketChatProbe = {
  ok: boolean;
  statusLabel: string;
  serverReachable?: boolean;
  version?: string;
};
