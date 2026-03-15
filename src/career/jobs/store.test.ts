import { describe, it, expect, vi } from "vitest";
import { createJobStore } from "./store.js";
import type { JobListing, JobSearch } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeListing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    title: "Software Engineer",
    company: "Acme Corp",
    location: "Remote",
    remotePolicy: "remote",
    description: "Build things.",
    requirements: ["typescript"],
    sourceUrl: "https://example.com",
    source: "test",
    relevanceScore: 75,
    scoreBreakdown: {},
    status: "new",
    notes: [],
    ...overrides,
  };
}

function makeSearch(overrides: Partial<JobSearch> = {}): JobSearch {
  return {
    id: `search-${Math.random().toString(36).slice(2, 8)}`,
    keywords: ["typescript"],
    locations: ["remote"],
    filters: {},
    sources: ["hn"],
    cronSchedule: "0 9 * * 1",
    enabled: true,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("createJobStore", () => {
  describe("addListing / getByStatus", () => {
    it("stores and retrieves listings by status", () => {
      const store = createJobStore();
      const a = makeListing({ id: "a", status: "new" });
      const b = makeListing({ id: "b", status: "applied" });
      store.addListing(a);
      store.addListing(b);

      expect(store.getByStatus("new")).toHaveLength(1);
      expect(store.getByStatus("applied")).toHaveLength(1);
      expect(store.getByStatus("rejected")).toHaveLength(0);
    });

    it("overwrites listing with same id", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "dup", relevanceScore: 50 }));
      store.addListing(makeListing({ id: "dup", relevanceScore: 90 }));

      const all = store.getByStatus("new");
      expect(all).toHaveLength(1);
      expect(all[0].relevanceScore).toBe(90);
    });
  });

  describe("updateStatus", () => {
    it("changes the status of an existing listing", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "x" }));
      store.updateStatus("x", "applied");

      expect(store.getByStatus("applied")).toHaveLength(1);
      expect(store.getByStatus("new")).toHaveLength(0);
    });

    it("sets appliedDate when status changes to 'applied'", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "x" }));

      vi.useFakeTimers();
      const now = new Date("2025-06-15T12:00:00Z");
      vi.setSystemTime(now);

      store.updateStatus("x", "applied");
      const applied = store.getByStatus("applied");
      expect(applied[0].appliedDate).toBeDefined();
      expect(applied[0].appliedDate).toContain("2025-06-15");

      vi.useRealTimers();
    });

    it("ignores non-existent listing id", () => {
      const store = createJobStore();
      // Should not throw
      store.updateStatus("nonexistent", "rejected");
      expect(store.getByStatus("rejected")).toHaveLength(0);
    });
  });

  describe("getByCompany", () => {
    it("matches case-insensitively", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "a", company: "Google" }));
      store.addListing(makeListing({ id: "b", company: "Meta" }));

      expect(store.getByCompany("google")).toHaveLength(1);
      expect(store.getByCompany("GOOGLE")).toHaveLength(1);
    });

    it("matches partial company names", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "a", company: "Google Inc" }));

      expect(store.getByCompany("google")).toHaveLength(1);
    });

    it("returns empty array when no match", () => {
      const store = createJobStore();
      store.addListing(makeListing({ company: "Google" }));
      expect(store.getByCompany("apple")).toHaveLength(0);
    });
  });

  describe("getHighMatches", () => {
    it("returns listings above the minimum score, sorted descending", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "a", relevanceScore: 90 }));
      store.addListing(makeListing({ id: "b", relevanceScore: 70 }));
      store.addListing(makeListing({ id: "c", relevanceScore: 40 }));

      const result = store.getHighMatches(60);
      expect(result).toHaveLength(2);
      expect(result[0].relevanceScore).toBe(90);
      expect(result[1].relevanceScore).toBe(70);
    });

    it("returns empty when nothing meets threshold", () => {
      const store = createJobStore();
      store.addListing(makeListing({ relevanceScore: 30 }));
      expect(store.getHighMatches(80)).toHaveLength(0);
    });

    it("includes exact boundary score", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "a", relevanceScore: 80 }));
      expect(store.getHighMatches(80)).toHaveLength(1);
    });
  });

  describe("getRecentListings", () => {
    it("returns listings posted within the given days window", () => {
      const store = createJobStore();
      const recent = new Date().toISOString();
      const old = "2020-01-01T00:00:00.000Z";

      store.addListing(makeListing({ id: "new", postedDate: recent }));
      store.addListing(makeListing({ id: "old", postedDate: old }));
      store.addListing(makeListing({ id: "nodate" })); // no postedDate

      const result = store.getRecentListings(7);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("new");
    });

    it("sorts by postedDate descending", () => {
      const store = createJobStore();
      const day1 = new Date();
      day1.setDate(day1.getDate() - 1);
      const day2 = new Date();

      store.addListing(makeListing({ id: "older", postedDate: day1.toISOString() }));
      store.addListing(makeListing({ id: "newer", postedDate: day2.toISOString() }));

      const result = store.getRecentListings(7);
      expect(result[0].id).toBe("newer");
    });

    it("returns empty when no listings have postedDate", () => {
      const store = createJobStore();
      store.addListing(makeListing());
      expect(store.getRecentListings(30)).toHaveLength(0);
    });
  });

  describe("getPipelineSummary", () => {
    it("returns zero-state for empty store", () => {
      const store = createJobStore();
      const summary = store.getPipelineSummary();
      expect(summary.total).toBe(0);
      expect(summary.avgScore).toBe(0);
      expect(Object.keys(summary.byStatus)).toHaveLength(0);
    });

    it("counts by status and computes average score", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "a", status: "new", relevanceScore: 60 }));
      store.addListing(makeListing({ id: "b", status: "new", relevanceScore: 80 }));
      store.addListing(makeListing({ id: "c", status: "applied", relevanceScore: 90 }));

      const summary = store.getPipelineSummary();
      expect(summary.total).toBe(3);
      expect(summary.byStatus.new).toBe(2);
      expect(summary.byStatus.applied).toBe(1);
      // (60+80+90)/3 = 76.67 → rounded to 2 decimal places
      expect(summary.avgScore).toBeCloseTo(76.67, 1);
    });
  });

  describe("search management", () => {
    it("adds and retrieves searches", () => {
      const store = createJobStore();
      const search = makeSearch({ id: "s1" });
      store.addSearch(search);

      const searches = store.getSearches();
      expect(searches).toHaveLength(1);
      expect(searches[0].id).toBe("s1");
    });

    it("toggles search enabled state", () => {
      const store = createJobStore();
      store.addSearch(makeSearch({ id: "s1", enabled: true }));
      store.toggleSearch("s1");

      const searches = store.getSearches();
      expect(searches[0].enabled).toBe(false);

      store.toggleSearch("s1");
      expect(store.getSearches()[0].enabled).toBe(true);
    });

    it("toggleSearch ignores non-existent id", () => {
      const store = createJobStore();
      // Should not throw
      store.toggleSearch("nonexistent");
    });
  });

  describe("serialization (toJSON / fromJSON)", () => {
    it("round-trips listings and searches", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "j1" }));
      store.addSearch(makeSearch({ id: "s1" }));

      const json = store.toJSON();
      expect(json.listings).toHaveLength(1);
      expect(json.searches).toHaveLength(1);

      const store2 = createJobStore();
      store2.fromJSON(json);

      expect(store2.getByStatus("new")).toHaveLength(1);
      expect(store2.getSearches()).toHaveLength(1);
    });

    it("fromJSON clears existing data before loading", () => {
      const store = createJobStore();
      store.addListing(makeListing({ id: "old" }));

      store.fromJSON({ listings: [makeListing({ id: "new" })], searches: [] });

      const all = store.getByStatus("new");
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe("new");
    });
  });
});
