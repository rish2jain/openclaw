import type { RocketChatProbe } from "./types.js";

/** Probe Rocket.Chat server by fetching the /api/info endpoint */
export async function probeRocketChat(params: { serverUrl: string }): Promise<RocketChatProbe> {
  const { serverUrl } = params;
  if (!serverUrl) {
    return { ok: false, statusLabel: "No server URL configured" };
  }
  try {
    const url = `${serverUrl}/api/info`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        statusLabel: `Rocket.Chat server returned ${response.status}`,
        serverReachable: true,
      };
    }
    const data = (await response.json()) as { version?: string };
    return {
      ok: true,
      statusLabel: `Rocket.Chat ${data.version ?? "unknown version"} reachable`,
      serverReachable: true,
      version: data.version,
    };
  } catch (err) {
    return {
      ok: false,
      statusLabel: `Rocket.Chat server unreachable: ${String(err)}`,
      serverReachable: false,
    };
  }
}
