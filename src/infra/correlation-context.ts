/**
 * Correlation context for request-scoped tracing.
 *
 * Uses AsyncLocalStorage to propagate correlation IDs through the
 * async call chain from channel ingestion to response delivery.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type CorrelationContext = {
  /** Unique ID tracing a message from ingestion to delivery. */
  correlationId: string;
  /** Channel that originated the message (e.g. "telegram", "discord"). */
  channelType?: string;
  /** Session key for the current conversation. */
  sessionId?: string;
  /** Agent handling the message. */
  agentId?: string;
  /** Component that created this context (e.g. "gateway/webhook", "agent/runner"). */
  component?: string;
  /** Unix timestamp when the context was created. */
  createdAt: number;
  /** Arbitrary key-value pairs for downstream enrichment. */
  attributes: Record<string, string | number | boolean>;
};

const CORRELATION_SCOPE_KEY: unique symbol = Symbol.for("openclaw.correlationScope");

const correlationScope = (() => {
  const globalState = globalThis as typeof globalThis & {
    [CORRELATION_SCOPE_KEY]?: AsyncLocalStorage<CorrelationContext>;
  };
  const existing = globalState[CORRELATION_SCOPE_KEY];
  if (existing) {
    return existing;
  }
  const created = new AsyncLocalStorage<CorrelationContext>();
  globalState[CORRELATION_SCOPE_KEY] = created;
  return created;
})();

/**
 * Generate a new correlation ID. Uses a v4 UUID prefix for uniqueness
 * with a monotonic suffix for ordering within the same process.
 */
let correlationSeq = 0;
export function generateCorrelationId(): string {
  correlationSeq += 1;
  const uuid = randomUUID();
  // Use first 12 chars of UUID + seq for compact, unique IDs
  return `cid-${uuid.slice(0, 12)}-${correlationSeq}`;
}

/**
 * Run a function within a correlation context. All async operations
 * within `fn` will inherit this context.
 */
export function withCorrelationContext<T>(
  ctx: Partial<CorrelationContext> & { correlationId?: string },
  fn: () => T,
): T {
  const full: CorrelationContext = {
    correlationId: ctx.correlationId ?? generateCorrelationId(),
    channelType: ctx.channelType,
    sessionId: ctx.sessionId,
    agentId: ctx.agentId,
    component: ctx.component,
    createdAt: ctx.createdAt ?? Date.now(),
    attributes: ctx.attributes ?? {},
  };
  return correlationScope.run(full, fn);
}

/**
 * Get the current correlation context, or undefined if not in a correlation scope.
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationScope.getStore();
}

/**
 * Get the current correlation ID, or undefined if not in a correlation scope.
 */
export function getCorrelationId(): string | undefined {
  return correlationScope.getStore()?.correlationId;
}

/**
 * Enrich the current correlation context with additional attributes.
 * No-op if not in a correlation scope.
 */
export function enrichCorrelationContext(
  updates: Partial<Pick<CorrelationContext, "sessionId" | "agentId" | "channelType" | "component">>,
): void {
  const ctx = correlationScope.getStore();
  if (!ctx) {
    return;
  }
  if (updates.sessionId !== undefined) {
    ctx.sessionId = updates.sessionId;
  }
  if (updates.agentId !== undefined) {
    ctx.agentId = updates.agentId;
  }
  if (updates.channelType !== undefined) {
    ctx.channelType = updates.channelType;
  }
  if (updates.component !== undefined) {
    ctx.component = updates.component;
  }
}

/**
 * Set a custom attribute on the current correlation context.
 * No-op if not in a correlation scope.
 */
export function setCorrelationAttribute(key: string, value: string | number | boolean): void {
  const ctx = correlationScope.getStore();
  if (!ctx) {
    return;
  }
  ctx.attributes[key] = value;
}

/**
 * Reset correlation sequence counter for tests.
 */
export function resetCorrelationSeqForTest(): void {
  correlationSeq = 0;
}
