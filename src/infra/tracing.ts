/**
 * Message pipeline tracing helpers.
 *
 * Provides span creation utilities that integrate with the existing
 * diagnostic events system and the diagnostics-otel extension.
 * Each span represents a phase in the message lifecycle:
 *
 *   channel-receive -> message-parse -> agent-process ->
 *   tool-execute -> response-generate -> channel-deliver
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { getCorrelationContext, getCorrelationId } from "./correlation-context.js";

const log = createSubsystemLogger("tracing");

export type SpanPhase =
  | "channel-receive"
  | "message-parse"
  | "agent-process"
  | "tool-execute"
  | "response-generate"
  | "channel-deliver";

export type SpanAttributes = Record<string, string | number | boolean>;

export type Span = {
  /** The span phase name. */
  phase: SpanPhase;
  /** When the span started (ms since epoch). */
  startTime: number;
  /** Correlation ID inherited from the async context. */
  correlationId?: string;
  /** Additional span attributes. */
  attributes: SpanAttributes;
  /** Mark the span as successfully completed. */
  end: (extraAttrs?: SpanAttributes) => void;
  /** Mark the span as failed with an error. */
  fail: (error: string | Error, extraAttrs?: SpanAttributes) => void;
  /** Add attributes to the span after creation. */
  addAttributes: (attrs: SpanAttributes) => void;
};

/**
 * Completed span event emitted to listeners.
 */
export type SpanEndEvent = {
  phase: SpanPhase;
  correlationId?: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  attributes: SpanAttributes;
  status: "ok" | "error";
  error?: string;
};

const SPAN_LISTENER_KEY: unique symbol = Symbol.for("openclaw.spanListeners");

function getSpanListeners(): Set<(event: SpanEndEvent) => void> {
  const globalState = globalThis as typeof globalThis & {
    [SPAN_LISTENER_KEY]?: Set<(event: SpanEndEvent) => void>;
  };
  if (!globalState[SPAN_LISTENER_KEY]) {
    globalState[SPAN_LISTENER_KEY] = new Set();
  }
  return globalState[SPAN_LISTENER_KEY];
}

/**
 * Register a listener for completed span events.
 * The diagnostics-otel extension uses this to export spans to OTLP.
 * Returns an unsubscribe function.
 */
export function onSpanEnd(listener: (event: SpanEndEvent) => void): () => void {
  const listeners = getSpanListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emitSpanEnd(event: SpanEndEvent): void {
  const listeners = getSpanListeners();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      log.error(
        `span listener failed for phase=${event.phase}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Start a new trace span for a message pipeline phase.
 * Automatically captures the correlation ID from the current async context.
 */
export function startSpan(phase: SpanPhase, attributes?: SpanAttributes): Span {
  const correlationId = getCorrelationId();
  const startTime = Date.now();
  const spanAttrs: SpanAttributes = { ...attributes };

  // Enrich with correlation context
  const ctx = getCorrelationContext();
  if (ctx?.channelType) {
    spanAttrs.channelType = ctx.channelType;
  }
  if (ctx?.sessionId) {
    spanAttrs.sessionId = ctx.sessionId;
  }
  if (ctx?.agentId) {
    spanAttrs.agentId = ctx.agentId;
  }

  let ended = false;

  const span: Span = {
    phase,
    startTime,
    correlationId,
    attributes: spanAttrs,

    addAttributes(attrs: SpanAttributes) {
      if (ended) {
        return;
      }
      Object.assign(spanAttrs, attrs);
    },

    end(extraAttrs?: SpanAttributes) {
      if (ended) {
        return;
      }
      ended = true;
      if (extraAttrs) {
        Object.assign(spanAttrs, extraAttrs);
      }
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      log.debug(`span ${phase} completed`, { durationMs, ...spanAttrs });

      emitSpanEnd({
        phase,
        correlationId,
        startTime,
        endTime,
        durationMs,
        attributes: spanAttrs,
        status: "ok",
      });
    },

    fail(error: string | Error, extraAttrs?: SpanAttributes) {
      if (ended) {
        return;
      }
      ended = true;
      if (extraAttrs) {
        Object.assign(spanAttrs, extraAttrs);
      }
      const endTime = Date.now();
      const durationMs = endTime - startTime;
      const errorMessage = error instanceof Error ? error.message : error;

      log.warn(`span ${phase} failed: ${errorMessage}`, {
        durationMs,
        error: errorMessage,
        ...spanAttrs,
      });

      emitSpanEnd({
        phase,
        correlationId,
        startTime,
        endTime,
        durationMs,
        attributes: spanAttrs,
        status: "error",
        error: errorMessage,
      });
    },
  };

  return span;
}

/**
 * Convenience: run an async function within a traced span.
 * The span is automatically ended on success or failed on error.
 */
export async function withSpan<T>(
  phase: SpanPhase,
  attributes: SpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = startSpan(phase, attributes);
  try {
    const result = await fn(span);
    span.end();
    return result;
  } catch (err) {
    span.fail(err instanceof Error ? err : String(err));
    throw err;
  }
}

/**
 * Synchronous version of withSpan for non-async operations.
 */
export function withSpanSync<T>(
  phase: SpanPhase,
  attributes: SpanAttributes,
  fn: (span: Span) => T,
): T {
  const span = startSpan(phase, attributes);
  try {
    const result = fn(span);
    span.end();
    return result;
  } catch (err) {
    span.fail(err instanceof Error ? err : String(err));
    throw err;
  }
}

/**
 * Reset span listeners for tests.
 */
export function resetSpanListenersForTest(): void {
  getSpanListeners().clear();
}
