import { describe, expect, it } from "vitest";
import { isDingTalkSenderAllowed } from "./policy.js";

describe("isDingTalkSenderAllowed", () => {
  it("allows when wildcard is in list", () => {
    expect(isDingTalkSenderAllowed({ senderId: "abc123", allowFrom: ["*"] })).toBe(true);
  });

  it("allows when senderId is in list", () => {
    expect(isDingTalkSenderAllowed({ senderId: "abc123", allowFrom: ["abc123", "xyz789"] })).toBe(
      true,
    );
  });

  it("allows when senderNick matches", () => {
    expect(
      isDingTalkSenderAllowed({
        senderId: "uid-001",
        senderNick: "Alice",
        allowFrom: ["Alice"],
      }),
    ).toBe(true);
  });

  it("denies when neither id nor nick matches", () => {
    expect(
      isDingTalkSenderAllowed({
        senderId: "uid-999",
        senderNick: "Bob",
        allowFrom: ["Alice", "uid-001"],
      }),
    ).toBe(false);
  });

  it("denies when allowFrom is empty", () => {
    expect(isDingTalkSenderAllowed({ senderId: "uid-001", allowFrom: [] })).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isDingTalkSenderAllowed({ senderId: "ABC123", allowFrom: ["abc123"] })).toBe(true);
  });
});
