/**
 * Job relevance scoring engine.
 * Scores job listings against a user profile using weighted factors.
 */

import type { CompanyIntel } from "../intel/types.js";
import type { Skill, WorkEntry, CareerPreferences } from "../profile/types.js";
import type { JobListing, ScoreWeights } from "./types.js";
import { DEFAULT_SCORE_WEIGHTS } from "./types.js";

type ScoringProfile = {
  skills: Skill[];
  workHistory: WorkEntry[];
  preferences: CareerPreferences;
  locationPreferences?: string[];
};

type ScoreResult = {
  score: number;
  breakdown: Record<string, number>;
};

export type JobScorer = {
  scoreJob(listing: JobListing, profile: ScoringProfile, companyIntel?: CompanyIntel): ScoreResult;
};

/** Seniority levels in ascending order. */
const SENIORITY_LEVELS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "lead",
  "manager",
  "director",
  "vp",
] as const;

/** Keywords that map to seniority levels. */
const SENIORITY_KEYWORDS: Record<string, string> = {
  intern: "intern",
  internship: "intern",
  junior: "junior",
  jr: "junior",
  "entry level": "junior",
  "entry-level": "junior",
  mid: "mid",
  "mid-level": "mid",
  "mid level": "mid",
  senior: "senior",
  sr: "senior",
  staff: "staff",
  principal: "principal",
  lead: "lead",
  "tech lead": "lead",
  manager: "manager",
  "engineering manager": "manager",
  director: "director",
  vp: "vp",
  "vice president": "vp",
};

/** Extract seniority level from a job title string. */
function extractSeniority(title: string): string | null {
  const lower = title.toLowerCase();
  // Check longer phrases first to avoid partial matches.
  const sortedKeys = Object.keys(SENIORITY_KEYWORDS).toSorted((a, b) => b.length - a.length);
  for (const keyword of sortedKeys) {
    if (lower.includes(keyword)) {
      return SENIORITY_KEYWORDS[keyword];
    }
  }
  return null;
}

/** Get numeric index of a seniority level (higher = more senior). */
function seniorityIndex(level: string): number {
  const idx = SENIORITY_LEVELS.indexOf(level as (typeof SENIORITY_LEVELS)[number]);
  return idx === -1 ? 3 : idx; // Default to "senior" if unknown.
}

/** Compute skills overlap score (0-100). */
function scoreSkillsOverlap(listing: JobListing, skills: Skill[]): number {
  if (listing.requirements.length === 0 || skills.length === 0) {
    return 50;
  }

  const normalizedReqs = listing.requirements.map((r) => r.toLowerCase());
  const descLower = listing.description.toLowerCase();

  let matchWeight = 0;
  let totalWeight = 0;

  for (const skill of skills) {
    const nameLC = skill.name.toLowerCase();
    const weight = skill.proficiency;
    totalWeight += weight;

    const inReqs = normalizedReqs.some((r) => r.includes(nameLC) || nameLC.includes(r));
    const inDesc = descLower.includes(nameLC);

    if (inReqs) {
      matchWeight += weight;
    } else if (inDesc) {
      matchWeight += weight * 0.5;
    }
  }

  if (totalWeight === 0) {
    return 50;
  }
  return Math.min(100, Math.round((matchWeight / totalWeight) * 100));
}

/** Compute seniority alignment score (0-100). */
function scoreSeniority(listing: JobListing, workHistory: WorkEntry[]): number {
  const jobLevel = extractSeniority(listing.title);
  if (!jobLevel) {
    return 50;
  } // Can't determine, give neutral score.

  // Find user's most recent title.
  if (workHistory.length === 0) {
    return 50;
  }

  const sorted = [...workHistory].toSorted((a, b) => {
    const dateA = a.endDate ?? "9999";
    const dateB = b.endDate ?? "9999";
    return dateB.localeCompare(dateA);
  });

  const userLevel = extractSeniority(sorted[0].title);
  if (!userLevel) {
    return 50;
  }

  const jobIdx = seniorityIndex(jobLevel);
  const userIdx = seniorityIndex(userLevel);
  const diff = Math.abs(jobIdx - userIdx);

  // Perfect match = 100, 1 level off = 80, 2 levels = 50, 3+ = 20.
  if (diff === 0) {
    return 100;
  }
  if (diff === 1) {
    return 80;
  }
  if (diff === 2) {
    return 50;
  }
  return 20;
}

/** Compute preference match score (0-100). */
function scorePreferences(
  listing: JobListing,
  preferences: CareerPreferences,
  locationPreferences: string[] = [],
): number {
  let points = 0;
  let factors = 0;

  // Location match (25 points).
  factors++;
  if (locationPreferences.length === 0) {
    points += 25;
  } else {
    const listingLoc = listing.location.toLowerCase();
    // Treat empty listing location as partial credit.
    if (!listingLoc) {
      points += 15;
    } else if (
      locationPreferences.some((loc) => {
        const prefLoc = loc.toLowerCase();
        return listingLoc.includes(prefLoc) || prefLoc.includes(listingLoc);
      })
    ) {
      points += 25;
    } else {
      // No match — minimal credit.
      points += 0;
    }
  }

  // Remote policy match (25 points).
  factors++;
  const policyMap: Record<string, string[]> = {
    remote: ["remote"],
    hybrid: ["hybrid", "remote"],
    onsite: ["onsite", "hybrid"],
    flexible: ["remote", "hybrid", "onsite"],
  };
  const acceptable = policyMap[preferences.workStyle] ?? ["remote", "hybrid", "onsite"];
  if (listing.remotePolicy === "unknown") {
    points += 15;
  } else if (acceptable.includes(listing.remotePolicy)) {
    points += 25;
  }

  // Company stage match (25 points).
  factors++;
  if (preferences.companyStage.length === 0) {
    points += 25;
  } else {
    // Without direct stage data on the listing, give partial credit.
    points += 15;
  }

  // Industry match (25 points).
  factors++;
  if (preferences.industries.length === 0) {
    points += 25;
  } else {
    const descLower = listing.description.toLowerCase();
    const matched = preferences.industries.some((ind) => descLower.includes(ind.toLowerCase()));
    points += matched ? 25 : 5;
  }

  return Math.round((points / (factors * 25)) * 100);
}

/** Compute company signals score (0-100). */
function scoreCompanySignals(companyIntel?: CompanyIntel): number {
  if (!companyIntel || companyIntel.recentSignals.length === 0) {
    return 50;
  }

  let signalScore = 50;

  for (const signal of companyIntel.recentSignals) {
    switch (signal.type) {
      case "funding":
        signalScore += 15;
        break;
      case "hiring_surge":
        signalScore += 20;
        break;
      case "acquisition":
        signalScore += 5;
        break;
      case "leadership_change":
        signalScore += 0;
        break;
      case "layoff":
        signalScore -= 20;
        break;
      case "news":
        signalScore += 5;
        break;
    }
  }

  return Math.max(0, Math.min(100, signalScore));
}

/** Create a job scoring engine with optional custom weights. */
export function createJobScorer(weights?: Partial<ScoreWeights>): JobScorer {
  const w: ScoreWeights = { ...DEFAULT_SCORE_WEIGHTS, ...weights };
  const totalWeight = w.skillsOverlap + w.seniorityAlignment + w.preferenceMatch + w.companySignals;

  function scoreJob(
    listing: JobListing,
    profile: ScoringProfile,
    companyIntel?: CompanyIntel,
  ): ScoreResult {
    const skills = scoreSkillsOverlap(listing, profile.skills);
    const seniority = scoreSeniority(listing, profile.workHistory);
    const preferences = scorePreferences(listing, profile.preferences, profile.locationPreferences);
    const signals = scoreCompanySignals(companyIntel);

    const breakdown: Record<string, number> = {
      skillsOverlap: skills,
      seniorityAlignment: seniority,
      preferenceMatch: preferences,
      companySignals: signals,
    };

    const score = Math.round(
      (skills * w.skillsOverlap +
        seniority * w.seniorityAlignment +
        preferences * w.preferenceMatch +
        signals * w.companySignals) /
        totalWeight,
    );

    return { score, breakdown };
  }

  return { scoreJob };
}
