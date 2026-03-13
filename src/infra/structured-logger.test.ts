import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { withCorrelationContext, resetCorrelationSeqForTest } from "./correlation-context.js";
import {
  createStructuredLogger,
  registerStructuredLogTransport,
  resetStructuredLogTransportsForTest,
  type StructuredLogEntry,
} from "./structured-logger.js";

describe("structured-logger", () => {
  const collected: StructuredLogEntry[] = [];
  let unsub: (() => void) | undefined;

  beforeEach(() => {
    resetStructuredLogTransportsForTest();
    resetCorrelationSeqForTest();
    collected.length = 0;
    unsub = registerStructuredLogTransport((entry) => {
      collected.push(entry);
    });
  });

  afterEach(() => {
    unsub?.();
    resetStructuredLogTransportsForTest();
  });

  it("emits structured entries with required fields", () => {
    const logger = createStructuredLogger("test-component");
    logger.info("hello world");

    expect(collected).toHaveLength(1);
    const entry = collected[0];
    expect(entry.level).toBe("info");
    expect(entry.component).toBe("test-component");
    expect(entry.message).toBe("hello world");
    expect(entry.timestamp).toBeTruthy();
  });

  it("includes correlation context when available", () => {
    const logger = createStructuredLogger("test");
    withCorrelationContext(
      {
        correlationId: "cid-abc",
        channelType: "discord",
        sessionId: "sess-1",
        agentId: "agent-x",
      },
      () => {
        logger.info("within context");
      },
    );

    expect(collected).toHaveLength(1);
    const entry = collected[0];
    expect(entry.correlationId).toBe("cid-abc");
    expect(entry.channelType).toBe("discord");
    expect(entry.sessionId).toBe("sess-1");
    expect(entry.agentId).toBe("agent-x");
  });

  it("omits correlation fields when not in context", () => {
    const logger = createStructuredLogger("test");
    logger.warn("no context");

    expect(collected).toHaveLength(1);
    const entry = collected[0];
    expect(entry.correlationId).toBeUndefined();
    expect(entry.channelType).toBeUndefined();
  });

  it("merges extra metadata into entries", () => {
    const logger = createStructuredLogger("test");
    logger.error("failed", { durationMs: 150, retryCount: 3 });

    expect(collected).toHaveLength(1);
    const entry = collected[0];
    expect(entry.durationMs).toBe(150);
    expect(entry.retryCount).toBe(3);
  });

  it("does not overwrite core fields with metadata", () => {
    const logger = createStructuredLogger("test");
    logger.info("msg", { level: "fatal", component: "hacked" });

    expect(collected).toHaveLength(1);
    const entry = collected[0];
    expect(entry.level).toBe("info");
    expect(entry.component).toBe("test");
  });

  it("creates child loggers with compound component names", () => {
    const parent = createStructuredLogger("gateway");
    const child = parent.child("webhook");
    child.debug("child message");

    expect(collected).toHaveLength(1);
    expect(collected[0].component).toBe("gateway/webhook");
  });

  it("supports multiple transports", () => {
    const other: StructuredLogEntry[] = [];
    const unsub2 = registerStructuredLogTransport((entry) => {
      other.push(entry);
    });

    const logger = createStructuredLogger("multi");
    logger.info("broadcast");

    expect(collected).toHaveLength(1);
    expect(other).toHaveLength(1);
    unsub2();
  });

  it("survives transport errors", () => {
    registerStructuredLogTransport(() => {
      throw new Error("transport boom");
    });

    const logger = createStructuredLogger("resilient");
    logger.info("keep going");

    expect(collected).toHaveLength(1);
  });

  it("emits for all log levels", () => {
    const logger = createStructuredLogger("levels");
    logger.trace("t");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    logger.fatal("f");

    const levels = collected.map((e) => e.level);
    expect(levels).toEqual(["trace", "debug", "info", "warn", "error", "fatal"]);
  });
});
