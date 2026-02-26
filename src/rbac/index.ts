export { hasPermission, listPermissions } from "./permissions.js";
export { buildRbacIdentity, resolveUserRole, resolveUserRoleFromConfig } from "./resolve.js";
export {
  canReadSensitiveConfig,
  canWriteConfig,
  filterConfigValue,
  redactConfigForRole,
} from "./config-filter.js";
export type { RbacIdentity, RbacPermission, RbacRole } from "./types.js";
