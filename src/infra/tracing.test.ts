import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withCorrelationContext, resetCorrelationSeqForTest } from "./correlation-context.js";
import {
  startSpan,
  withSpan,
  withSpanSync,
  onSpanEnd,
  resetSpanListenersForTest,
  type SpanEndEvent,
} from "./tracing.js";

describe("tracing", () => {
  const events: SpanEndEvent[] = [];
  let unsub: (() => void) | undefined;

  beforeEach(() => {
    resetSpanListenersForTest();
    resetCorrelationSeqForTest();
    events.length = 0;
    unsub = onSpanEnd((evt) => events.push(evt));
  });

  afterEach(() => {
    unsub?.();
    resetSpanListenersForTest();
  });

  it("creates and ends a span with duration", () => {
    const span = startSpan("channel-receive", { source: "telegram" });
    expect(span.phase).toBe("channel-receive");
    span.end();

    expect(events).toHaveLength(1);
    const evt = events[0];
    expect(evt.phase).toBe("channel-receive");
    expect(evt.status).toBe("ok");
    expect(evt.durationMs).toBeGreaterThanOrEqual(0);
    expect(evt.attributes.source).toBe("telegram");
  });

  it("captures correlation ID from context", () => {
    withCorrelationContext({ correlationId: "trace-cid" }, () => {
      const span = startSpan("message-parse");
      span.end();
    });

    expect(events).toHaveLength(1);
    expect(events[0].correlationId).toBe("trace-cid");
  });

  it("enriches span with correlation context attributes", () => {
    withCorrelationContext(
      {
        correlationId: "ctx-span",
        channelType: "discord",
        sessionId: "s1",
        agentId: "a1",
      },
      () => {
        const span = startSpan("agent-process");
        span.end();
      },
    );

    const evt = events[0];
    expect(evt.attributes.channelType).toBe("discord");
    expect(evt.attributes.sessionId).toBe("s1");
    expect(evt.attributes.agentId).toBe("a1");
  });

  it("marks failed spans with error status", () => {
    const span = startSpan("channel-deliver");
    span.fail("delivery timeout");

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("error");
    expect(events[0].error).toBe("delivery timeout");
  });

  it("accepts Error objects for fail", () => {
    const span = startSpan("tool-execute");
    span.fail(new Error("tool crashed"));

    expect(events[0].error).toBe("tool crashed");
  });

  it("prevents double-ending a span", () => {
    const span = startSpan("response-generate");
    span.end();
    span.end();

    expect(events).toHaveLength(1);
  });

  it("prevents end after fail", () => {
    const span = startSpan("message-parse");
    span.fail("parse error");
    span.end();

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("error");
  });

  it("allows adding attributes after creation", () => {
    const span = startSpan("agent-process");
    span.addAttributes({ model: "claude-3", tokensUsed: 500 });
    span.end();

    expect(events[0].attributes.model).toBe("claude-3");
    expect(events[0].attributes.tokensUsed).toBe(500);
  });

  it("addAttributes is no-op after end", () => {
    const span = startSpan("channel-receive");
    span.end();
    span.addAttributes({ late: true });

    expect(events[0].attributes.late).toBeUndefined();
  });

  it("withSpan auto-ends on success", async () => {
    const result = await withSpan("agent-process", { key: "val" }, async () => {
      return 42;
    });

    expect(result).toBe(42);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("ok");
  });

  it("withSpan auto-fails on error", async () => {
    await expect(
      withSpan("tool-execute", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("error");
    expect(events[0].error).toBe("boom");
  });

  it("withSpanSync works for sync operations", () => {
    const result = withSpanSync("message-parse", { format: "json" }, () => {
      return "parsed";
    });

    expect(result).toBe("parsed");
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("ok");
  });

  it("survives listener errors", () => {
    onSpanEnd(() => {
      throw new Error("listener crash");
    });

    const span = startSpan("channel-receive");
    span.end();

    expect(events).toHaveLength(1);
  });

  it("supports extra attributes on end", () => {
    const span = startSpan("channel-deliver");
    span.end({ bytesDelivered: 2048 });

    expect(events[0].attributes.bytesDelivered).toBe(2048);
  });
});
