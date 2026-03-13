import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { ChannelId } from "../plugins/types.js";
import type { IdentityLinker } from "./identity-linker.js";
import type { ThreadRegistry } from "./thread-registry.js";

const log = createSubsystemLogger("channels/continuity/context-bridge");

export type BridgedMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sourceChannel: ChannelId;
};

export type BridgedContext = {
  threadCanonicalId: string;
  sourceChannel: ChannelId;
  targetChannel: ChannelId;
  recentMessages: BridgedMessage[];
  sessionKey: string;
  agentId?: string;
  bridgedAt: number;
  reason: BridgeReason;
};

export type BridgeReason = "user-initiated" | "failover" | "channel-offline" | "preference";

export type ContextBridgeDeps = {
  threadRegistry: ThreadRegistry;
  identityLinker: IdentityLinker;
};

export type ContextBridgeOptions = {
  maxMessages?: number;
  maxMessageAgeMs?: number;
};

export type ContextBridge = {
  buildBridgeContext: (params: BuildBridgeContextParams) => BridgedContext | undefined;
  recordMessage: (params: RecordMessageParams) => void;
  formatContextForAgent: (context: BridgedContext) => string;
  formatSwitchNotice: (context: BridgedContext) => string;
};

export type BuildBridgeContextParams = {
  threadCanonicalId: string;
  sourceChannel: ChannelId;
  targetChannel: ChannelId;
  reason: BridgeReason;
};

export type RecordMessageParams = {
  threadCanonicalId: string;
  channel: ChannelId;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
};

const DEFAULT_MAX_MESSAGES = 10;
const DEFAULT_MAX_MESSAGE_AGE_MS = 60 * 60_000;
const MAX_STORED_MESSAGES_PER_THREAD = 50;

export function createContextBridge(
  deps: ContextBridgeDeps,
  options?: ContextBridgeOptions,
): ContextBridge {
  const maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxMessageAgeMs = options?.maxMessageAgeMs ?? DEFAULT_MAX_MESSAGE_AGE_MS;
  const messageBuffers = new Map<string, BridgedMessage[]>();

  function recordMessage(params: RecordMessageParams): void {
    const { threadCanonicalId, channel, role, content } = params;
    const timestamp = params.timestamp ?? Date.now();

    let buffer = messageBuffers.get(threadCanonicalId);
    if (!buffer) {
      buffer = [];
      messageBuffers.set(threadCanonicalId, buffer);
    }

    buffer.push({ role, content, timestamp, sourceChannel: channel });

    if (buffer.length > MAX_STORED_MESSAGES_PER_THREAD) {
      messageBuffers.set(
        threadCanonicalId,
        buffer.slice(buffer.length - MAX_STORED_MESSAGES_PER_THREAD),
      );
    }
  }

  function getRecentMessages(threadCanonicalId: string, now: number): BridgedMessage[] {
    const buffer = messageBuffers.get(threadCanonicalId);
    if (!buffer || buffer.length === 0) {
      return [];
    }

    const cutoff = now - maxMessageAgeMs;
    const recent = buffer.filter((m) => m.timestamp >= cutoff);

    if (recent.length <= maxMessages) {
      return recent;
    }
    return recent.slice(recent.length - maxMessages);
  }

  function buildBridgeContext(params: BuildBridgeContextParams): BridgedContext | undefined {
    const { threadCanonicalId, sourceChannel, targetChannel, reason } = params;

    const thread = deps.threadRegistry.getThread(threadCanonicalId);
    if (!thread) {
      log.debug("no thread found for bridge", { threadCanonicalId });
      return undefined;
    }

    const now = Date.now();
    const recentMessages = getRecentMessages(threadCanonicalId, now);

    return {
      threadCanonicalId,
      sourceChannel,
      targetChannel,
      recentMessages,
      sessionKey: thread.sessionKey,
      bridgedAt: now,
      reason,
    };
  }

  function formatContextForAgent(context: BridgedContext): string {
    const lines: string[] = [];
    lines.push(
      `[Conversation continuity: moved from ${context.sourceChannel} to ${context.targetChannel}]`,
    );

    if (context.reason === "failover" || context.reason === "channel-offline") {
      lines.push(
        `[Reason: ${context.sourceChannel} became unavailable, conversation continued here]`,
      );
    } else if (context.reason === "user-initiated") {
      lines.push(`[Reason: user chose to continue conversation on ${context.targetChannel}]`);
    }

    if (context.recentMessages.length > 0) {
      lines.push("");
      lines.push("Recent conversation context:");
      for (const msg of context.recentMessages) {
        const roleLabel = msg.role === "user" ? "User" : "Assistant";
        const truncated =
          msg.content.length > 500 ? msg.content.slice(0, 497) + "..." : msg.content;
        lines.push(`  ${roleLabel}: ${truncated}`);
      }
    }

    return lines.join("\n");
  }

  function formatSwitchNotice(context: BridgedContext): string {
    const reasonText =
      context.reason === "failover" || context.reason === "channel-offline"
        ? `${context.sourceChannel} is currently unavailable`
        : `conversation moved from ${context.sourceChannel}`;

    const messageNote =
      context.recentMessages.length > 0
        ? ` I have context from our recent conversation (${context.recentMessages.length} messages).`
        : "";

    return `Continuing conversation here (${reasonText}).${messageNote}`;
  }

  return { buildBridgeContext, recordMessage, formatContextForAgent, formatSwitchNotice };
}
