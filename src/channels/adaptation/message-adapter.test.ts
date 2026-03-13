import { describe, it, expect, beforeEach } from "vitest";
import {
  createMessageAdapter,
  stripMarkdown,
  chunkText,
  type MessageAdapter,
} from "./message-adapter.js";

describe("MessageAdapter", () => {
  let adapter: MessageAdapter;
  beforeEach(() => {
    adapter = createMessageAdapter();
  });

  describe("getCapabilities", () => {
    it("returns capabilities for known channels", () => {
      expect(adapter.getCapabilities("telegram").maxMessageLength).toBe(4096);
      expect(adapter.getCapabilities("discord").maxMessageLength).toBe(2000);
      expect(adapter.getCapabilities("signal").markdown).toBe(false);
    });

    it("returns fallback for unknown channels", () => {
      const caps = adapter.getCapabilities("unknown-channel");
      expect(caps.maxMessageLength).toBe(4096);
      expect(caps.markdown).toBe(false);
    });

    it("allows custom capabilities", () => {
      adapter.registerCapabilities("custom", { maxMessageLength: 1000, markdown: true });
      expect(adapter.getCapabilities("custom").maxMessageLength).toBe(1000);
    });
  });

  describe("adaptMessage", () => {
    it("passes through messages that fit", () => {
      const result = adapter.adaptMessage({ text: "Hello!", isMarkdown: false }, "telegram");
      expect(result.textChunks).toEqual(["Hello!"]);
      expect(result.formattingChanged).toBe(false);
    });

    it("strips markdown for non-markdown channels", () => {
      const result = adapter.adaptMessage(
        { text: "**bold** and *italic*", isMarkdown: true },
        "signal",
      );
      expect(result.textChunks[0]).toBe("bold and italic");
      expect(result.formattingChanged).toBe(true);
    });

    it("preserves markdown for markdown channels", () => {
      const result = adapter.adaptMessage({ text: "**bold**", isMarkdown: true }, "telegram");
      expect(result.textChunks[0]).toBe("**bold**");
      expect(result.formattingChanged).toBe(false);
    });

    it("chunks long messages", () => {
      const result = adapter.adaptMessage({ text: "A".repeat(5000) }, "discord");
      expect(result.textChunks.length).toBeGreaterThan(1);
      for (const chunk of result.textChunks) {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      }
    });

    it("filters unsupported media", () => {
      const result = adapter.adaptMessage(
        {
          text: "Check this",
          media: [
            { url: "photo.jpg", mimeType: "image/jpeg" },
            { url: "model.obj", mimeType: "model/obj" },
          ],
        },
        "telegram",
      );
      expect(result.supportedMedia).toHaveLength(1);
      expect(result.unsupportedMedia).toHaveLength(1);
    });
  });
});

describe("stripMarkdown", () => {
  it("strips bold", () => {
    expect(stripMarkdown("**bold**")).toBe("bold");
  });
  it("strips italic", () => {
    expect(stripMarkdown("*italic*")).toBe("italic");
  });
  it("strips inline code", () => {
    expect(stripMarkdown("`code`")).toBe("code");
  });
  it("strips code blocks", () => {
    expect(stripMarkdown("```js\nconst x = 1;\n```")).toBe("const x = 1;");
  });
  it("converts links", () => {
    expect(stripMarkdown("[Click](https://example.com)")).toBe("Click (https://example.com)");
  });
  it("strips headers", () => {
    expect(stripMarkdown("## Header")).toBe("Header");
  });
  it("strips strikethrough", () => {
    expect(stripMarkdown("~~deleted~~")).toBe("deleted");
  });
});

describe("chunkText", () => {
  it("returns single chunk for short text", () => {
    expect(chunkText("Hello", 100)).toEqual(["Hello"]);
  });
  it("returns single chunk when limit is 0", () => {
    expect(chunkText("Hello", 0)).toEqual(["Hello"]);
  });
  it("splits long text", () => {
    const chunks = chunkText("A".repeat(100), 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });
});
