import { describe, expect, it } from "vitest";
import { extractEntitiesWithRegex } from "./entity-extractor.js";

describe("entity-extractor", () => {
  describe("extractEntitiesWithRegex", () => {
    it("extracts @mentions as person entities", () => {
      const result = extractEntitiesWithRegex("Talked to @alice and @bob about the plan");
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("alice");
      expect(names).toContain("bob");
      expect(result.entities.every((e) => e.type === "person")).toBe(true);
    });

    it("extracts #channels as channel entities", () => {
      const result = extractEntitiesWithRegex("Check #general and #dev-ops channels");
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("general");
      expect(names).toContain("dev-ops");
      expect(result.entities.every((e) => e.type === "channel")).toBe(true);
    });

    it("extracts quoted capitalized names as topics", () => {
      const result = extractEntitiesWithRegex('Working on "Memory System" for the release');
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("Memory System");
    });

    it("deduplicates entities", () => {
      const result = extractEntitiesWithRegex("@alice said @alice should review");
      const aliceEntities = result.entities.filter((e) => e.name === "alice");
      expect(aliceEntities).toHaveLength(1);
    });

    it("returns empty for plain text without patterns", () => {
      const result = extractEntitiesWithRegex("Just a regular sentence with no entities");
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it("handles empty input", () => {
      const result = extractEntitiesWithRegex("");
      expect(result.entities).toHaveLength(0);
    });
  });
});
