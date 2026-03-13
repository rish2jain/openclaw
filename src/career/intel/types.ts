/**
 * Company intelligence type definitions.
 */

/** Type of company signal event. */
export type SignalType =
  | "funding"
  | "layoff"
  | "hiring_surge"
  | "leadership_change"
  | "acquisition"
  | "news";

/** A single signal event about a company. */
export type CompanySignal = {
  type: SignalType;
  summary: string;
  date: string;
  sourceUrl?: string;
};

/** Aggregated intelligence about a company. */
export type CompanyIntel = {
  name: string;
  industry: string;
  stage: string;
  size?: number;
  recentSignals: CompanySignal[];
  careerPageUrl?: string;
  knownConnectionIds: string[];
};
