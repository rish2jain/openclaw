/**
 * LinkedIn Connections CSV importer.
 *
 * Parses the standard LinkedIn "Connections.csv" export and produces
 * NetworkPerson records with stable, deterministic IDs.
 */

import type { NetworkPerson } from "./types.js";

// ── CSV field parser ──────────────────────────────────────────────────

/**
 * Parse a single CSV line into fields, handling quoted values with commas
 * and escaped double-quotes ("").
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote "" → literal "
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      current += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ── Stable ID generation ──────────────────────────────────────────────

/**
 * DJB2 hash turned into an 8-hex-char string, prefixed with `ln_`.
 */
function stableId(name: string, company: string): string {
  const input = `${name.toLowerCase()}::${company.toLowerCase()}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `ln_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

// ── Header resolution ─────────────────────────────────────────────────

const REQUIRED = ["first name", "last name"] as const;
const ALL_COLS = [
  "first name",
  "last name",
  "email address",
  "company",
  "position",
  "connected on",
] as const;

type ColMap = Record<(typeof ALL_COLS)[number], number>;

function resolveHeaders(fields: string[]): ColMap | null {
  const lower = fields.map((f) => f.toLowerCase().trim());
  const map: Partial<ColMap> = {};

  for (const col of ALL_COLS) {
    map[col] = lower.indexOf(col);
  }

  for (const req of REQUIRED) {
    if ((map[req] ?? -1) < 0) {
      return null;
    }
  }

  return map as ColMap;
}

// ── Date parsing ──────────────────────────────────────────────────────

function parseDate(raw: string): number {
  if (!raw) {
    return Date.now();
  }
  const ts = Date.parse(raw);
  return Number.isNaN(ts) ? Date.now() : ts;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Parse LinkedIn Connections CSV content into NetworkPerson[].
 *
 * Handles: "First Name,Last Name,Email Address,Company,Position,Connected On"
 * Tolerates missing optional columns and skips nameless rows.
 */
export function parseConnectionsCsv(csvContent: string): NetworkPerson[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const cols = resolveHeaders(parseCsvLine(lines[0]));
  if (!cols) {
    return [];
  }

  const persons: NetworkPerson[] = [];

  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);

    const firstName = (f[cols["first name"]] ?? "").trim();
    const lastName = (f[cols["last name"]] ?? "").trim();
    if (!firstName && !lastName) {
      continue;
    }

    const name = [firstName, lastName].filter(Boolean).join(" ");
    const company = cols.company >= 0 ? (f[cols.company] ?? "").trim() : "";
    const position = cols.position >= 0 ? (f[cols.position] ?? "").trim() : "";
    const email = cols["email address"] >= 0 ? (f[cols["email address"]] ?? "").trim() : "";
    const connOn = cols["connected on"] >= 0 ? (f[cols["connected on"]] ?? "").trim() : "";

    const person: NetworkPerson = {
      id: stableId(name, company),
      name,
      tags: [],
      addedAt: parseDate(connOn),
    };

    if (company) {
      person.company = company;
    }
    if (position) {
      person.title = position;
    }
    if (email) {
      person.email = email;
    }

    persons.push(person);
  }

  return persons;
}
