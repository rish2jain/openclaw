import { describe, it, expect, vi } from "vitest";
import { createJobScraper, type JobScraperFn } from "./scraper.js";
import type { JobListing, JobSearch } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeSearch(overrides: Partial<JobSearch> = {}): JobSearch {
  return {
    id: "s1",
    keywords: ["typescript"],
    locations: ["remote"],
    filters: {},
    sources: [],
    cronSchedule: "",
    enabled: true,
    ...overrides,
  };
}

function makeListing(id: string, source: string): JobListing {
  return {
    id,
    title: "Engineer",
    company: "Acme",
    location: "Remote",
    remotePolicy: "remote",
    description: "Build things",
    requirements: [],
    sourceUrl: "",
    source,
    relevanceScore: 0,
    scoreBreakdown: {},
    status: "new",
    notes: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("createJobScraper", () => {
  describe("registerScraper / getSources", () => {
    it("starts with no sources", () => {
      const scraper = createJobScraper();
      expect(scraper.getSources()).toEqual([]);
    });

    it("registers and returns sources (lowercased)", () => {
      const scraper = createJobScraper();
      scraper.registerScraper("HN", vi.fn());
      scraper.registerScraper("LinkedIn", vi.fn());

      expect(scraper.getSources()).toEqual(["hn", "linkedin"]);
    });

    it("overwrites scraper with same source name", () => {
      const scraper = createJobScraper();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      scraper.registerScraper("hn", fn1);
      scraper.registerScraper("hn", fn2);

      expect(scraper.getSources()).toEqual(["hn"]);
    });
  });

  describe("runSearch", () => {
    it("runs all registered scrapers when search.sources is empty", async () => {
      const scraper = createJobScraper();
      const hnFn: JobScraperFn = vi.fn().mockResolvedValue([makeListing("1", "hn")]);
      const liFn: JobScraperFn = vi.fn().mockResolvedValue([makeListing("2", "li")]);

      scraper.registerScraper("hn", hnFn);
      scraper.registerScraper("linkedin", liFn);

      const results = await scraper.runSearch(makeSearch({ sources: [] }));
      expect(hnFn).toHaveBeenCalled();
      expect(liFn).toHaveBeenCalled();
      expect(results).toHaveLength(2);
    });

    it("runs only specified sources when search.sources is set", async () => {
      const scraper = createJobScraper();
      const hnFn: JobScraperFn = vi.fn().mockResolvedValue([makeListing("1", "hn")]);
      const liFn: JobScraperFn = vi.fn().mockResolvedValue([]);

      scraper.registerScraper("hn", hnFn);
      scraper.registerScraper("linkedin", liFn);

      const _results = await scraper.runSearch(makeSearch({ sources: ["HN"] }));
      expect(hnFn).toHaveBeenCalled();
      expect(liFn).not.toHaveBeenCalled();
    });

    it("skips unknown source names without error", async () => {
      const scraper = createJobScraper();
      scraper.registerScraper("hn", vi.fn().mockResolvedValue([]));

      const results = await scraper.runSearch(makeSearch({ sources: ["nonexistent"] }));
      expect(results).toEqual([]);
    });

    it("flattens results from multiple scrapers", async () => {
      const scraper = createJobScraper();
      scraper.registerScraper(
        "a",
        vi.fn().mockResolvedValue([makeListing("1", "a"), makeListing("2", "a")]),
      );
      scraper.registerScraper("b", vi.fn().mockResolvedValue([makeListing("3", "b")]));

      const results = await scraper.runSearch(makeSearch());
      expect(results).toHaveLength(3);
    });

    it("catches scraper errors and returns empty for that scraper", async () => {
      const scraper = createJobScraper();
      const errorFn: JobScraperFn = vi.fn().mockRejectedValue(new Error("Network error"));
      const okFn: JobScraperFn = vi.fn().mockResolvedValue([makeListing("1", "ok")]);

      scraper.registerScraper("broken", errorFn);
      scraper.registerScraper("ok", okFn);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const results = await scraper.runSearch(makeSearch());

      expect(results).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("broken"));
      consoleSpy.mockRestore();
    });

    it("runs scrapers concurrently", async () => {
      const scraper = createJobScraper();
      const order: string[] = [];

      const slowFn: JobScraperFn = vi.fn().mockImplementation(async () => {
        order.push("slow-start");
        await new Promise((r) => setTimeout(r, 50));
        order.push("slow-end");
        return [];
      });
      const fastFn: JobScraperFn = vi.fn().mockImplementation(async () => {
        order.push("fast-start");
        order.push("fast-end");
        return [];
      });

      scraper.registerScraper("slow", slowFn);
      scraper.registerScraper("fast", fastFn);

      await scraper.runSearch(makeSearch());
      // Both should start before slow finishes
      expect(order.indexOf("fast-start")).toBeLessThan(order.indexOf("slow-end"));
    });

    it("returns empty array when no scrapers registered", async () => {
      const scraper = createJobScraper();
      const results = await scraper.runSearch(makeSearch());
      expect(results).toEqual([]);
    });
  });
});
