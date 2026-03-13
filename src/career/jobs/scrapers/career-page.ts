/**
 * Generic career page parser.
 * Best-effort extraction of job listings from arbitrary company career pages.
 */

import type { JobListing } from "../types.js";
import { detectRemotePolicy, stripHtml } from "./utils.js";

/** Resolve a potentially relative URL against a base URL. */
function resolveUrl(href: string, baseUrl: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  if (href.startsWith("//")) {
    return `https:${href}`;
  }
  if (href.startsWith("/")) {
    const origin = baseUrl.match(/^(https?:\/\/[^/]+)/)?.[1] ?? baseUrl;
    return `${origin}${href}`;
  }
  return `${baseUrl.replace(/\/?$/, "/")}${href}`;
}

/** Generate a stable ID for a career page listing. */
function makeId(company: string, title: string, index: number): string {
  const slug = `${company}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
  return `cp-${slug}-${index}`;
}

/** Common patterns for job listing links on career pages. */
const JOB_LINK_PATTERNS = [
  // Lever-style: /jobs/uuid or /apply/uuid
  /<a\s+[^>]*href=["']([^"']*(?:\/jobs\/|\/apply\/|\/positions\/|\/openings\/|\/careers\/|\/job\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
  // Generic links with role-like text
  /<a\s+[^>]*href=["']([^"']+)["'][^>]*>\s*([^<]{5,100})\s*<\/a>/gi,
];

/** Patterns that indicate a link text is likely a job title. */
const TITLE_INDICATORS = [
  /\b(?:engineer|developer|designer|manager|analyst|scientist|architect|director|lead|coordinator|specialist|consultant|associate|intern)\b/i,
  /\b(?:senior|junior|staff|principal|head\s+of|vp\s+of)\b/i,
  /\b(?:software|frontend|backend|fullstack|devops|data|product|marketing|sales|support|operations|finance|legal|hr|people)\b/i,
];

/** Extract location text near a job link. */
function extractNearbyLocation(html: string, linkEndIndex: number): string {
  // Look at the 300 chars after the link for location info.
  const window = html.substring(linkEndIndex, linkEndIndex + 300);
  const stripped = stripHtml(window);

  // Common location patterns.
  const locPatterns = [
    /\b((?:San\s+Francisco|New\s+York|Los\s+Angeles|Chicago|Seattle|Austin|Boston|Denver|Portland|Miami|London|Berlin|Toronto|Vancouver|Sydney|Singapore|Tokyo)[^,]*(?:,\s*[A-Z]{2})?)\b/i,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})\b/,
    /\b(Remote)\b/i,
  ];

  for (const pattern of locPatterns) {
    const match = stripped.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return "";
}

/** Extract department/category from surrounding context. */
function extractDepartment(html: string, linkStartIndex: number): string {
  // Look at the 500 chars before the link for a heading.
  const window = html.substring(Math.max(0, linkStartIndex - 500), linkStartIndex);

  // Find the last heading.
  const headingPattern = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let lastHeading = "";
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(window)) !== null) {
    lastHeading = stripHtml(match[1]);
  }

  return lastHeading;
}

/**
 * Parse a company career page HTML into job listings.
 * Uses heuristics to find job title links, locations, and departments.
 */
export function parseCareerPage(
  htmlContent: string,
  companyName: string,
  baseUrl: string,
): JobListing[] {
  const listings: JobListing[] = [];
  const seenUrls = new Set<string>();

  for (const pattern of JOB_LINK_PATTERNS) {
    // Reset lastIndex for each pattern.
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const href = match[1];
      const linkText = stripHtml(match[2]);

      // Skip non-job links.
      if (linkText.length < 5 || linkText.length > 150) {
        continue;
      }

      // Check if it looks like a job title.
      const isJobTitle = TITLE_INDICATORS.some((p) => p.test(linkText));
      const isJobUrl = /(?:\/jobs\/|\/apply\/|\/positions\/|\/openings\/|\/careers\/|\/job\/)/.test(
        href,
      );

      if (!isJobTitle && !isJobUrl) {
        continue;
      }

      const fullUrl = resolveUrl(href, baseUrl);
      if (seenUrls.has(fullUrl)) {
        continue;
      }
      seenUrls.add(fullUrl);

      const matchEnd = match.index + match[0].length;
      const location = extractNearbyLocation(htmlContent, matchEnd);
      const department = extractDepartment(htmlContent, match.index);
      const remotePolicy = detectRemotePolicy(linkText + " " + location);

      const description = department ? `Department: ${department}. ${linkText}` : linkText;

      listings.push({
        id: makeId(companyName, linkText, listings.length),
        title: linkText,
        company: companyName,
        location,
        remotePolicy,
        description,
        requirements: [],
        sourceUrl: fullUrl,
        source: "company_page",
        relevanceScore: 0,
        scoreBreakdown: {},
        status: "new",
        notes: [],
      });
    }
  }

  return listings;
}
