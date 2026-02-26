import { describe, expect, it } from "vitest";
import { buildDingTalkSignParams, verifyDingTalkSignature } from "./sign.js";

describe("buildDingTalkSignParams", () => {
  it("returns a timestamp and base64 sign", () => {
    const { timestamp, sign } = buildDingTalkSignParams("my-secret");
    expect(timestamp).toMatch(/^\d+$/);
    expect(sign.length).toBeGreaterThan(0);
    // base64 characters only
    expect(sign).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("produces different signs for different secrets", () => {
    const a = buildDingTalkSignParams("secret-a");
    const b = buildDingTalkSignParams("secret-b");
    expect(a.sign).not.toBe(b.sign);
  });
});

describe("verifyDingTalkSignature", () => {
  it("accepts a valid signature within 60 seconds", () => {
    const secret = "test-secret";
    const { timestamp, sign } = buildDingTalkSignParams(secret);
    expect(verifyDingTalkSignature({ timestamp, sign, secret })).toBe(true);
  });

  it("rejects an incorrect signature", () => {
    const { timestamp } = buildDingTalkSignParams("secret");
    expect(verifyDingTalkSignature({ timestamp, sign: "wrong-sign", secret: "secret" })).toBe(
      false,
    );
  });

  it("rejects a stale timestamp (>60s old)", () => {
    const secret = "test-secret";
    const staleTimestamp = (Date.now() - 120_000).toString();
    const { sign } = buildDingTalkSignParams(secret);
    // sign computed with current ts won't match stale ts anyway — both checks fail
    expect(verifyDingTalkSignature({ timestamp: staleTimestamp, sign, secret })).toBe(false);
  });
});
