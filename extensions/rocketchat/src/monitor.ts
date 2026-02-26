import type { ChannelMonitorHandle } from "openclaw/plugin-sdk";
import type { RocketChatOutgoingWebhookEvent } from "./types.js";

export function resolveRocketChatWebhookPath(params: {
  accountId: string;
  configuredPath?: string;
}): string {
  if (params.configuredPath?.trim()) {
    return params.configuredPath.trim();
  }
  return params.accountId === "default" ? "/rocketchat" : `/rocketchat/${params.accountId}`;
}

/**
 * Register an HTTP handler that receives Rocket.Chat outgoing webhook events.
 * Rocket.Chat POSTs here when a user sends a message matching the configured trigger word.
 */
export function monitorRocketChatProvider(params: {
  accountId: string;
  inboundPath?: string;
  outgoingToken?: string;
  runtime: {
    registerHttpHandler: (
      path: string,
      handler: (req: Request) => Promise<Response>,
    ) => ChannelMonitorHandle;
  };
  onMessage: (event: RocketChatOutgoingWebhookEvent) => Promise<void>;
}): ChannelMonitorHandle {
  const path = resolveRocketChatWebhookPath({
    accountId: params.accountId,
    configuredPath: params.inboundPath,
  });

  return params.runtime.registerHttpHandler(path, async (req: Request) => {
    let event: RocketChatOutgoingWebhookEvent;
    try {
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const text = await req.text();
        const form = new URLSearchParams(text);
        const payload = form.get("payload");
        if (payload) {
          event = JSON.parse(payload) as RocketChatOutgoingWebhookEvent;
        } else {
          event = Object.fromEntries(form.entries()) as RocketChatOutgoingWebhookEvent;
        }
      } else {
        event = (await req.json()) as RocketChatOutgoingWebhookEvent;
      }
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify outgoing webhook token if configured
    if (params.outgoingToken && event.token !== params.outgoingToken) {
      return new Response(JSON.stringify({ success: false, error: "Invalid token" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    void params.onMessage(event).catch(() => {});
    // Rocket.Chat displays the `text` from this response in the chat
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  });
}
