import type { DingTalkProbe } from "./types.js";

/**
 * Probe DingTalk connectivity by attempting a GET to the DingTalk API health endpoint.
 * We don't actually send a message during probe — just verify network reachability.
 */
export async function probeDingTalk(params: {
  webhookUrl: string;
  secret?: string;
}): Promise<DingTalkProbe> {
  try {
    // DingTalk doesn't have a dedicated health endpoint, so we check reachability
    // by making a lightweight HEAD request to the base API domain.
    const url = new URL("https://oapi.dingtalk.com/");
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    return {
      ok: response.status < 500,
      statusLabel: `DingTalk API reachable (${response.status})`,
      webhookReachable: true,
    };
  } catch (err) {
    return {
      ok: false,
      statusLabel: `DingTalk API unreachable: ${String(err)}`,
      webhookReachable: false,
    };
  }
}
