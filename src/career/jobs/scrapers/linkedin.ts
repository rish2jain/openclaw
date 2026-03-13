/**
 * LinkedIn job results HTML parser.
 * Extracts job listings from LinkedIn search result pages.
 * Actual browser navigation/authentication is the caller's responsibility.
 */

import type { JobListing, RemotePolicy } from "../types.js";

/** Strip HTML tags and decode entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Detect remote policy from text. */
function detectRemotePolicy(text: string): RemotePolicy {
  const lower = text.toLowerCase();
  if (/\bremote\b/.test(lower)) {
    return "remote";
  }
  if (/\bhybrid\b/.test(lower)) {
    return "hybrid";
  }
  if (/\bon[\s-]?site\b/.test(lower)) {
    return "onsite";
  }
  return "unknown";
}

/** Generate a stable ID for a LinkedIn listing. */
function makeId(title: string, company: string, index: number): string {
  const slug = `${company}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
  return `li-${slug}-${index}`;
}

/**
 * LinkedIn job card patterns.
 * LinkedIn's markup varies, so we try several extraction strategies.
 */
const CARD_PATTERNS = [
  // data-entity-urn based cards (common in search results).
  /<div[^>]*data-entity-urn=["']urn:li:jobPosting:(\d+)["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi,
  // Job card list items.
  /<li[^>]*class=["'][^"']*job[^"']*card[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
  // Base card containers.
  /<div[^>]*class=["'][^"']*base-card[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi,
];

/** Extract a job URL from a card block. */
function extractJobUrl(cardHtml: string): string {
  // Look for links to job postings.
  const urlPatterns = [
    /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/[^"']+)["']/i,
    /href=["'](\/jobs\/view\/[^"']+)["']/i,
    /data-entity-urn=["']urn:li:jobPosting:(\d+)["']/i,
  ];

  for (const pattern of urlPatterns) {
    const match = cardHtml.match(pattern);
    if (match) {
      if (match[1].startsWith("/")) {
        return `https://www.linkedin.com${match[1]}`;
      }
      if (/^\d+$/.test(match[1])) {
        return `https://www.linkedin.com/jobs/view/${match[1]}`;
      }
      return match[1];
    }
  }

  return "";
}

/** Extract job title from a card block. */
function extractTitle(cardHtml: string): string {
  // Try specific LinkedIn class names.
  const titlePatterns = [
    /<(?:h3|a|span)[^>]*class=["'][^"']*(?:base-search-card__title|job-card-list__title|result-card__title)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h3|a|span)>/i,
    /<h3[^>]*>([\s\S]*?)<\/h3>/i,
    /<a[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
  ];

  for (const pattern of titlePatterns) {
    const match = cardHtml.match(pattern);
    if (match) {
      const title = stripHtml(match[1]);
      if (title.length > 2) {
        return title;
      }
    }
  }

  return "";
}

/** Extract company name from a card block. */
function extractCompany(cardHtml: string): string {
  const companyPatterns = [
    /<(?:h4|a|span)[^>]*class=["'][^"']*(?:base-search-card__subtitle|job-card-container__primary-description|result-card__subtitle)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h4|a|span)>/i,
    /<h4[^>]*>([\s\S]*?)<\/h4>/i,
    /<a[^>]*class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
  ];

  for (const pattern of companyPatterns) {
    const match = cardHtml.match(pattern);
    if (match) {
      const company = stripHtml(match[1]);
      if (company.length > 1) {
        return company;
      }
    }
  }

  return "";
}

/** Extract location from a card block. */
function extractLocation(cardHtml: string): string {
  const locationPatterns = [
    /<span[^>]*class=["'][^"']*(?:job-search-card__location|job-card-container__metadata-item|result-card__meta)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]*class=["'][^"']*location[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  ];

  for (const pattern of locationPatterns) {
    const match = cardHtml.match(pattern);
    if (match) {
      const location = stripHtml(match[1]);
      if (location.length > 1) {
        return location;
      }
    }
  }

  return "";
}

/** Extract description snippet from a card block. */
function extractDescription(cardHtml: string): string {
  const descPatterns = [
    /<p[^>]*class=["'][^"']*(?:job-card-container__description|job-result-card__snippet)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
    /<div[^>]*class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of descPatterns) {
    const match = cardHtml.match(pattern);
    if (match) {
      const desc = stripHtml(match[1]);
      if (desc.length > 10) {
        return desc;
      }
    }
  }

  return "";
}

/**
 * Parse LinkedIn job search results HTML into job listings.
 * Handles multiple LinkedIn markup variations.
 */
export function parseLinkedInJobResults(htmlContent: string): JobListing[] {
  const listings: JobListing[] = [];
  const seenUrls = new Set<string>();

  for (const pattern of CARD_PATTERNS) {
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(htmlContent)) !== null) {
      // The card content is in the last capture group.
      const cardHtml = match[match.length - 1];

      const title = extractTitle(cardHtml);
      if (!title) {
        continue;
      }

      const company = extractCompany(cardHtml);
      if (!company) {
        continue;
      }

      const jobUrl = extractJobUrl(cardHtml);
      if (jobUrl && seenUrls.has(jobUrl)) {
        continue;
      }
      if (jobUrl) {
        seenUrls.add(jobUrl);
      }

      const location = extractLocation(cardHtml);
      const description = extractDescription(cardHtml);
      const remotePolicy = detectRemotePolicy(`${location} ${title} ${description}`);

      listings.push({
        id: makeId(title, company, listings.length),
        title,
        company,
        location,
        remotePolicy,
        description,
        requirements: [],
        sourceUrl: jobUrl,
        source: "linkedin",
        relevanceScore: 0,
        scoreBreakdown: {},
        status: "new",
        notes: [],
      });
    }

    // If we found results with this pattern, no need to try others.
    if (listings.length > 0) {
      break;
    }
  }

  return listings;
}
