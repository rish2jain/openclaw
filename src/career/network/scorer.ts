/**
 * Relationship strength calculator.
 *
 * Produces a composite 0-1 score incorporating recency (exponential decay),
 * interaction frequency, depth (DM > group), shared organisational history,
 * and a manual boost.
 */

import type { NetworkPerson, InteractionRecord } from "./types.js";

// ── Constants ─────────────────────────────────────────────────────────

/** Half-life for exponential recency decay, in days. */
const RECENCY_HALF_LIFE = 180;

/** Weight of each scoring dimension (must sum to 1.0). */
const W = {
  recency: 0.3,
  frequency: 0.25,
  depth: 0.2,
  history: 0.15,
  boost: 0.1,
} as const;

/** Depth multipliers by interaction type (higher = stronger signal). */
const DEPTH: Record<string, number> = {
  dm: 0.9,
  meeting: 1.0,
  email: 0.7,
  group: 0.4,
};

/** Per-shared-org bonus. */
const ORG_BONUS = 0.1;

// ── Public types ──────────────────────────────────────────────────────

export type ConnectionScorer = {
  /**
   * Score a connection. All inputs provided per-call (scorer is stateless).
   *
   * @param person         The contact.
   * @param interactions   Logged interactions with this person.
   * @param sharedHistory  Names of shared companies/schools.
   * @param manualBoost    Optional user override (0-1, default 0).
   * @returns Composite score in [0, 1].
   */
  scoreConnection(
    person: NetworkPerson,
    interactions: InteractionRecord[],
    sharedHistory: string[],
    manualBoost?: number,
  ): number;
};

// ── Factory ───────────────────────────────────────────────────────────

export function createConnectionScorer(): ConnectionScorer {
  return {
    scoreConnection(
      _person: NetworkPerson,
      interactions: InteractionRecord[],
      sharedHistory: string[],
      manualBoost = 0,
    ): number {
      const now = Date.now();
      const recency = recencyScore(interactions, now);
      const freq = frequencyScore(interactions, now);
      const depth = depthScore(interactions);
      const history = Math.min(sharedHistory.length * ORG_BONUS, 1.0);
      const boost = clamp(manualBoost, 0, 1);

      const composite =
        W.recency * recency +
        W.frequency * freq +
        W.depth * depth +
        W.history * history +
        W.boost * boost;

      return clamp(composite, 0, 1);
    },
  };
}

// ── Standalone decay ──────────────────────────────────────────────────

/**
 * Exponential decay: `score * 2^(-days / halfLife)`.
 */
export function decayScore(currentScore: number, daysSinceInteraction: number): number {
  if (daysSinceInteraction <= 0) {
    return currentScore;
  }
  const factor = Math.pow(2, -daysSinceInteraction / RECENCY_HALF_LIFE);
  return clamp(currentScore * factor, 0, 1);
}

// ── Internal helpers ──────────────────────────────────────────────────

function recencyScore(interactions: InteractionRecord[], now: number): number {
  if (interactions.length === 0) {
    return 0;
  }

  let latest = 0;
  for (const r of interactions) {
    if (r.date > latest) {
      latest = r.date;
    }
  }
  const days = (now - latest) / 86_400_000;
  return decayScore(1.0, days);
}

/**
 * Normalised interaction count in the past year. 12+ → 1.0.
 */
function frequencyScore(interactions: InteractionRecord[], now: number): number {
  const yearAgo = now - 365 * 86_400_000;
  let count = 0;
  for (const r of interactions) {
    if (r.date >= yearAgo) {
      count++;
    }
  }
  return clamp(count / 12, 0, 1);
}

/**
 * Average depth of the most recent 20 interactions.
 */
function depthScore(interactions: InteractionRecord[]): number {
  if (interactions.length === 0) {
    return 0;
  }
  const sorted = [...interactions].toSorted((a, b) => b.date - a.date);
  const sample = sorted.slice(0, 20);
  let sum = 0;
  for (const r of sample) {
    sum += DEPTH[r.type] ?? 0.5;
  }
  return clamp(sum / sample.length, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
