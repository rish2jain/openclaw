/**
 * LinkedIn data export parser.
 * Handles CSV files from LinkedIn's "Download your data" feature.
 * Supports Positions.csv, Skills.csv, Profile.csv, and Connections.csv.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { inferSkillCategory } from "./infer-skill-category.js";
import type { CareerProfile, WorkEntry, Skill, LinkedInConnection } from "./types.js";

const log = createSubsystemLogger("career/profile/ingest-linkedin");

/**
 * Parse a CSV string into rows of key-value objects.
 * Handles quoted fields containing commas and newlines.
 */
function parseCsv(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        // Escaped quote inside quoted field
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field.trim());
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        current.push(field.trim());
        field = "";
        if (current.some((f) => f.length > 0)) {
          rows.push(current);
        }
        current = [];
        if (ch === "\r") {
          i++;
        }
      } else {
        field += ch;
      }
    }
  }
  // Flush the last field and row
  current.push(field.trim());
  if (current.some((f) => f.length > 0)) {
    rows.push(current);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, ""));
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i] ?? "";
    }
    return obj;
  });
}

/** Parse LinkedIn Positions.csv content into WorkEntry[]. */
export function parsePositions(csvContent: string): WorkEntry[] {
  const rows = parseCsv(csvContent);
  log.info(`Parsing ${rows.length} position rows`);

  return rows.map((row) => ({
    company: row["Company Name"] ?? row["company"] ?? "",
    title: row["Title"] ?? row["title"] ?? "",
    startDate: formatLinkedInDate(row["Started On"] ?? row["startedOn"] ?? ""),
    endDate:
      row["Finished On"] || row["finishedOn"]
        ? formatLinkedInDate(row["Finished On"] ?? row["finishedOn"] ?? "")
        : undefined,
    description: row["Description"] ?? row["description"] ?? "",
    skills: [],
    achievements: extractAchievements(row["Description"] ?? row["description"] ?? ""),
  }));
}

/** Parse LinkedIn Skills.csv content into Skill[]. */
export function parseSkills(csvContent: string): Skill[] {
  const rows = parseCsv(csvContent);
  log.info(`Parsing ${rows.length} skill rows`);

  return rows.map((row) => {
    const name = row["Name"] ?? row["name"] ?? "";
    return {
      name,
      category: inferSkillCategory(name),
      proficiency: 0.5, // LinkedIn doesn't export proficiency; default to mid
      sources: ["linkedin"],
    };
  });
}

/** Parse LinkedIn Profile.csv content into a partial CareerProfile. */
export function parseProfile(csvContent: string): Partial<CareerProfile> {
  const rows = parseCsv(csvContent);
  if (rows.length === 0) {
    log.warn("Empty Profile.csv");
    return {};
  }

  const row = rows[0];
  const firstName = row["First Name"] ?? row["firstName"] ?? "";
  const lastName = row["Last Name"] ?? row["lastName"] ?? "";
  const headline = row["Headline"] ?? row["headline"] ?? "";
  const summary = row["Summary"] ?? row["summary"] ?? "";

  return {
    name: [firstName, lastName].filter(Boolean).join(" "),
    headline,
    narrative: summary,
    targetRoles: [],
    locationPreferences: [],
    updatedAt: new Date(),
  };
}

/** Parse LinkedIn Connections.csv into raw connection records. */
export function parseConnections(csvContent: string): LinkedInConnection[] {
  const rows = parseCsv(csvContent);
  log.info(`Parsing ${rows.length} connection rows`);

  return rows.map((row) => ({
    firstName: row["First Name"] ?? row["firstName"] ?? "",
    lastName: row["Last Name"] ?? row["lastName"] ?? "",
    emailAddress: row["Email Address"] ?? row["emailAddress"] ?? "",
    company: row["Company"] ?? row["company"] ?? "",
    position: row["Position"] ?? row["position"] ?? "",
    connectedOn: row["Connected On"] ?? row["connectedOn"] ?? "",
  }));
}

/**
 * Unified parser that routes by CSV type.
 */
export function parseLinkedInCsv(
  csvContent: string,
  type: "positions" | "skills" | "profile" | "connections",
): WorkEntry[] | Skill[] | Partial<CareerProfile> | LinkedInConnection[] {
  switch (type) {
    case "positions":
      return parsePositions(csvContent);
    case "skills":
      return parseSkills(csvContent);
    case "profile":
      return parseProfile(csvContent);
    case "connections":
      return parseConnections(csvContent);
  }
}

/**
 * Convert a LinkedIn date string (e.g. "Jan 2020" or "2020") to ISO-ish format.
 */
function formatLinkedInDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  // "Jan 2020" format
  const monthYearMatch = trimmed.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i,
  );
  if (monthYearMatch) {
    const months: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const m = months[monthYearMatch[1].toLowerCase()];
    return `${monthYearMatch[2]}-${m}`;
  }

  // Plain year
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Extract achievement-like bullet points from a description.
 * Looks for lines starting with bullet characters or containing quantified results.
 */
function extractAchievements(description: string): string[] {
  if (!description) {
    return [];
  }

  const lines = description
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const achievements: string[] = [];

  for (const line of lines) {
    // Lines starting with bullet markers
    if (/^[-•*▪►]\s/.test(line)) {
      achievements.push(line.replace(/^[-•*▪►]\s*/, ""));
      continue;
    }
    // Lines containing quantified results (numbers + percent/dollar/x)
    if (/\d+[%$xX]|\d+\s*(percent|million|billion|thousand)/i.test(line)) {
      achievements.push(line);
    }
  }

  return achievements;
}
