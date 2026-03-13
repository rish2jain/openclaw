/**
 * Job listing and search type definitions.
 */

/** Remote work policy for a job listing. */
export type RemotePolicy = "remote" | "hybrid" | "onsite" | "unknown";

/** Application pipeline status. */
export type JobStatus =
  | "new"
  | "saved"
  | "applied"
  | "rejected"
  | "interviewing"
  | "offer"
  | "dismissed";

/** A single job listing with scoring and pipeline state. */
export type JobListing = {
  id: string;
  title: string;
  company: string;
  location: string;
  remotePolicy: RemotePolicy;
  description: string;
  requirements: string[];
  sourceUrl: string;
  source: string;
  postedDate?: string;
  relevanceScore: number;
  scoreBreakdown: Record<string, number>;
  status: JobStatus;
  appliedDate?: string;
  notes: string[];
};

/** A saved job search configuration for recurring scraping. */
export type JobSearch = {
  id: string;
  keywords: string[];
  locations: string[];
  filters: Record<string, string>;
  sources: string[];
  cronSchedule: string;
  enabled: boolean;
};

/** Weights for relevance scoring factors (should sum to 100). */
export type ScoreWeights = {
  skillsOverlap: number;
  seniorityAlignment: number;
  preferenceMatch: number;
  companySignals: number;
};

/** Default scoring weights. */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  skillsOverlap: 40,
  seniorityAlignment: 20,
  preferenceMatch: 25,
  companySignals: 15,
};
