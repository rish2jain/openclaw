import type { ChannelMonitorHandle } from "openclaw/plugin-sdk";
import { verifyDingTalkSignature } from "./sign.js";
import type { DingTalkInboundEvent } from "./types.js";

export type DingTalkMonitorOptions = {
  path: string;
  secret?: string;
  onMessage: (event: DingTalkInboundEvent) => Promise<void>;
};

/**
 * Compute the inbound webhook path for a given account.
 * Defaults to /dingtalk/<accountId> if not explicitly configured.
 */
export function resolveDingTalkWebhookPath(params: {
  accountId: string;
  configuredPath?: string;
}): string {
  if (params.configuredPath?.trim()) {
    return params.configuredPath.trim();
  }
  return params.accountId === "default" ? "/dingtalk" : `/dingtalk/${params.accountId}`;
}

/**
 * Register a DingTalk inbound webhook handler on the gateway HTTP server.
 * DingTalk POSTs JSON event payloads to this path when users @mention the bot.
 */
export function monitorDingTalkProvider(params: {
  accountId: string;
  inboundPath?: string;
  secret?: string;
  runtime: {
    registerHttpHandler: (
      path: string,
      handler: (req: Request) => Promise<Response>,
    ) => ChannelMonitorHandle;
  };
  onMessage: (event: DingTalkInboundEvent) => Promise<void>;
}): ChannelMonitorHandle {
  const path = resolveDingTalkWebhookPath({
    accountId: params.accountId,
    configuredPath: params.inboundPath,
  });

  return params.runtime.registerHttpHandler(path, async (req: Request) => {
    // DingTalk signs inbound messages when a signing secret is configured.
    if (params.secret) {
      const url = new URL(req.url);
      const timestamp = url.searchParams.get("timestamp") ?? "";
      const sign = url.searchParams.get("sign") ?? "";
      const valid = verifyDingTalkSignature({
        timestamp,
        sign,
        secret: params.secret,
      });
      if (!valid) {
        return new Response(JSON.stringify({ errcode: 403, errmsg: "Invalid signature" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    let event: DingTalkInboundEvent;
    try {
      event = (await req.json()) as DingTalkInboundEvent;
    } catch {
      return new Response(JSON.stringify({ errcode: 400, errmsg: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Respond immediately so DingTalk doesn't time out, then process async.
    void params.onMessage(event).catch(() => {});
    return new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  });
}
