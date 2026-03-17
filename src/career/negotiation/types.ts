/**
 * Types for the salary negotiation and offer comparison capabilities.
 */

export type EquityType = "rsu" | "options" | "iso";

export type EquityPackage = {
  type: EquityType;
  amount: number;
  vestingYears: number;
};

export type CompensationPackage = {
  baseSalary: number;
  equity?: EquityPackage;
  signingBonus?: number;
  annualBonus?: { target: number; range?: [number, number] };
  benefits?: string[];
  otherComp?: Record<string, number>;
};

export type MarketBenchmark = {
  role: string;
  level: string;
  location: string;
  source: string;
  percentiles: { p25: number; p50: number; p75: number; p90: number };
  sampleSize?: number;
  /** ISO 8601 date string — use `new Date().toISOString()` when creating. */
  asOf: string;
};

export type NegotiationApproach = "collaborative" | "competitive" | "walk-away-ready";

export type CounterAsk = {
  component: string;
  currentValue: number;
  askValue: number;
  floor: number;
  justification: string;
  script: string;
};

export type CounterStrategy = {
  overallApproach: NegotiationApproach;
  asks: CounterAsk[];
  walkAwayPoint?: CompensationPackage;
  talkingPoints: string[];
};

export type NegotiationEventType =
  | "offer_received"
  | "counter_sent"
  | "counter_received"
  | "accepted"
  | "declined"
  | "note";

export type NegotiationEvent = {
  type: NegotiationEventType;
  /** ISO 8601 date string — use `new Date().toISOString()` when creating. */
  date: string;
  details: string;
  compensation?: CompensationPackage;
};

export type NegotiationContext = {
  offerId: string;
  baseOffer: CompensationPackage;
  marketData?: MarketBenchmark;
  counterStrategy?: CounterStrategy;
  history: NegotiationEvent[];
};

// ── Offer Comparison Types ────────────────────────────────────────────────

export type DimensionScores = {
  totalComp: number;
  equityUpside: number;
  workLifeBalance: number;
  growthPotential: number;
  cultureFit: number;
  stability: number;
  location: number;
};

export type DimensionWeights = DimensionScores;

export const DEFAULT_WEIGHTS: DimensionWeights = {
  totalComp: 0.25,
  equityUpside: 0.15,
  workLifeBalance: 0.15,
  growthPotential: 0.15,
  cultureFit: 0.1,
  stability: 0.1,
  location: 0.1,
};

export type ScoredOffer = {
  offerId: string;
  listing: { title: string; company: string; location: string; remotePolicy?: string };
  compensation: CompensationPackage;
  dimensions: DimensionScores;
  totalWeightedScore: number;
};

export type ComparisonVerdict = {
  recommended: string;
  reasoning: string;
  tradeoffs: string[];
  tiebreakers: string[];
};

export type OfferComparison = {
  offers: ScoredOffer[];
  weights: DimensionWeights;
  recommendation: ComparisonVerdict;
};

/** Normalize weights so they sum to 1.0. */
export function normalizeWeights(weights: Partial<DimensionWeights>): DimensionWeights {
  const merged = { ...DEFAULT_WEIGHTS, ...weights };
  const sum =
    merged.totalComp +
    merged.equityUpside +
    merged.workLifeBalance +
    merged.growthPotential +
    merged.cultureFit +
    merged.stability +
    merged.location;

  if (sum === 0) {
    return DEFAULT_WEIGHTS;
  }

  return {
    totalComp: merged.totalComp / sum,
    equityUpside: merged.equityUpside / sum,
    workLifeBalance: merged.workLifeBalance / sum,
    growthPotential: merged.growthPotential / sum,
    cultureFit: merged.cultureFit / sum,
    stability: merged.stability / sum,
    location: merged.location / sum,
  };
}
