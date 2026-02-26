import type { RbacPermission, RbacRole } from "./types.js";

/** Permissions granted to each role. */
const ROLE_PERMISSIONS: Record<RbacRole, Set<RbacPermission>> = {
  admin: new Set([
    "config.read.sensitive",
    "config.write",
    "commands.admin",
    "tools.all",
    "ai.chat",
  ]),
  user: new Set(["tools.all", "ai.chat"]),
  guest: new Set(["ai.chat"]),
};

/**
 * Check whether a role has a specific permission.
 */
export function hasPermission(role: RbacRole, permission: RbacPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Return all permissions granted to a role.
 */
export function listPermissions(role: RbacRole): RbacPermission[] {
  return Array.from(ROLE_PERMISSIONS[role]);
}
