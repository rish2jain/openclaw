import { describe, it, expect } from "vitest";
import { isGap } from "./types.js";

describe("isGap", () => {
  it("returns true when current is below required", () => {
    expect(isGap("beginner", "advanced")).toBe(true);
  });

  it("returns false when current equals required", () => {
    expect(isGap("advanced", "advanced")).toBe(false);
  });

  it("returns false when current exceeds required", () => {
    expect(isGap("expert", "intermediate")).toBe(false);
  });

  it("handles none as current", () => {
    expect(isGap("none", "beginner")).toBe(true);
  });
});
