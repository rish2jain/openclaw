/**
 * Retry logic for transient message delivery failures.
 *
 * Retries on: timeout, network error, rate_limit.
 * No retry on: auth error, permission denied, invalid content.
 */
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("channels/reliability/delivery-retry");

export type DeliveryError = {
  code: string;
  message: string;
  retryAfterMs?: number;
};

export type RetryableDeliveryFn = () => Promise<DeliveryResult>;

export type DeliveryResult = {
  success: boolean;
  error?: DeliveryError;
  latencyMs: number;
};

export type DeliveryRetryOptions = {
  /** Maximum number of attempts (including initial). Default: 3. */
  maxAttempts?: number;
  /** Base backoff delay (ms). Default: 1000. */
  baseDelayMs?: number;
  /** Backoff multiplier. Default: 3. */
  backoffMultiplier?: number;
  /** Maximum backoff delay (ms). Default: 30000. */
  maxDelayMs?: number;
};

export type RetryOutcome = {
  success: boolean;
  attempts: number;
  totalLatencyMs: number;
  lastError?: DeliveryError;
  retriedErrors: string[];
};

/** Error codes that should be retried. */
const RETRYABLE_CODES = new Set(["timeout", "network", "rate_limit", "server_error", "overloaded"]);

/** Error codes that should never be retried. */
const NON_RETRYABLE_CODES = new Set([
  "auth",
  "permission_denied",
  "invalid_content",
  "not_found",
  "blocked",
]);

export function isRetryable(error: DeliveryError): boolean {
  if (NON_RETRYABLE_CODES.has(error.code)) {
    return false;
  }
  if (RETRYABLE_CODES.has(error.code)) {
    return true;
  }
  // Unknown codes default to non-retryable (safe default).
  return false;
}

function computeDelay(
  attempt: number,
  baseDelayMs: number,
  backoffMultiplier: number,
  maxDelayMs: number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }
  const exponential = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
  // Add jitter: ±20%.
  const jitter = exponential * 0.2 * (Math.random() * 2 - 1);
  return Math.min(exponential + jitter, maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_BACKOFF_MULTIPLIER = 3;
const DEFAULT_MAX_DELAY_MS = 30_000;

export async function executeWithRetry(
  fn: RetryableDeliveryFn,
  options?: DeliveryRetryOptions,
): Promise<RetryOutcome> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const backoffMultiplier = options?.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let totalLatencyMs = 0;
  let lastError: DeliveryError | undefined;
  const retriedErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await fn();
    totalLatencyMs += result.latencyMs;

    if (result.success) {
      if (attempt > 1) {
        log.info("delivery succeeded after retry", { attempt, totalLatencyMs });
      }
      return {
        success: true,
        attempts: attempt,
        totalLatencyMs,
        retriedErrors,
      };
    }

    lastError = result.error;

    if (!result.error || !isRetryable(result.error)) {
      log.debug("delivery failed with non-retryable error", {
        attempt,
        code: result.error?.code,
      });
      return {
        success: false,
        attempts: attempt,
        totalLatencyMs,
        lastError,
        retriedErrors,
      };
    }

    retriedErrors.push(result.error.code);

    if (attempt < maxAttempts) {
      const delay = computeDelay(
        attempt,
        baseDelayMs,
        backoffMultiplier,
        maxDelayMs,
        result.error.retryAfterMs,
      );
      log.debug("retrying delivery", {
        attempt,
        nextAttempt: attempt + 1,
        delayMs: Math.round(delay),
        errorCode: result.error.code,
      });
      await sleep(delay);
    }
  }

  return {
    success: false,
    attempts: maxAttempts,
    totalLatencyMs,
    lastError,
    retriedErrors,
  };
}
