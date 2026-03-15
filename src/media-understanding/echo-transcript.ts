import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";
import type { EchoFormat } from "../config/types.tools.js";
import { logVerbose, shouldLogVerbose } from "../globals.js";
import { isDeliverableMessageChannel } from "../utils/message-channel.js";

let deliverRuntimePromise: Promise<typeof import("../infra/outbound/deliver-runtime.js")> | null =
  null;

function loadDeliverRuntime() {
  deliverRuntimePromise ??= import("../infra/outbound/deliver-runtime.js");
  return deliverRuntimePromise;
}

const ECHO_PLACEHOLDER = "{{ECHO_TRANSCRIPT}}";

const ECHO_TEMPLATES: Record<EchoFormat, string> = {
  text: `📝 "${ECHO_PLACEHOLDER}"`,
  markdown: `📝 \`${ECHO_PLACEHOLDER}\``,
};

function formatEchoTranscript(transcript: string, template: string): string {
  return template.replaceAll(ECHO_PLACEHOLDER, transcript);
}

/**
 * Sends the transcript echo back to the originating chat.
 * Best-effort: logs on failure, never throws.
 */
export async function sendTranscriptEcho(params: {
  ctx: MsgContext;
  cfg: OpenClawConfig;
  transcript: string;
  format?: EchoFormat;
}): Promise<void> {
  const { ctx, cfg, transcript } = params;
  const channel = ctx.Provider ?? ctx.Surface ?? "";
  const to = ctx.OriginatingTo ?? ctx.From ?? "";

  if (!channel || !to) {
    if (shouldLogVerbose()) {
      logVerbose("media: echo-transcript skipped (no channel/to resolved from ctx)");
    }
    return;
  }

  const normalizedChannel = channel.trim().toLowerCase();
  if (!isDeliverableMessageChannel(normalizedChannel)) {
    if (shouldLogVerbose()) {
      logVerbose(
        `media: echo-transcript skipped (channel "${String(normalizedChannel)}" is not deliverable)`,
      );
    }
    return;
  }

  const resolvedFormat: EchoFormat = params.format ?? "text";
  const text = formatEchoTranscript(transcript, ECHO_TEMPLATES[resolvedFormat]);

  try {
    const { deliverOutboundPayloads } = await loadDeliverRuntime();
    await deliverOutboundPayloads({
      cfg,
      channel: normalizedChannel,
      to,
      accountId: ctx.AccountId ?? undefined,
      threadId: ctx.MessageThreadId ?? undefined,
      payloads: [{ text }],
      bestEffort: true,
    });
    if (shouldLogVerbose()) {
      logVerbose(`media: echo-transcript sent to ${normalizedChannel}/${to}`);
    }
  } catch (err) {
    logVerbose(`media: echo-transcript delivery failed: ${String(err)}`);
  }
}
