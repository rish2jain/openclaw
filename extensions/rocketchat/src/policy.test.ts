import { describe, expect, it } from "vitest";
import { isRocketChatSenderAllowed } from "./policy.js";

describe("isRocketChatSenderAllowed", () => {
  it("allows wildcard", () => {
    expect(isRocketChatSenderAllowed({ userId: "u1", allowFrom: ["*"] })).toBe(true);
  });

  it("allows matching userId", () => {
    expect(isRocketChatSenderAllowed({ userId: "u1", allowFrom: ["u1", "u2"] })).toBe(true);
  });

  it("allows matching userName", () => {
    expect(
      isRocketChatSenderAllowed({ userId: "uid-x", userName: "alice", allowFrom: ["alice"] }),
    ).toBe(true);
  });

  it("denies unrecognized sender", () => {
    expect(isRocketChatSenderAllowed({ userId: "uid-x", allowFrom: ["uid-y"] })).toBe(false);
  });

  it("denies empty allowFrom", () => {
    expect(isRocketChatSenderAllowed({ userId: "uid-x", allowFrom: [] })).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isRocketChatSenderAllowed({ userId: "UID-X", allowFrom: ["uid-x"] })).toBe(true);
  });
});
