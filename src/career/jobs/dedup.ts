/**
 * Cross-source job listing deduplication.
 * Merges duplicates found across different job sources.
 */

import type { JobListing } from "./types.js";

/** Suffixes to strip when normalizing company names. */
const COMPANY_SUFFIXES = [
  "inc",
  "inc.",
  "llc",
  "ltd",
  "ltd.",
  "corp",
  "corp.",
  "corporation",
  "co",
  "co.",
  "company",
  "limited",
  "gmbh",
  "ag",
  "sa",
  "plc",
  "lp",
  "llp",
];

/** Common title variations that should be treated as equivalent. */
const TITLE_NORMALIZATIONS: [RegExp, string][] = [
  [/\bsr\.?\b/gi, "senior"],
  [/\bjr\.?\b/gi, "junior"],
  [/\beng\.?\b/gi, "engineer"],
  [/\bswe\b/gi, "software engineer"],
  [/\bsde\b/gi, "software development engineer"],
  [/\bfe\b/gi, "frontend"],
  [/\bbe\b/gi, "backend"],
  [/\bfs\b/gi, "fullstack"],
  [/\bfull[\s-]?stack\b/gi, "fullstack"],
  [/\bfront[\s-]?end\b/gi, "frontend"],
  [/\bback[\s-]?end\b/gi, "backend"],
  [/\s*[–—-]\s*/g, " "],
  [/\s*[,/]\s*/g, " "],
  [/\s{2,}/g, " "],
];

/** Normalize a company name for dedup comparison. */
export function normalizeCompanyName(name: string): string {
  let normalized = name.toLowerCase().trim();

  // Remove common suffixes.
  for (const suffix of COMPANY_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix.replace(".", "\\.")}\\s*$`, "i");
    normalized = normalized.replace(pattern, "").trim();
  }

  // Remove trailing punctuation.
  normalized = normalized.replace(/[.,;:]+$/, "").trim();

  return normalized;
}

/** Normalize a job title for dedup comparison. */
export function normalizeTitle(title: string): string {
  let normalized = title.toLowerCase().trim();

  for (const [pattern, replacement] of TITLE_NORMALIZATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Remove parenthetical content like (Remote) or (NYC).
  normalized = normalized.replace(/\([^)]*\)/g, "").trim();

  // Collapse whitespace.
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/** Check if two locations are similar enough to be the same. */
function locationsMatch(a: string, b: string): boolean {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  if (!normA || !normB) {
    return true;
  } // Missing location counts as match.
  if (normA === normB) {
    return true;
  }

  // Check if one contains the other (e.g. "San Francisco" vs "San Francisco, CA").
  if (normA.includes(normB) || normB.includes(normA)) {
    return true;
  }

  // Check city-level match (first part before comma).
  const cityA = normA.split(",")[0].trim();
  const cityB = normB.split(",")[0].trim();
  return cityA === cityB;
}

/** Pick the best listing from a group of duplicates. */
function pickBest(duplicates: JobListing[]): JobListing {
  // Sort by description length descending (most detail wins).
  const sorted = [...duplicates].toSorted((a, b) => b.description.length - a.description.length);

  const best = { ...sorted[0] };

  // Merge sources into a combined source string.
  const allSources = new Set<string>();
  for (const listing of duplicates) {
    allSources.add(listing.source);
  }
  if (allSources.size > 1) {
    best.source = Array.from(allSources).join("+");
  }

  // Merge requirements from all duplicates.
  const allReqs = new Set(best.requirements);
  for (const listing of duplicates) {
    for (const req of listing.requirements) {
      allReqs.add(req);
    }
  }
  best.requirements = Array.from(allReqs);

  // Keep the highest relevance score.
  best.relevanceScore = Math.max(...duplicates.map((d) => d.relevanceScore));

  // Keep the earliest posted date if available.
  const dates = duplicates
    .map((d) => d.postedDate)
    .filter((d): d is string => !!d)
    .toSorted();
  if (dates.length > 0) {
    best.postedDate = dates[0];
  }

  return best;
}

/** Generate a dedup key from a listing. */
function dedupKey(listing: JobListing): string {
  const company = normalizeCompanyName(listing.company);
  const title = normalizeTitle(listing.title);
  return `${company}::${title}`;
}

/**
 * Deduplicate job listings across sources.
 * Groups by normalized company + title + location similarity,
 * keeps the most detailed listing, and merges metadata.
 */
export function deduplicateListings(listings: JobListing[]): JobListing[] {
  // First pass: group by company + title key.
  const groups = new Map<string, JobListing[]>();

  for (const listing of listings) {
    const key = dedupKey(listing);
    const existing = groups.get(key);
    if (existing) {
      existing.push(listing);
    } else {
      groups.set(key, [listing]);
    }
  }

  // Second pass: within each group, split by location similarity.
  const results: JobListing[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      results.push(group[0]);
      continue;
    }

    // Subgroup by location.
    const locationGroups: JobListing[][] = [];
    for (const listing of group) {
      let placed = false;
      for (const subGroup of locationGroups) {
        if (locationsMatch(listing.location, subGroup[0].location)) {
          subGroup.push(listing);
          placed = true;
          break;
        }
      }
      if (!placed) {
        locationGroups.push([listing]);
      }
    }

    for (const subGroup of locationGroups) {
      results.push(pickBest(subGroup));
    }
  }

  return results;
}
