/**
 * Resume text parser.
 * Extracts structured career data from pre-extracted resume text.
 * Uses rule-based section detection and pattern matching.
 *
 * Expected LLM extraction format (for future integration):
 * {
 *   "workEntries": [{ "company": "...", "title": "...", "startDate": "YYYY-MM", ... }],
 *   "skills": [{ "name": "...", "category": "language|framework|domain|soft|tool", "proficiency": 0.5 }],
 *   "education": [{ "institution": "...", "degree": "...", "field": "..." }],
 *   "summary": "Brief professional summary"
 * }
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { inferSkillCategory } from "./infer-skill-category.js";
import type { WorkEntry, Skill, Education, ResumeParseResult } from "./types.js";

const log = createSubsystemLogger("career/profile/ingest-resume");

/** Heading patterns that identify resume sections. */
const SECTION_PATTERNS: Record<string, RegExp> = {
  summary: /^(summary|professional\s+summary|about(\s+me)?|objective|profile)\s*$/i,
  experience:
    /^(experience|work\s+experience|employment(\s+history)?|professional\s+experience|work\s+history)\s*$/i,
  education: /^(education|academic(\s+background)?|qualifications|degrees?)\s*$/i,
  skills:
    /^(skills|technical\s+skills|core\s+competencies|technologies|tech\s+stack|competencies|expertise)\s*$/i,
  projects: /^(projects|personal\s+projects|key\s+projects|selected\s+projects)\s*$/i,
};

/** Date patterns in resumes. */
const DATE_RANGE_PATTERN =
  /(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(\d{4})\s*[-–—to]+\s*(?:(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(\d{4}|[Pp]resent|[Cc]urrent)/;

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

type SectionMap = Record<string, string[]>;

/**
 * Parse pre-extracted resume text into structured career data.
 * PDF text extraction is the caller's responsibility.
 */
export async function parseResume(text: string): Promise<ResumeParseResult> {
  log.info(`Parsing resume text, ${text.length} characters`);

  const lines = text.split(/\n/).map((l) => l.trimEnd());
  const sections = identifySections(lines);

  const summary = extractSummary(sections);
  const workEntries = extractWorkEntries(sections);
  const skills = extractSkills(sections);
  const education = extractEducation(sections);

  log.info(
    `Extracted: ${workEntries.length} work entries, ${skills.length} skills, ${education.length} education entries`,
  );

  return { workEntries, skills, education, summary };
}

/**
 * Split resume text into named sections based on heading detection.
 */
function identifySections(lines: string[]): SectionMap {
  const sections: SectionMap = { preamble: [] };
  let currentSection = "preamble";

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headings: standalone lines that match known patterns
    const matchedSection = detectSectionHeading(trimmed);
    if (matchedSection) {
      currentSection = matchedSection;
      if (!sections[currentSection]) {
        sections[currentSection] = [];
      }
      continue;
    }

    if (!sections[currentSection]) {
      sections[currentSection] = [];
    }
    sections[currentSection].push(line);
  }

  return sections;
}

function detectSectionHeading(line: string): string | null {
  // Strip common decorators: underlines, colons, dashes, asterisks
  const cleaned = line
    .replace(/^[#*_=\-:]+\s*/, "")
    .replace(/\s*[#*_=\-:]+$/, "")
    .trim();

  if (!cleaned || cleaned.length > 60) {
    return null;
  }

  for (const [section, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(cleaned)) {
      return section;
    }
  }
  return null;
}

function extractSummary(sections: SectionMap): string {
  const summaryLines = sections["summary"] ?? sections["preamble"] ?? [];
  const text = summaryLines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  // Cap at a reasonable summary length
  if (text.length > 500) {
    return text.slice(0, 500).replace(/\s+\S*$/, "...");
  }
  return text;
}

function extractWorkEntries(sections: SectionMap): WorkEntry[] {
  const lines = sections["experience"] ?? [];
  if (lines.length === 0) {
    return [];
  }

  const entries: WorkEntry[] = [];
  let current: Partial<WorkEntry> | null = null;
  let descriptionLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Blank line may indicate a new entry boundary
      if (current && descriptionLines.length > 0) {
        flushWorkEntry(current, descriptionLines, entries);
        current = null;
        descriptionLines = [];
      }
      continue;
    }

    // Try to detect a date range — signals a new entry header
    const dateMatch = trimmed.match(DATE_RANGE_PATTERN);
    if (dateMatch) {
      // Flush previous entry
      if (current) {
        flushWorkEntry(current, descriptionLines, entries);
        descriptionLines = [];
      }

      const startDate = formatDate(dateMatch[1], dateMatch[2]);
      const endRaw = dateMatch[4];
      const endDate = /present|current/i.test(endRaw)
        ? undefined
        : formatDate(dateMatch[3], endRaw);

      // The text before the date range often contains title and company
      const beforeDate = trimmed.slice(0, trimmed.indexOf(dateMatch[0])).trim();
      const { title, company } = parseTitleCompany(beforeDate);

      current = { company, title, startDate, endDate, skills: [], achievements: [] };
      continue;
    }

    // If we don't have a current entry yet, try parsing as title/company line
    if (!current) {
      const { title, company } = parseTitleCompany(trimmed);
      if (title || company) {
        current = { company, title, startDate: "", skills: [], achievements: [] };
        continue;
      }
    }

    // Accumulate description lines
    if (current) {
      descriptionLines.push(trimmed);
    }
  }

  // Flush last entry
  if (current) {
    flushWorkEntry(current, descriptionLines, entries);
  }

  return entries;
}

function flushWorkEntry(
  partial: Partial<WorkEntry>,
  descLines: string[],
  entries: WorkEntry[],
): void {
  const description = descLines
    .filter((l) => !/^[-•*▪►]/.test(l.trim()))
    .join(" ")
    .trim();

  const achievements = descLines
    .filter((l) => /^[-•*▪►]\s/.test(l.trim()))
    .map((l) => l.trim().replace(/^[-•*▪►]\s*/, ""));

  entries.push({
    company: partial.company ?? "",
    title: partial.title ?? "",
    startDate: partial.startDate ?? "",
    endDate: partial.endDate,
    description,
    skills: partial.skills ?? [],
    achievements,
  });
}

/**
 * Attempt to parse "Title at Company" or "Title, Company" or "Title | Company" patterns.
 */
function parseTitleCompany(text: string): { title: string; company: string } {
  if (!text) {
    return { title: "", company: "" };
  }

  // "Title at Company" or "Title @ Company"
  const atMatch = text.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (atMatch) {
    return { title: atMatch[1].trim(), company: atMatch[2].trim() };
  }

  // "Title | Company" or "Title - Company" or "Title, Company"
  const sepMatch = text.match(/^(.+?)\s*[|–—,]\s*(.+)$/);
  if (sepMatch) {
    return { title: sepMatch[1].trim(), company: sepMatch[2].trim() };
  }

  // Single value — assume it's a title or company name
  return { title: text, company: "" };
}

function extractSkills(sections: SectionMap): Skill[] {
  const lines = sections["skills"] ?? [];
  if (lines.length === 0) {
    return [];
  }

  const skillNames = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Handle "Category: skill1, skill2, skill3" format
    const colonSplit = trimmed.match(/^[^:]+:\s*(.+)$/);
    const skillText = colonSplit ? colonSplit[1] : trimmed;

    // Split on common delimiters
    const parts = skillText.split(/[,;|•▪►]\s*/).map((s) => s.trim());
    for (const part of parts) {
      const cleaned = part.replace(/^[-*]\s*/, "").trim();
      if (cleaned && cleaned.length < 50) {
        skillNames.add(cleaned);
      }
    }
  }

  return [...skillNames].map((name) => ({
    name,
    category: inferSkillCategory(name),
    proficiency: 0.5, // Default; enricher can adjust later
    sources: ["resume"],
  }));
}

function extractEducation(sections: SectionMap): Education[] {
  const lines = sections["education"] ?? [];
  if (lines.length === 0) {
    return [];
  }

  const entries: Education[] = [];
  let current: Partial<Education> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) {
        entries.push(finalizeEducation(current));
        current = null;
      }
      continue;
    }

    // Detect degree patterns
    const degreeMatch = trimmed.match(
      /\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|Ph\.?D\.?|MBA|M\.?Eng\.?|B\.?Eng\.?|Bachelor|Master|Doctor|Associate)/i,
    );

    const dateMatch = trimmed.match(DATE_RANGE_PATTERN);

    if (degreeMatch && !current) {
      current = {};
    } else if (!current && !dateMatch) {
      // Could be an institution name starting a new entry
      current = { institution: trimmed };
      continue;
    }

    if (!current) {
      current = {};
    }

    if (dateMatch) {
      current.startDate = formatDate(dateMatch[1], dateMatch[2]);
      const endRaw = dateMatch[4];
      current.endDate = /present|current/i.test(endRaw)
        ? undefined
        : formatDate(dateMatch[3], endRaw);
    }

    if (degreeMatch) {
      // Try to extract "Degree in Field" or "Degree, Field"
      const afterDegree = trimmed.slice(trimmed.indexOf(degreeMatch[0]) + degreeMatch[0].length);
      const fieldMatch = afterDegree.match(/\s+(?:in|of)\s+(.+)/i) ?? afterDegree.match(/,\s*(.+)/);

      current.degree = degreeMatch[0].trim();
      if (fieldMatch) {
        current.field = fieldMatch[1].trim();
      }
    }

    // If the line looks like an institution (no degree keyword, not a date line)
    if (!degreeMatch && !dateMatch && !current.institution) {
      current.institution = trimmed;
    }
  }

  if (current) {
    entries.push(finalizeEducation(current));
  }

  return entries;
}

function finalizeEducation(partial: Partial<Education>): Education {
  return {
    institution: partial.institution ?? "",
    degree: partial.degree ?? "",
    field: partial.field ?? "",
    startDate: partial.startDate ?? "",
    endDate: partial.endDate,
  };
}

function formatDate(month: string | undefined, year: string): string {
  if (!year) {
    return "";
  }
  if (month) {
    const m = MONTH_MAP[month.toLowerCase()];
    if (m) {
      return `${year}-${m}`;
    }
  }
  return year;
}
