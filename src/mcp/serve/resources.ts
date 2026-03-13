/**
 * MCP resource providers.
 *
 * Exposes channel configurations and session logs as MCP resources.
 * Resources use URI schemes:
 *   - openclaw://channels/{channelName}  -- channel config/status
 *   - openclaw://sessions/{sessionKey}   -- session conversation log
 */
import { logDebug } from "../../logger.js";
import type {
  GatewayRpc,
  McpReadResourceResult,
  McpResourceDefinition,
  McpResourceTemplateDefinition,
} from "./types.js";

/** True if the error is likely gateway/network/timeout (we return empty list instead of failing). */
function isExpectedGatewayError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  const code = (err as NodeJS.ErrnoException).code?.toLowerCase() ?? "";
  return (
    code === "econnrefused" ||
    code === "econnreset" ||
    code === "etimedout" ||
    code === "enotfound" ||
    err.name === "FetchError" ||
    err.name === "AbortError" ||
    msg.includes("timeout") ||
    msg.includes("fetch failed") ||
    msg.includes("fetcherror") ||
    msg.includes("network") ||
    msg.includes("abort")
  );
}

/**
 * Return resource templates that describe the dynamic resources available.
 */
export function getResourceTemplates(): McpResourceTemplateDefinition[] {
  return [
    {
      uriTemplate: "openclaw://channels/{channelName}",
      name: "Channel configuration",
      description:
        "Configuration and runtime status for a specific chat channel " +
        "(e.g. telegram, discord, slack).",
      mimeType: "application/json",
    },
    {
      uriTemplate: "openclaw://sessions/{sessionKey}",
      name: "Session conversation",
      description: "Recent conversation history for a specific agent session.",
      mimeType: "application/json",
    },
  ];
}

/**
 * List concrete resources that are currently available.
 * Fetches channel status from the gateway to enumerate channel resources.
 */
export async function getAllResources(callGateway: GatewayRpc): Promise<McpResourceDefinition[]> {
  const resources: McpResourceDefinition[] = [];

  try {
    const channelStatus = await callGateway("channels.status", {});
    if (channelStatus && typeof channelStatus === "object") {
      for (const key of Object.keys(channelStatus)) {
        // Skip non-channel keys (e.g. metadata fields)
        if (key.startsWith("_") || key === "gateway") {
          continue;
        }
        resources.push({
          uri: `openclaw://channels/${key}`,
          name: `Channel: ${key}`,
          description: `Configuration and status for the ${key} channel.`,
          mimeType: "application/json",
        });
      }
    }
  } catch (err) {
    if (isExpectedGatewayError(err)) {
      logDebug(
        `gateway unavailable while fetching channels: ${err instanceof Error ? err.message : String(err)}`,
      );
    } else {
      throw err;
    }
  }

  try {
    const sessionsResult = await callGateway("sessions.list", {});
    const sessions =
      sessionsResult != null && typeof sessionsResult === "object" && "sessions" in sessionsResult
        ? (sessionsResult as { sessions: unknown }).sessions
        : undefined;
    if (Array.isArray(sessions)) {
      for (const session of sessions) {
        const sessionObj = session as Record<string, unknown>;
        const key =
          typeof sessionObj.sessionKey === "string"
            ? sessionObj.sessionKey
            : typeof sessionObj.key === "string"
              ? sessionObj.key
              : null;
        if (key) {
          const label =
            typeof sessionObj.label === "string"
              ? sessionObj.label
              : typeof sessionObj.displayName === "string"
                ? sessionObj.displayName
                : key;
          resources.push({
            uri: `openclaw://sessions/${encodeURIComponent(key)}`,
            name: `Session: ${label}`,
            description: `Conversation history for session '${key}'.`,
            mimeType: "application/json",
          });
        }
      }
    }
  } catch (err) {
    if (isExpectedGatewayError(err)) {
      logDebug(
        `gateway unavailable while fetching sessions: ${err instanceof Error ? err.message : String(err)}`,
      );
    } else {
      throw err;
    }
  }

  return resources;
}

/**
 * Read a specific resource by URI.
 */
export async function readResource(
  uri: string,
  callGateway: GatewayRpc,
): Promise<McpReadResourceResult> {
  const parsed = parseResourceUri(uri);
  if (!parsed) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  switch (parsed.type) {
    case "channel": {
      const status = await callGateway("channels.status", {});
      const channelData = status[parsed.id];
      if (!channelData) {
        throw new Error(`Channel not found: ${parsed.id}`);
      }
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(channelData, null, 2),
          },
        ],
      };
    }

    case "session": {
      const sessionKey = decodeURIComponent(parsed.id);
      const preview = await callGateway("sessions.preview", {
        sessionKey,
      });
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(preview, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown resource type: ${uri}`);
  }
}

type ParsedUri = { type: "channel" | "session"; id: string };

function parseResourceUri(uri: string): ParsedUri | null {
  const match = uri.match(/^openclaw:\/\/(channels|sessions)\/(.+)$/);
  if (!match) {
    return null;
  }
  const type = match[1] === "channels" ? "channel" : "session";
  return { type, id: match[2] };
}
