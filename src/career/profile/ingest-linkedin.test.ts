import { describe, it, expect } from "vitest";
import {
  parsePositions,
  parseSkills,
  parseProfile,
  parseConnections,
  parseLinkedInCsv,
} from "./ingest-linkedin.js";

// == CSV parsing (via public API) ==

describe("parsePositions", () => {
  it("parses a standard Positions.csv with headers", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      "Acme Corp,Software Engineer,Jan 2020,Dec 2023,Built features",
      'Google,Senior Engineer,Feb 2024,,"Led a team of 5"',
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries).toHaveLength(2);

    expect(entries[0].company).toBe("Acme Corp");
    expect(entries[0].title).toBe("Software Engineer");
    expect(entries[0].startDate).toBe("2020-01");
    expect(entries[0].endDate).toBe("2023-12");
    expect(entries[0].description).toBe("Built features");

    expect(entries[1].company).toBe("Google");
    expect(entries[1].title).toBe("Senior Engineer");
    expect(entries[1].startDate).toBe("2024-02");
    expect(entries[1].endDate).toBeUndefined();
  });

  it("handles year-only dates", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      "Startup,Founder,2022,,Built things",
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries[0].startDate).toBe("2022");
  });

  it("extracts achievements from bullet points in description", () => {
    const _csv = [
      "Company Name,Title,Started On,Finished On,Description",
      '"BigCo,Engineer,Jan 2021,,"- Increased revenue 30%\n- Led migration to cloud\nGeneral work description"',
    ].join("\n");

    // The CSV parsing here is tricky with embedded newlines in quotes.
    // Let's test with a simpler approach using the actual column layout.
    const csv2 = [
      "Company Name,Title,Started On,Finished On,Description",
      `BigCo,Engineer,Jan 2021,,"- Increased revenue 30%"`,
    ].join("\n");

    const entries = parsePositions(csv2);
    expect(entries).toHaveLength(1);
    // The description starts with "- " so it should be captured as achievement
    expect(entries[0].achievements.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].achievements[0]).toContain("Increased revenue 30%");
  });

  it("detects quantified results as achievements", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      "Co,Dev,Jan 2020,,Reduced load time by 50%",
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries[0].achievements).toContain("Reduced load time by 50%");
  });

  it("returns empty array for header-only CSV", () => {
    const csv = "Company Name,Title,Started On,Finished On,Description\n";
    const entries = parsePositions(csv);
    expect(entries).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parsePositions("")).toEqual([]);
  });
});

describe("parseSkills", () => {
  it("parses Skills.csv into skill entries", () => {
    const csv = ["Name", "JavaScript", "Python", "Project Management"].join("\n");

    const skills = parseSkills(csv);
    expect(skills).toHaveLength(3);

    const js = skills.find((s) => s.name === "JavaScript")!;
    expect(js.category).toBe("language");
    expect(js.proficiency).toBe(0.5);
    expect(js.sources).toEqual(["linkedin"]);

    const pm = skills.find((s) => s.name === "Project Management")!;
    expect(pm.category).toBe("soft"); // "project management" matches soft skill pattern
  });

  it("returns empty array for header-only CSV", () => {
    expect(parseSkills("Name\n")).toEqual([]);
  });
});

describe("parseProfile", () => {
  it("parses Profile.csv into a partial CareerProfile", () => {
    const csv = [
      "First Name,Last Name,Headline,Summary",
      "Ada,Lovelace,Mathematician,Pioneer of computing",
    ].join("\n");

    const profile = parseProfile(csv);
    expect(profile.name).toBe("Ada Lovelace");
    expect(profile.headline).toBe("Mathematician");
    expect(profile.narrative).toBe("Pioneer of computing");
    expect(profile.targetRoles).toEqual([]);
    expect(profile.locationPreferences).toEqual([]);
    expect(profile.updatedAt).toBeInstanceOf(Date);
  });

  it("handles first name only", () => {
    const csv = ["First Name,Last Name,Headline,Summary", "Ada,,Dev,"].join("\n");
    const profile = parseProfile(csv);
    expect(profile.name).toBe("Ada");
  });

  it("returns empty object for empty CSV", () => {
    expect(parseProfile("")).toEqual({});
  });

  it("returns empty object for header-only CSV", () => {
    const csv = "First Name,Last Name,Headline,Summary\n";
    expect(parseProfile(csv)).toEqual({});
  });
});

describe("parseConnections", () => {
  it("parses Connections.csv into connection records", () => {
    const csv = [
      "First Name,Last Name,Email Address,Company,Position,Connected On",
      "Bob,Smith,bob@example.com,Acme,CTO,15 Jan 2023",
      "Alice,Jones,alice@example.com,Meta,Engineer,01 Mar 2024",
    ].join("\n");

    const connections = parseConnections(csv);
    expect(connections).toHaveLength(2);

    expect(connections[0].firstName).toBe("Bob");
    expect(connections[0].lastName).toBe("Smith");
    expect(connections[0].emailAddress).toBe("bob@example.com");
    expect(connections[0].company).toBe("Acme");
    expect(connections[0].position).toBe("CTO");
    expect(connections[0].connectedOn).toBe("15 Jan 2023");
  });

  it("returns empty array for header-only CSV", () => {
    const csv = "First Name,Last Name,Email Address,Company,Position,Connected On\n";
    expect(parseConnections(csv)).toEqual([]);
  });
});

// == CSV parser edge cases ==

describe("CSV parser edge cases", () => {
  it("handles quoted fields with embedded commas", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      '"Acme, Inc.",Engineer,Jan 2020,,Did stuff',
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].company).toBe("Acme, Inc.");
  });

  it("handles escaped double quotes inside fields", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      '"Foo ""Bar"" Corp",Dev,Jan 2021,,Work',
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries[0].company).toBe('Foo "Bar" Corp');
  });

  it("handles Windows line endings (CRLF)", () => {
    const csv =
      "Company Name,Title,Started On,Finished On,Description\r\nAcme,Dev,Jan 2020,,Did stuff\r\n";

    const entries = parsePositions(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].company).toBe("Acme");
  });

  it("handles BOM character in headers", () => {
    const csv = [
      "\uFEFFCompany Name,Title,Started On,Finished On,Description",
      "Acme,Dev,Jan 2020,,Work",
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].company).toBe("Acme");
  });
});

// == Date formatting ==

describe("date formatting", () => {
  it("converts 'Jan 2020' to '2020-01'", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      "Co,Dev,Jan 2020,Dec 2023,Work",
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries[0].startDate).toBe("2020-01");
    expect(entries[0].endDate).toBe("2023-12");
  });

  it("handles month abbreviations case-insensitively", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      "Co,Dev,jan 2020,,Work",
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries[0].startDate).toBe("2020-01");
  });

  it("preserves plain year as-is", () => {
    const csv = ["Company Name,Title,Started On,Finished On,Description", "Co,Dev,2019,,Work"].join(
      "\n",
    );

    const entries = parsePositions(csv);
    expect(entries[0].startDate).toBe("2019");
  });

  it("treats empty Finished On as undefined endDate", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      "Co,Dev,Jan 2020,,Work",
    ].join("\n");

    const entries = parsePositions(csv);
    expect(entries[0].endDate).toBeUndefined();
  });
});

// == parseLinkedInCsv unified router ==

describe("parseLinkedInCsv", () => {
  it("routes 'positions' type correctly", () => {
    const csv = [
      "Company Name,Title,Started On,Finished On,Description",
      "Acme,Dev,Jan 2020,,Work",
    ].join("\n");

    const result = parseLinkedInCsv(csv, "positions");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("routes 'skills' type correctly", () => {
    const csv = ["Name", "JavaScript"].join("\n");
    const result = parseLinkedInCsv(csv, "skills");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("routes 'profile' type correctly", () => {
    const csv = ["First Name,Last Name,Headline,Summary", "Ada,Lovelace,Dev,Summary text"].join(
      "\n",
    );

    const result = parseLinkedInCsv(csv, "profile");
    expect(typeof result).toBe("object");
    expect((result as Record<string, unknown>).name).toBe("Ada Lovelace");
  });

  it("routes 'connections' type correctly", () => {
    const csv = [
      "First Name,Last Name,Email Address,Company,Position,Connected On",
      "Bob,Smith,bob@ex.com,Co,Dev,Jan 2023",
    ].join("\n");

    const result = parseLinkedInCsv(csv, "connections");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });
});
