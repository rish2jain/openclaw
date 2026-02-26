import type { GatewayAccessConfig } from "../config/types.gateway.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { RbacIdentity, RbacRole } from "./types.js";

/** Default role when access config is absent or user is unrecognized. */
const IMPLICIT_DEFAULT_ROLE: RbacRole = "user";

/**
 * Build an RbacIdentity from a raw senderId and optional channel name.
 * Handles both `channel:id` qualified format and bare IDs.
 */
export function buildRbacIdentity(params: { senderId: string; channel?: string }): RbacIdentity {
  const { senderId, channel } = params;
  const trimmedId = senderId.trim();
  const trimmedChannel = channel?.trim() ?? "";

  // If senderId already contains a colon prefix, treat as qualified
  if (!trimmedChannel && trimmedId.includes(":")) {
    const colonIdx = trimmedId.indexOf(":");
    return {
      senderId: trimmedId.slice(colonIdx + 1),
      channel: trimmedId.slice(0, colonIdx),
      qualifiedId: trimmedId,
    };
  }

  const qualifiedId = trimmedChannel ? `${trimmedChannel}:${trimmedId}` : trimmedId;
  return { senderId: trimmedId, channel: trimmedChannel || undefined, qualifiedId };
}

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function matchesIdentity(entry: string, identity: RbacIdentity): boolean {
  const normalizedEntry = normalizeId(entry);
  if (normalizedEntry === normalizeId(identity.qualifiedId)) {
    return true;
  }
  if (normalizedEntry === normalizeId(identity.senderId)) {
    return true;
  }
  return false;
}

/**
 * Resolve the RBAC role for a sender given the gateway access config.
 *
 * Priority order:
 * 1. `adminUsers` list — any match → admin
 * 2. `roles` map — explicit entry → that role
 * 3. `defaultRole` or implicit default ("user")
 */
export function resolveUserRole(params: {
  identity: RbacIdentity;
  accessConfig?: GatewayAccessConfig;
}): RbacRole {
  const { identity, accessConfig } = params;
  if (!accessConfig) {
    return IMPLICIT_DEFAULT_ROLE;
  }

  // 1. adminUsers shorthand (takes precedence over roles map)
  if (accessConfig.adminUsers && accessConfig.adminUsers.length > 0) {
    const isAdmin = accessConfig.adminUsers.some((entry) => matchesIdentity(entry, identity));
    if (isAdmin) {
      return "admin";
    }
  }

  // 2. Explicit roles map
  if (accessConfig.roles && typeof accessConfig.roles === "object") {
    for (const [entry, role] of Object.entries(accessConfig.roles)) {
      if (matchesIdentity(entry, identity)) {
        return role as RbacRole;
      }
    }
  }

  // 3. Default role
  return (accessConfig.defaultRole as RbacRole | undefined) ?? IMPLICIT_DEFAULT_ROLE;
}

/**
 * Convenience: resolve role directly from an OpenClawConfig.
 */
export function resolveUserRoleFromConfig(params: {
  cfg: OpenClawConfig;
  senderId: string;
  channel?: string;
}): RbacRole {
  const identity = buildRbacIdentity({ senderId: params.senderId, channel: params.channel });
  return resolveUserRole({ identity, accessConfig: params.cfg.gateway?.access });
}
