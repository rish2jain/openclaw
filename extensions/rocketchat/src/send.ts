import type { RocketChatApiMessage, RocketChatIncomingMessage } from "./types.js";

const ROCKETCHAT_TEXT_CHUNK = 4000;

/** Send via incoming webhook URL */
export async function sendRocketChatWebhook(params: {
  webhookUrl: string;
  message: RocketChatIncomingMessage;
}): Promise<void> {
  const { webhookUrl, message } = params;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Rocket.Chat webhook returned ${response.status}: ${await response.text()}`);
  }
}

/** Send via REST API (chat.postMessage) */
export async function sendRocketChatApi(params: {
  serverUrl: string;
  authToken: string;
  userId: string;
  message: RocketChatApiMessage;
}): Promise<void> {
  const { serverUrl, authToken, userId, message } = params;
  const url = `${serverUrl}/api/v1/chat.postMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": authToken,
      "X-User-Id": userId,
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Rocket.Chat API returned ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { success?: boolean; error?: string };
  if (data.success === false) {
    throw new Error(`Rocket.Chat API error: ${data.error}`);
  }
}

/** Split long text into chunks for Rocket.Chat's message size limit */
export function splitText(text: string, chunkSize: number = ROCKETCHAT_TEXT_CHUNK): string[] {
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
