import { describe, it, expect, beforeEach } from "vitest";
import {
  withCorrelationContext,
  getCorrelationContext,
  getCorrelationId,
  enrichCorrelationContext,
  setCorrelationAttribute,
  generateCorrelationId,
  resetCorrelationSeqForTest,
} from "./correlation-context.js";

describe("correlation-context", () => {
  beforeEach(() => {
    resetCorrelationSeqForTest();
  });

  it("returns undefined outside a context", () => {
    expect(getCorrelationContext()).toBeUndefined();
    expect(getCorrelationId()).toBeUndefined();
  });

  it("provides context within withCorrelationContext", () => {
    withCorrelationContext({ correlationId: "test-123", channelType: "telegram" }, () => {
      const ctx = getCorrelationContext();
      expect(ctx).toBeDefined();
      expect(ctx?.correlationId).toBe("test-123");
      expect(ctx?.channelType).toBe("telegram");
    });
  });

  it("generates a unique correlation ID when not provided", () => {
    withCorrelationContext({}, () => {
      const id = getCorrelationId();
      expect(id).toBeDefined();
      expect(id).toMatch(/^cid-/);
    });
  });

  it("generates unique IDs on each call", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCorrelationId());
    }
    expect(ids.size).toBe(100);
  });

  it("propagates through async operations", async () => {
    await withCorrelationContext({ correlationId: "async-test" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getCorrelationId()).toBe("async-test");
    });
  });

  it("enriches context with updates", () => {
    withCorrelationContext({ correlationId: "enrich-test" }, () => {
      enrichCorrelationContext({ sessionId: "sess-1", agentId: "agent-a" });
      const ctx = getCorrelationContext();
      expect(ctx?.sessionId).toBe("sess-1");
      expect(ctx?.agentId).toBe("agent-a");
    });
  });

  it("enrichCorrelationContext is no-op outside context", () => {
    enrichCorrelationContext({ sessionId: "orphan" });
    expect(getCorrelationContext()).toBeUndefined();
  });

  it("sets custom attributes", () => {
    withCorrelationContext({ correlationId: "attr-test" }, () => {
      setCorrelationAttribute("messageSize", 1024);
      setCorrelationAttribute("isRetry", true);
      const ctx = getCorrelationContext();
      expect(ctx?.attributes.messageSize).toBe(1024);
      expect(ctx?.attributes.isRetry).toBe(true);
    });
  });

  it("setCorrelationAttribute is no-op outside context", () => {
    setCorrelationAttribute("orphan", "value");
  });

  it("nested contexts are isolated", () => {
    withCorrelationContext({ correlationId: "outer" }, () => {
      expect(getCorrelationId()).toBe("outer");
      withCorrelationContext({ correlationId: "inner" }, () => {
        expect(getCorrelationId()).toBe("inner");
      });
      expect(getCorrelationId()).toBe("outer");
    });
  });

  it("includes createdAt timestamp", () => {
    const before = Date.now();
    withCorrelationContext({}, () => {
      const ctx = getCorrelationContext();
      expect(ctx?.createdAt).toBeGreaterThanOrEqual(before);
      expect(ctx?.createdAt).toBeLessThanOrEqual(Date.now());
    });
  });
});
