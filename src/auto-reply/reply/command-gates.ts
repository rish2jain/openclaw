import type { CommandFlagKey } from "../../config/commands.js";
import { isCommandFlagEnabled } from "../../config/commands.js";
import { logVerbose } from "../../globals.js";
import { redactIdentifier } from "../../logging/redact-identifier.js";
import { hasPermission } from "../../rbac/index.js";
import { isInternalMessageChannel } from "../../utils/message-channel.js";
import type { ReplyPayload } from "../types.js";
import type { CommandHandlerResult, HandleCommandsParams } from "./commands-types.js";

export function rejectUnauthorizedCommand(
  params: HandleCommandsParams,
  commandLabel: string,
): CommandHandlerResult | null {
  if (params.command.isAuthorizedSender) {
    return null;
  }
  logVerbose(
    `Ignoring ${commandLabel} from unauthorized sender: ${redactIdentifier(params.command.senderId)}`,
  );
  return { shouldContinue: false };
}

export function rejectNonOwnerCommand(
  params: HandleCommandsParams,
  commandLabel: string,
): CommandHandlerResult | null {
  if (params.command.senderIsOwner) {
    return null;
  }
  logVerbose(
    `Ignoring ${commandLabel} from non-owner sender: ${redactIdentifier(params.command.senderId)}`,
  );
  return { shouldContinue: false };
}

/**
 * Gate that blocks commands requiring the `commands.admin` permission.
 * Returns a result (blocking the command) when the sender is not an admin;
 * returns null when the sender is allowed to proceed.
 */
export function rejectNonAdminCommand(
  params: HandleCommandsParams,
  commandLabel: string,
): CommandHandlerResult | null {
  if (hasPermission(params.command.role, "commands.admin")) {
    return null;
  }
  logVerbose(
    `Blocking admin-only ${commandLabel} from role="${params.command.role}" sender: ${params.command.senderId || "<unknown>"}`,
  );
  return {
    shouldContinue: false,
    reply: { text: `⛔ ${commandLabel} requires admin access.` },
  };
}

export function buildDisabledCommandReply(params: {
  label: string;
  configKey: CommandFlagKey;
  disabledVerb?: "is" | "are";
  docsUrl?: string;
}): ReplyPayload {
  const disabledVerb = params.disabledVerb ?? "is";
  const docsSuffix = params.docsUrl ? ` Docs: ${params.docsUrl}` : "";
  return {
    text: `⚠️ ${params.label} ${disabledVerb} disabled. Set commands.${params.configKey}=true to enable.${docsSuffix}`,
  };
}

export function requireCommandFlagEnabled(
  cfg: { commands?: unknown } | undefined,
  params: {
    label: string;
    configKey: CommandFlagKey;
    disabledVerb?: "is" | "are";
    docsUrl?: string;
  },
): CommandHandlerResult | null {
  if (isCommandFlagEnabled(cfg, params.configKey)) {
    return null;
  }
  return {
    shouldContinue: false,
    reply: buildDisabledCommandReply(params),
  };
}

/**
 * When the command is from an internal channel (e.g. webchat), requires at least one of allowedScopes
 * in ctx.GatewayClientScopes. Returns a blocking result when the scope is missing; null when allowed.
 */
export function requireGatewayClientScopeForInternalChannel(
  params: HandleCommandsParams,
  opts: { label: string; allowedScopes: string[]; missingText: string },
): CommandHandlerResult | null {
  const channel = params.ctx.MessageChannel ?? params.command.channel;
  if (!isInternalMessageChannel(channel)) {
    return null;
  }
  const scopes = params.ctx.GatewayClientScopes ?? [];
  const hasScope = opts.allowedScopes.some((s) => scopes.includes(s));
  if (hasScope) {
    return null;
  }
  return {
    shouldContinue: false,
    reply: { text: opts.missingText },
  };
}
