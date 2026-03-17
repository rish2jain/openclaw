/**
 * Structured JSON logger that wraps the existing subsystem logger
 * with correlation context and standardized fields.
 *
 * Each log entry includes:
 * - correlationId: message-level trace ID from AsyncLocalStorage
 * - channelType: originating channel
 * - sessionId: conversation session
 * - agentId: handling agent
 * - timestamp: ISO 8601
 * - level: log level
 * - component: subsystem producing the log
 */

import type { LogLevel } from "../logging/levels.js";
import { createSubsystemLogger, type SubsystemLogger } from "../logging/subsystem.js";
import { getCorrelationContext } from "./correlation-context.js";

export type StructuredLogEntry = {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  correlationId?: string;
  channelType?: string;
  sessionId?: string;
  agentId?: string;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
};

export type StructuredLogTransport = (entry: StructuredLogEntry) => void;

/**
 * Global transports for structured log entries.
 * Extensions and tests can register additional transports.
 */
const STRUCTURED_TRANSPORT_KEY: unique symbol = Symbol.for("openclaw.structuredLogTransports");

function getTransports(): Set<StructuredLogTransport> {
  const globalState = globalThis as typeof globalThis & {
    [STRUCTURED_TRANSPORT_KEY]?: Set<StructuredLogTransport>;
  };
  if (!globalState[STRUCTURED_TRANSPORT_KEY]) {
    globalState[STRUCTURED_TRANSPORT_KEY] = new Set();
  }
  return globalState[STRUCTURED_TRANSPORT_KEY];
}

/**
 * Register a transport that receives all structured log entries.
 * Returns an unsubscribe function.
 */
export function registerStructuredLogTransport(transport: StructuredLogTransport): () => void {
  const transports = getTransports();
  transports.add(transport);
  return () => {
    transports.delete(transport);
  };
}

function emitToTransports(entry: StructuredLogEntry): void {
  const transports = getTransports();
  for (const transport of transports) {
    try {
      transport(entry);
    } catch {
      // Silently drop transport errors to avoid log recursion.
    }
  }
}

export type StructuredLogger = {
  /** The underlying subsystem logger. */
  subsystem: SubsystemLogger;
  /** Component name for this logger. */
  component: string;

  trace: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  fatal: (message: string, meta?: Record<string, unknown>) => void;

  /** Create a child logger with a sub-component name. */
  child: (name: string) => StructuredLogger;

  /** Check if a level is enabled. */
  isEnabled: (level: LogLevel) => boolean;
};

/**
 * Build a structured log entry by merging correlation context,
 * component name, level, message, and optional metadata.
 */
function buildEntry(
  component: string,
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): StructuredLogEntry {
  const ctx = getCorrelationContext();
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
  };
  // Correlation context fields
  if (ctx) {
    entry.correlationId = ctx.correlationId;
    if (ctx.channelType) {
      entry.channelType = ctx.channelType;
    }
    if (ctx.sessionId) {
      entry.sessionId = ctx.sessionId;
    }
    if (ctx.agentId) {
      entry.agentId = ctx.agentId;
    }
  }
  // Merge extra metadata
  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (value !== undefined && !(key in entry)) {
        entry[key] = value;
      }
    }
  }
  return entry;
}

/**
 * Create a structured logger that wraps an existing subsystem logger.
 * Log entries are enriched with correlation context from AsyncLocalStorage.
 */
export function createStructuredLogger(component: string): StructuredLogger {
  const sub = createSubsystemLogger(component);

  const emit = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    // Build structured entry and dispatch to transports
    const entry = buildEntry(component, level, message, meta);
    emitToTransports(entry);
    // Delegate to the existing subsystem logger for file + console output.
    // Include correlationId in meta so it appears in log files.
    const enrichedMeta: Record<string, unknown> = { ...meta };
    if (entry.correlationId) {
      enrichedMeta.correlationId = entry.correlationId;
    }
    (sub as unknown as Record<string, (msg: string, meta?: Record<string, unknown>) => void>)[
      level
    ](message, Object.keys(enrichedMeta).length > 0 ? enrichedMeta : undefined);
  };

  const logger: StructuredLogger = {
    subsystem: sub,
    component,
    trace: (message, meta) => emit("trace", message, meta),
    debug: (message, meta) => emit("debug", message, meta),
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta),
    fatal: (message, meta) => emit("fatal", message, meta),
    child: (name) => createStructuredLogger(`${component}/${name}`),
    isEnabled: (level) => sub.isEnabled(level),
  };
  return logger;
}

/**
 * Reset structured log transports for tests.
 */
export function resetStructuredLogTransportsForTest(): void {
  getTransports().clear();
}
