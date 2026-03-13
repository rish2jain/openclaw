import { describe, it, expect } from "vitest";
import { isRetryable, type DeliveryError } from "./delivery-retry.js";

describe("isRetryable", () => {
  it("returns true for retryable error codes", () => {
    expect(isRetryable({ code: "timeout", message: "timed out" })).toBe(true);
    expect(isRetryable({ code: "network", message: "network error" })).toBe(true);
    expect(isRetryable({ code: "rate_limit", message: "rate limited" })).toBe(true);
    expect(isRetryable({ code: "server_error", message: "500" })).toBe(true);
    expect(isRetryable({ code: "overloaded", message: "overloaded" })).toBe(true);
  });

  it("returns false for non-retryable error codes", () => {
    expect(isRetryable({ code: "auth", message: "unauthorized" })).toBe(false);
    expect(isRetryable({ code: "permission_denied", message: "forbidden" })).toBe(false);
    expect(isRetryable({ code: "invalid_content", message: "bad content" })).toBe(false);
    expect(isRetryable({ code: "not_found", message: "404" })).toBe(false);
    expect(isRetryable({ code: "blocked", message: "blocked" })).toBe(false);
  });

  it("returns false for unknown error codes (safe default)", () => {
    const unknownError: DeliveryError = { code: "unknown_code", message: "something went wrong" };
    expect(isRetryable(unknownError)).toBe(false);
    expect(isRetryable({ code: "custom_error", message: "custom" })).toBe(false);
  });

  it("returns false for empty string code", () => {
    expect(isRetryable({ code: "", message: "empty code" })).toBe(false);
  });

  it("is case-sensitive: uppercase variants of retryable codes are unknown (return false)", () => {
    expect(isRetryable({ code: "timeout", message: "x" })).toBe(true);
    expect(isRetryable({ code: "TIMEOUT", message: "x" })).toBe(false);
    expect(isRetryable({ code: "Timeout", message: "x" })).toBe(false);
    expect(isRetryable({ code: "SERVER_ERROR", message: "x" })).toBe(false);
  });

  it("returns false for non-string or undefined code at runtime (safe default)", () => {
    expect(isRetryable({ code: undefined as unknown as string, message: "x" })).toBe(false);
    expect(isRetryable({ code: 123 as unknown as string, message: "x" })).toBe(false);
  });
});
