/**
 * Per-channel circuit breaker to prevent hammering failing channels.
 *
 * States:
 * - CLOSED (normal): requests pass through
 * - OPEN (blocking): requests rejected immediately
 * - HALF_OPEN (probing): one test request allowed
 *
 * Transitions:
 * - CLOSED → OPEN: after N consecutive failures
 * - OPEN → HALF_OPEN: after cooldown period
 * - HALF_OPEN → CLOSED: on successful probe
 * - HALF_OPEN → OPEN: on failed probe (doubles cooldown)
 */
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("channels/reliability/circuit-breaker");

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerOptions = {
  /** Failures before opening circuit. Default: 5. */
  failureThreshold?: number;
  /** Initial cooldown before half-open probe (ms). Default: 10000. */
  initialCooldownMs?: number;
  /** Maximum cooldown after repeated failures (ms). Default: 300000 (5 min). */
  maxCooldownMs?: number;
  /** Cooldown multiplier on each failed probe. Default: 2. */
  cooldownMultiplier?: number;
};

type CircuitEntry = {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: number;
  lastStateChangeAt: number;
  currentCooldownMs: number;
  totalFailures: number;
  totalSuccesses: number;
  totalRejections: number;
  /** When half_open, true while the single allowed probe request is in flight. */
  probeInFlight: boolean;
};

export type CircuitBreakerMetrics = {
  key: string;
  state: CircuitState;
  consecutiveFailures: number;
  currentCooldownMs: number;
  totalFailures: number;
  totalSuccesses: number;
  totalRejections: number;
  lastStateChangeAt: number;
};

export type CircuitBreaker = {
  /** Check if a request should be allowed through. */
  canExecute: (key: string) => boolean;
  /** Record a successful execution. */
  recordSuccess: (key: string) => void;
  /** Record a failed execution. */
  recordFailure: (key: string) => void;
  /** Get current state of a circuit. */
  getState: (key: string) => CircuitState;
  /** Get metrics for a circuit. */
  getMetrics: (key: string) => CircuitBreakerMetrics | undefined;
  /** Get metrics for all circuits. */
  getAllMetrics: () => CircuitBreakerMetrics[];
  /** Force-reset a circuit to closed. */
  reset: (key: string) => void;
};

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_INITIAL_COOLDOWN_MS = 10_000;
const DEFAULT_MAX_COOLDOWN_MS = 300_000;
const DEFAULT_COOLDOWN_MULTIPLIER = 2;

export function createCircuitBreaker(options?: CircuitBreakerOptions): CircuitBreaker {
  const failureThreshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const initialCooldownMs = options?.initialCooldownMs ?? DEFAULT_INITIAL_COOLDOWN_MS;
  const maxCooldownMs = options?.maxCooldownMs ?? DEFAULT_MAX_COOLDOWN_MS;
  const cooldownMultiplier = options?.cooldownMultiplier ?? DEFAULT_COOLDOWN_MULTIPLIER;

  const circuits = new Map<string, CircuitEntry>();

  function getOrCreate(key: string): CircuitEntry {
    let entry = circuits.get(key);
    if (!entry) {
      const now = Date.now();
      entry = {
        state: "closed",
        consecutiveFailures: 0,
        lastFailureAt: 0,
        lastStateChangeAt: now,
        currentCooldownMs: initialCooldownMs,
        totalFailures: 0,
        totalSuccesses: 0,
        totalRejections: 0,
        probeInFlight: false,
      };
      circuits.set(key, entry);
    }
    return entry;
  }

  function transitionTo(entry: CircuitEntry, key: string, newState: CircuitState): void {
    const oldState = entry.state;
    entry.state = newState;
    entry.lastStateChangeAt = Date.now();
    log.info("circuit state change", { key, from: oldState, to: newState });
  }

  function canExecute(key: string): boolean {
    const entry = getOrCreate(key);
    const now = Date.now();

    switch (entry.state) {
      case "closed":
        return true;

      case "open": {
        const elapsed = now - entry.lastFailureAt;
        if (elapsed >= entry.currentCooldownMs) {
          transitionTo(entry, key, "half_open");
          entry.probeInFlight = true;
          return true;
        }
        entry.totalRejections += 1;
        return false;
      }

      case "half_open": {
        if (entry.probeInFlight) {
          entry.totalRejections += 1;
          return false;
        }
        entry.probeInFlight = true;
        return true;
      }
    }
  }

  function recordSuccess(key: string): void {
    const entry = getOrCreate(key);
    entry.totalSuccesses += 1;
    entry.consecutiveFailures = 0;

    if (entry.state === "half_open") {
      entry.probeInFlight = false;
      transitionTo(entry, key, "closed");
      entry.currentCooldownMs = initialCooldownMs;
    }
  }

  function recordFailure(key: string): void {
    const entry = getOrCreate(key);
    entry.totalFailures += 1;
    entry.consecutiveFailures += 1;
    entry.lastFailureAt = Date.now();

    if (entry.state === "half_open") {
      entry.probeInFlight = false;
      entry.currentCooldownMs = Math.min(
        entry.currentCooldownMs * cooldownMultiplier,
        maxCooldownMs,
      );
      transitionTo(entry, key, "open");
    } else if (entry.state === "closed" && entry.consecutiveFailures >= failureThreshold) {
      transitionTo(entry, key, "open");
    }
  }

  function getState(key: string): CircuitState {
    return getOrCreate(key).state;
  }

  function getMetrics(key: string): CircuitBreakerMetrics | undefined {
    const entry = circuits.get(key);
    if (!entry) {
      return undefined;
    }
    return {
      key,
      state: entry.state,
      consecutiveFailures: entry.consecutiveFailures,
      currentCooldownMs: entry.currentCooldownMs,
      totalFailures: entry.totalFailures,
      totalSuccesses: entry.totalSuccesses,
      totalRejections: entry.totalRejections,
      lastStateChangeAt: entry.lastStateChangeAt,
    };
  }

  function getAllMetrics(): CircuitBreakerMetrics[] {
    const results: CircuitBreakerMetrics[] = [];
    for (const [key, entry] of circuits) {
      results.push({
        key,
        state: entry.state,
        consecutiveFailures: entry.consecutiveFailures,
        currentCooldownMs: entry.currentCooldownMs,
        totalFailures: entry.totalFailures,
        totalSuccesses: entry.totalSuccesses,
        totalRejections: entry.totalRejections,
        lastStateChangeAt: entry.lastStateChangeAt,
      });
    }
    return results;
  }

  function reset(key: string): void {
    const entry = circuits.get(key);
    if (entry) {
      entry.consecutiveFailures = 0;
      entry.currentCooldownMs = initialCooldownMs;
      entry.probeInFlight = false;
      transitionTo(entry, key, "closed");
    }
  }

  return {
    canExecute,
    recordSuccess,
    recordFailure,
    getState,
    getMetrics,
    getAllMetrics,
    reset,
  };
}
