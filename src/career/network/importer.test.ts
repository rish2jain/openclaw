import { describe, it, expect } from "vitest";
import { parseConnectionsCsv } from "./importer.js";

// ── Tests ────────────────────────────────────────────────────────────

describe("parseConnectionsCsv", () => {
  describe("basic parsing", () => {
    it("returns empty for empty string", () => {
      expect(parseConnectionsCsv("")).toEqual([]);
    });

    it("returns empty for header-only CSV", () => {
      expect(
        parseConnectionsCsv("First Name,Last Name,Email Address,Company,Position,Connected On"),
      ).toEqual([]);
    });

    it("returns empty when required columns are missing", () => {
      const csv = "Email,Company\njohn@example.com,Acme";
      expect(parseConnectionsCsv(csv)).toEqual([]);
    });

    it("parses a standard LinkedIn connections CSV", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position,Connected On",
        "John,Doe,john@example.com,Google,Software Engineer,15 Jan 2024",
      ].join("\n");

      const result = parseConnectionsCsv(csv);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("John Doe");
      expect(result[0].company).toBe("Google");
      expect(result[0].title).toBe("Software Engineer");
      expect(result[0].email).toBe("john@example.com");
    });

    it("generates stable deterministic IDs", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position",
        "John,Doe,john@example.com,Google,Engineer",
      ].join("\n");

      const result1 = parseConnectionsCsv(csv);
      const result2 = parseConnectionsCsv(csv);
      expect(result1[0].id).toBe(result2[0].id);
    });

    it("generates IDs with ln_ prefix", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position",
        "John,Doe,john@example.com,Google,Engineer",
      ].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].id).toMatch(/^ln_[0-9a-f]{8}$/);
    });

    it("generates different IDs for different people", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position",
        "John,Doe,john@example.com,Google,Engineer",
        "Jane,Smith,jane@example.com,Meta,Designer",
      ].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].id).not.toBe(result[1].id);
    });
  });

  describe("field handling", () => {
    it("handles quoted values with commas", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position",
        'John,Doe,john@example.com,"Acme, Inc.",Software Engineer',
      ].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].company).toBe("Acme, Inc.");
    });

    it("handles escaped double-quotes in quoted fields", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position",
        'John,Doe,john@example.com,"Acme ""The Best"" Corp",Engineer',
      ].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].company).toBe('Acme "The Best" Corp');
    });

    it("trims whitespace from fields", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position",
        "  John  ,  Doe  , john@example.com , Google , Engineer ",
      ].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].name).toBe("John Doe");
      expect(result[0].company).toBe("Google");
      expect(result[0].email).toBe("john@example.com");
    });

    it("handles Windows-style line endings (CRLF)", () => {
      const csv = "First Name,Last Name,Company\r\nJohn,Doe,Google\r\nJane,Smith,Meta";
      const result = parseConnectionsCsv(csv);
      expect(result).toHaveLength(2);
    });
  });

  describe("missing/optional fields", () => {
    it("skips rows where both first and last name are empty", () => {
      const csv = ["First Name,Last Name,Company", ",,Google", "John,,Acme"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("John");
    });

    it("handles first-name-only entries", () => {
      const csv = ["First Name,Last Name,Company", "John,,Google"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].name).toBe("John");
    });

    it("handles last-name-only entries", () => {
      const csv = ["First Name,Last Name,Company", ",Doe,Google"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].name).toBe("Doe");
    });

    it("omits company when not present", () => {
      const csv = ["First Name,Last Name", "John,Doe"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].company).toBeUndefined();
    });

    it("omits title when not present", () => {
      const csv = ["First Name,Last Name", "John,Doe"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].title).toBeUndefined();
    });

    it("omits email when not present", () => {
      const csv = ["First Name,Last Name", "John,Doe"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].email).toBeUndefined();
    });

    it("handles missing optional columns gracefully", () => {
      const csv = ["First Name,Last Name", "John,Doe", "Jane,Smith"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result).toHaveLength(2);
    });
  });

  describe("date parsing", () => {
    it("parses valid Connected On date to timestamp", () => {
      const csv = ["First Name,Last Name,Connected On", "John,Doe,15 Jan 2024"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].addedAt).toBeGreaterThan(0);
    });
  });

  describe("multiple rows", () => {
    it("parses multiple rows correctly", () => {
      const csv = [
        "First Name,Last Name,Email Address,Company,Position,Connected On",
        "Alice,Anderson,alice@example.com,Google,Engineer,1 Jan 2024",
        "Bob,Brown,bob@example.com,Meta,Designer,15 Feb 2024",
        "Carol,Chen,carol@example.com,Apple,Manager,1 Mar 2024",
      ].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Alice Anderson");
      expect(result[1].name).toBe("Bob Brown");
      expect(result[2].name).toBe("Carol Chen");
    });

    it("initializes tags as empty array", () => {
      const csv = ["First Name,Last Name", "John,Doe"].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result[0].tags).toEqual([]);
    });

    it("handles case-insensitive header matching", () => {
      const csv = [
        "FIRST NAME,LAST NAME,EMAIL ADDRESS,COMPANY",
        "John,Doe,john@example.com,Google",
      ].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("John Doe");
    });
  });

  describe("blank/empty lines", () => {
    it("skips blank lines", () => {
      const csv = ["First Name,Last Name", "John,Doe", "", "Jane,Smith", ""].join("\n");
      const result = parseConnectionsCsv(csv);
      expect(result).toHaveLength(2);
    });
  });
});
