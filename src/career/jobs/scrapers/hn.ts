/**
 * Hacker News "Who's Hiring" thread parser.
 * Extracts job listings from top-level comments in monthly HN hiring threads.
 */

import type { JobListing, RemotePolicy } from "../types.js";

/** Remote policy indicators found in HN posts. */
const REMOTE_INDICATORS: { pattern: RegExp; policy: RemotePolicy }[] = [
  { pattern: /\bfully\s+remote\b/i, policy: "remote" },
  { pattern: /\bremote\s+only\b/i, policy: "remote" },
  { pattern: /\b100%\s+remote\b/i, policy: "remote" },
  { pattern: /\bremote\s+ok\b/i, policy: "remote" },
  { pattern: /\bremote\s+friendly\b/i, policy: "remote" },
  { pattern: /\bremote\b/i, policy: "remote" },
  { pattern: /\bhybrid\b/i, policy: "hybrid" },
  { pattern: /\bon[\s-]?site\b/i, policy: "onsite" },
  { pattern: /\bin[\s-]?office\b/i, policy: "onsite" },
];

/** Generate a stable ID for an HN listing. */
function makeId(company: string, index: number): string {
  const slug = company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `hn-${slug}-${index}`;
}

/** Extract company name from the first line of a comment. */
function extractCompany(firstLine: string): string {
  // HN format is typically "Company Name | Role | Location | ..."
  const pipeSegments = firstLine.split("|").map((s) => s.trim());
  if (pipeSegments.length >= 2) {
    return stripHtml(pipeSegments[0]);
  }

  // Fallback: take first segment before any dash or parenthesis.
  const dashMatch = firstLine.match(/^([^–—-]+)/);
  if (dashMatch) {
    return stripHtml(dashMatch[1].trim());
  }

  return stripHtml(firstLine.substring(0, 80));
}

/** Extract location from pipe-separated header. */
function extractLocation(firstLine: string): string {
  const pipeSegments = firstLine.split("|").map((s) => s.trim());

  // Location is usually the 3rd segment in "Company | Role | Location".
  for (let i = 1; i < pipeSegments.length; i++) {
    const segment = stripHtml(pipeSegments[i]).trim();
    // Skip segments that look like roles/tech.
    if (looksLikeLocation(segment)) {
      return segment;
    }
  }

  return "";
}

/** Heuristic: does this text look like a location? */
function looksLikeLocation(text: string): boolean {
  const locationPatterns = [
    /\b(?:remote|hybrid|onsite|on-site)\b/i,
    /\b(?:US|USA|UK|EU|CA|NYC|SF|LA|SEA)\b/,
    /\b(?:San\s+Francisco|New\s+York|London|Berlin|Seattle|Austin|Boston)\b/i,
    /\b[A-Z]{2}\b/, // State abbreviations.
    /,\s*[A-Z]{2}\b/, // City, ST format.
  ];
  return locationPatterns.some((p) => p.test(text));
}

/** Detect remote policy from text content. */
function detectRemotePolicy(text: string): RemotePolicy {
  for (const { pattern, policy } of REMOTE_INDICATORS) {
    if (pattern.test(text)) {
      return policy;
    }
  }
  return "unknown";
}

/** Strip HTML tags from text. */
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

/** Extract top-level comment blocks from HN thread HTML. */
function extractTopLevelComments(html: string): string[] {
  const comments: string[] = [];

  // HN uses <tr class='athing comtr'> for comments, with indent level
  // indicated by spacer images. Top-level comments have indent=0.
  // Match comment text within <div class="comment"> blocks.
  const commentPattern =
    /<tr\s+class=['"]athing\s+comtr['"][^>]*>[\s\S]*?<td\s+class=['"]default['"]>([\s\S]*?)<\/td>\s*<\/tr>/gi;

  let match: RegExpExecArray | null;
  while ((match = commentPattern.exec(html)) !== null) {
    const block = match[1];

    // Check indent level — top-level has width=0 or no spacer.
    const indentMatch = block.match(/width=['"](\d+)['"]/);
    const indent = indentMatch ? parseInt(indentMatch[1], 10) : 0;

    if (indent === 0) {
      // Extract the comment body.
      const bodyMatch = block.match(/<div\s+class=['"]commtext[^"']*['"][^>]*>([\s\S]*?)<\/div>/i);
      if (bodyMatch) {
        comments.push(bodyMatch[1].trim());
      }
    }
  }

  // Fallback: if the pattern-based approach found nothing, try splitting
  // on common HN delimiters (for simplified/cached pages).
  if (comments.length === 0) {
    const simpleBlocks = html.split(/(?:<div class=['"]commtext[^"']*['"][^>]*>)/i);
    for (let i = 1; i < simpleBlocks.length; i++) {
      const endIdx = simpleBlocks[i].indexOf("</div>");
      if (endIdx !== -1) {
        comments.push(simpleBlocks[i].substring(0, endIdx).trim());
      }
    }
  }

  return comments;
}

/**
 * Parse an HN "Who's Hiring" thread HTML into job listings.
 * Each top-level comment is treated as a separate job posting.
 */
export function parseHNHiringThread(htmlContent: string): JobListing[] {
  const comments = extractTopLevelComments(htmlContent);
  const listings: JobListing[] = [];

  for (let i = 0; i < comments.length; i++) {
    const raw = comments[i];
    const text = stripHtml(raw);

    if (text.length < 30) {
      continue;
    } // Skip very short / meta comments.

    const lines = text.split(/\n/).filter((l) => l.trim().length > 0);
    const firstLine = lines[0] ?? text.substring(0, 120);

    const company = extractCompany(firstLine);
    if (!company || company.length < 2) {
      continue;
    }

    const location = extractLocation(firstLine);
    const remotePolicy = detectRemotePolicy(text);
    const description = lines.slice(1).join("\n").trim() || text;

    listings.push({
      id: makeId(company, i),
      title: extractTitleFromText(firstLine, company),
      company,
      location,
      remotePolicy,
      description,
      requirements: extractRequirements(text),
      sourceUrl: "",
      source: "hn_who_is_hiring",
      relevanceScore: 0,
      scoreBreakdown: {},
      status: "new",
      notes: [],
    });
  }

  return listings;
}

/** Extract a job title from the header line. */
function extractTitleFromText(header: string, company: string): string {
  const segments = header.split("|").map((s) => stripHtml(s.trim()));

  // Title is typically the second pipe segment.
  if (segments.length >= 2) {
    const candidate = segments[1].trim();
    if (candidate.length > 3 && candidate.toLowerCase() !== company.toLowerCase()) {
      return candidate;
    }
  }

  // Fallback: look for common role keywords.
  const rolePattern =
    /\b((?:senior|sr|junior|jr|lead|staff|principal)\s+)?(?:software|frontend|backend|fullstack|full[\s-]?stack|devops|data|ml|ai|mobile|ios|android|cloud|platform|infrastructure|site\s+reliability)\s*(?:engineer|developer|scientist|architect|manager)/i;
  const roleMatch = header.match(rolePattern);
  if (roleMatch) {
    return roleMatch[0].trim();
  }

  return segments.length > 1 ? segments[1].trim() : "Engineering Role";
}

/** Extract technology/skill requirements from description text. */
function extractRequirements(text: string): string[] {
  const techs = new Set<string>();

  // Match common technology names.
  const techPatterns = [
    /\b(?:TypeScript|JavaScript|Python|Rust|Go|Java|C\+\+|Ruby|Kotlin|Swift|Scala|Elixir|Haskell|Clojure|PHP|C#)\b/gi,
    /\b(?:React|Vue|Angular|Next\.?js|Svelte|Node\.?js|Express|Django|Flask|Rails|Spring|FastAPI)\b/gi,
    /\b(?:AWS|GCP|Azure|Docker|Kubernetes|Terraform|PostgreSQL|MySQL|MongoDB|Redis|Kafka|GraphQL|REST)\b/gi,
    /\b(?:Machine\s+Learning|Deep\s+Learning|NLP|Computer\s+Vision|LLM|RAG)\b/gi,
  ];

  for (const pattern of techPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      techs.add(match[0]);
    }
  }

  return Array.from(techs);
}
