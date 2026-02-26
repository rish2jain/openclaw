import { describe, expect, it } from "vitest";
import { splitText } from "./send.js";

describe("splitText", () => {
  it("returns single chunk for short text", () => {
    expect(splitText("hello", 100)).toEqual(["hello"]);
  });

  it("splits text at chunk boundary", () => {
    const text = "a".repeat(10);
    const chunks = splitText(text, 3);
    expect(chunks).toEqual(["aaa", "aaa", "aaa", "a"]);
  });

  it("uses default chunk size of 4000", () => {
    const text = "x".repeat(4001);
    const chunks = splitText(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(4000);
    expect(chunks[1].length).toBe(1);
  });
});
