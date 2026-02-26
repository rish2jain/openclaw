export type RbacRole = "admin" | "user" | "guest";

/**
 * Named permissions that can be checked at runtime.
 *
 * - config.read.sensitive   — read API keys, tokens, and other sensitive config values
 * - config.write            — write any config value (admin-only)
 * - commands.admin          — run admin commands (e.g. config set, reload, shutdown)
 * - tools.all               — use all available tools (file system, shell, web, etc.)
 * - ai.chat                 — send messages and get AI replies
 */
export type RbacPermission =
  | "config.read.sensitive"
  | "config.write"
  | "commands.admin"
  | "tools.all"
  | "ai.chat";

/** Resolved identity for a message sender. */
export type RbacIdentity = {
  /** Raw sender ID as provided by the channel (e.g. "12345678" for Telegram). */
  senderId: string;
  /** Optional channel prefix, e.g. "telegram", "slack", "discord". */
  channel?: string;
  /** Full qualified ID: `channel:senderId` if channel is set, else `senderId`. */
  qualifiedId: string;
};
