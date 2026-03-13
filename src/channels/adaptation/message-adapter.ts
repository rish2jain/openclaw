import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { ChannelId } from "../plugins/types.js";
import type { ChannelCapabilities } from "../plugins/types.js";

const log = createSubsystemLogger("channels/adaptation/message-adapter");

export type ChannelFormatCapabilities = {
  base: ChannelCapabilities;
  maxMessageLength: number;
  markdown: boolean;
  html: boolean;
  inlineImages: boolean;
  fileAttachments: boolean;
  buttons: boolean;
  reactions: boolean;
  threadedReplies: boolean;
  codeBlocks: boolean;
  maxButtons: number;
  supportedMediaTypes: string[];
};

const CHANNEL_FORMAT_DEFAULTS: Partial<Record<string, Omit<ChannelFormatCapabilities, "base">>> = {
  telegram: {
    maxMessageLength: 4096,
    markdown: true,
    html: true,
    inlineImages: true,
    fileAttachments: true,
    buttons: true,
    reactions: true,
    threadedReplies: true,
    codeBlocks: true,
    maxButtons: 100,
    supportedMediaTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "video/mp4",
      "audio/mpeg",
      "audio/ogg",
      "application/pdf",
    ],
  },
  discord: {
    maxMessageLength: 2000,
    markdown: true,
    html: false,
    inlineImages: true,
    fileAttachments: true,
    buttons: true,
    reactions: true,
    threadedReplies: true,
    codeBlocks: true,
    maxButtons: 25,
    supportedMediaTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "audio/mpeg",
      "application/pdf",
    ],
  },
  slack: {
    maxMessageLength: 40000,
    markdown: true,
    html: false,
    inlineImages: true,
    fileAttachments: true,
    buttons: true,
    reactions: true,
    threadedReplies: true,
    codeBlocks: true,
    maxButtons: 25,
    supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4", "application/pdf"],
  },
  whatsapp: {
    maxMessageLength: 65536,
    markdown: true,
    html: false,
    inlineImages: true,
    fileAttachments: true,
    buttons: true,
    reactions: true,
    threadedReplies: false,
    codeBlocks: true,
    maxButtons: 3,
    supportedMediaTypes: [
      "image/jpeg",
      "image/png",
      "video/mp4",
      "audio/mpeg",
      "audio/ogg",
      "application/pdf",
    ],
  },
  signal: {
    maxMessageLength: 0,
    markdown: false,
    html: false,
    inlineImages: true,
    fileAttachments: true,
    buttons: false,
    reactions: true,
    threadedReplies: false,
    codeBlocks: false,
    maxButtons: 0,
    supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4", "audio/mpeg"],
  },
  imessage: {
    maxMessageLength: 20000,
    markdown: false,
    html: false,
    inlineImages: true,
    fileAttachments: true,
    buttons: false,
    reactions: true,
    threadedReplies: false,
    codeBlocks: false,
    maxButtons: 0,
    supportedMediaTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/heic",
      "video/mp4",
      "video/quicktime",
      "audio/mpeg",
      "application/pdf",
    ],
  },
};

const FALLBACK_FORMAT: Omit<ChannelFormatCapabilities, "base"> = {
  maxMessageLength: 4096,
  markdown: false,
  html: false,
  inlineImages: false,
  fileAttachments: false,
  buttons: false,
  reactions: false,
  threadedReplies: false,
  codeBlocks: false,
  maxButtons: 0,
  supportedMediaTypes: [],
};

export type AdaptableMessage = {
  text: string;
  isMarkdown?: boolean;
  media?: Array<{ url: string; mimeType: string; caption?: string }>;
};

export type AdaptedMessage = {
  textChunks: string[];
  formattingChanged: boolean;
  supportedMedia: Array<{ url: string; mimeType: string; caption?: string }>;
  unsupportedMedia: Array<{ url: string; mimeType: string; reason: string }>;
  warnings: string[];
};

export type MessageAdapterDeps = {
  getChannelCapabilities?: (channel: ChannelId) => ChannelCapabilities | undefined;
};

export type MessageAdapter = {
  getCapabilities: (channel: ChannelId) => ChannelFormatCapabilities;
  adaptMessage: (message: AdaptableMessage, targetChannel: ChannelId) => AdaptedMessage;
  registerCapabilities: (
    channel: ChannelId,
    capabilities: Partial<Omit<ChannelFormatCapabilities, "base">>,
  ) => void;
};

export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (match) => {
      const inner = match.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return inner;
    })
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+(.+)$/gm, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*_]{3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function chunkText(text: string, maxLength: number): string[] {
  if (maxLength <= 0 || text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitIdx = remaining.lastIndexOf("\n\n", maxLength);
    if (splitIdx < maxLength * 0.3) {
      splitIdx = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitIdx < maxLength * 0.3) {
      splitIdx = remaining.lastIndexOf(". ", maxLength);
      if (splitIdx > 0) {
        splitIdx += 1;
      }
    }
    if (splitIdx < maxLength * 0.3) {
      splitIdx = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIdx < maxLength * 0.3) {
      splitIdx = maxLength;
    }
    chunks.push(remaining.slice(0, splitIdx).trimEnd());
    remaining = remaining.slice(splitIdx).trimStart();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

export function createMessageAdapter(deps?: MessageAdapterDeps): MessageAdapter {
  const customCapabilities = new Map<ChannelId, Partial<Omit<ChannelFormatCapabilities, "base">>>();

  function getCapabilities(channel: ChannelId): ChannelFormatCapabilities {
    const baseCapabilities = deps?.getChannelCapabilities?.(channel) ?? {
      chatTypes: ["direct", "group"],
    };
    const defaults = CHANNEL_FORMAT_DEFAULTS[channel] ?? FALLBACK_FORMAT;
    const custom = customCapabilities.get(channel);
    return { base: baseCapabilities, ...defaults, ...custom };
  }

  function adaptMessage(message: AdaptableMessage, targetChannel: ChannelId): AdaptedMessage {
    const capabilities = getCapabilities(targetChannel);
    const warnings: string[] = [];
    let formattingChanged = false;

    let adaptedText = message.text;
    if (message.isMarkdown && !capabilities.markdown) {
      adaptedText = stripMarkdown(adaptedText);
      formattingChanged = true;
      log.debug("stripped markdown for channel", { channel: targetChannel });
    }

    const textChunks = chunkText(adaptedText, capabilities.maxMessageLength);
    if (textChunks.length > 1) {
      warnings.push(
        `Message split into ${textChunks.length} chunks (limit: ${capabilities.maxMessageLength} chars)`,
      );
    }

    const supportedMedia: AdaptedMessage["supportedMedia"] = [];
    const unsupportedMedia: AdaptedMessage["unsupportedMedia"] = [];

    if (message.media) {
      for (const item of message.media) {
        if (!capabilities.fileAttachments && !capabilities.inlineImages) {
          unsupportedMedia.push({
            url: item.url,
            mimeType: item.mimeType,
            reason: "channel does not support media",
          });
          continue;
        }
        // Empty supportedMediaTypes means allow all media types; only validate mimeType when the list is non-empty.
        if (
          capabilities.supportedMediaTypes.length > 0 &&
          !capabilities.supportedMediaTypes.includes(item.mimeType)
        ) {
          unsupportedMedia.push({
            url: item.url,
            mimeType: item.mimeType,
            reason: `unsupported media type: ${item.mimeType}`,
          });
          continue;
        }
        supportedMedia.push(item);
      }
      if (unsupportedMedia.length > 0) {
        warnings.push(
          `${unsupportedMedia.length} media attachment(s) not supported on ${targetChannel}`,
        );
      }
    }

    return { textChunks, formattingChanged, supportedMedia, unsupportedMedia, warnings };
  }

  function registerCapabilities(
    channel: ChannelId,
    capabilities: Partial<Omit<ChannelFormatCapabilities, "base">>,
  ): void {
    customCapabilities.set(channel, capabilities);
  }

  return { getCapabilities, adaptMessage, registerCapabilities };
}
