import { buildDingTalkSignParams } from "./sign.js";
import type { DingTalkOutboundMessage } from "./types.js";

const DINGTALK_WEBHOOK_BASE = "https://oapi.dingtalk.com/robot/send";

type SendParams = {
  webhookUrl: string;
  accessToken?: string;
  secret?: string;
  message: DingTalkOutboundMessage;
};

/**
 * Send a message to a DingTalk group via the custom robot webhook.
 * If `secret` is provided, the request is signed per DingTalk's security spec.
 */
export async function sendDingTalkMessage(params: SendParams): Promise<void> {
  const { webhookUrl, secret, message } = params;

  let url = webhookUrl;
  if (secret) {
    const { timestamp, sign } = buildDingTalkSignParams(secret);
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}timestamp=${encodeURIComponent(timestamp)}&sign=${encodeURIComponent(sign)}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`DingTalk webhook returned ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode !== 0) {
    throw new Error(`DingTalk API error ${data.errcode}: ${data.errmsg}`);
  }
}

/**
 * Send a reply via the session webhook URL included in an inbound message.
 * This is the preferred way to reply to a specific conversation/thread.
 */
export async function sendDingTalkSessionReply(params: {
  sessionWebhook: string;
  message: DingTalkOutboundMessage;
}): Promise<void> {
  const { sessionWebhook, message } = params;
  const response = await fetch(sessionWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`DingTalk session reply returned ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { errcode?: number; errmsg?: string };
  if (data.errcode !== 0) {
    throw new Error(`DingTalk session reply error ${data.errcode}: ${data.errmsg}`);
  }
}

/**
 * Build a plain-text outbound message, splitting into chunks if needed.
 */
export function buildDingTalkTextMessage(text: string): DingTalkOutboundMessage {
  return {
    msgtype: "text",
    text: { content: text },
  };
}

/**
 * Build a markdown outbound message.
 */
export function buildDingTalkMarkdownMessage(title: string, text: string): DingTalkOutboundMessage {
  return {
    msgtype: "markdown",
    markdown: { title, text },
  };
}

/** Build the base DingTalk webhook URL from an access token */
export function buildWebhookUrl(accessToken: string): string {
  return `${DINGTALK_WEBHOOK_BASE}?access_token=${encodeURIComponent(accessToken)}`;
}
