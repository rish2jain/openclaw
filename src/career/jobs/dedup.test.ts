import { describe, it, expect } from "vitest";
import { normalizeCompanyName, normalizeTitle, deduplicateListings } from "./dedup.js";
import type { JobListing } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeListing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: "test-1",
    title: "Software Engineer",
    company: "Acme Corp",
    location: "San Francisco, CA",
    remotePolicy: "remote",
    description: "Build things.",
    requirements: ["typescript"],
    sourceUrl: "https://example.com/1",
    source: "source-a",
    relevanceScore: 70,
    scoreBreakdown: {},
    status: "new",
    notes: [],
    ...overrides,
  };
}

// ── normalizeCompanyName ─────────────────────────────────────────────

describe("normalizeCompanyName", () => {
  it("lowercases and trims", () => {
    // "Corp" is a recognized suffix that gets stripped
    expect(normalizeCompanyName("  Acme Corp  ")).toBe("acme");
    // A name without a suffix just lowercases/trims
    expect(normalizeCompanyName("  Acme Systems  ")).toBe("acme systems");
  });

  it("strips common suffixes: Inc, LLC, Ltd, Corp, etc.", () => {
    expect(normalizeCompanyName("Acme Inc")).toBe("acme");
    expect(normalizeCompanyName("Acme Inc.")).toBe("acme");
    expect(normalizeCompanyName("Widgets LLC")).toBe("widgets");
    expect(normalizeCompanyName("BigCo Ltd")).toBe("bigco");
    expect(normalizeCompanyName("BigCo Ltd.")).toBe("bigco");
    expect(normalizeCompanyName("Global Corp")).toBe("global");
    expect(normalizeCompanyName("Global Corp.")).toBe("global");
    expect(normalizeCompanyName("Example Corporation")).toBe("example");
    expect(normalizeCompanyName("Finance GmbH")).toBe("finance");
    expect(normalizeCompanyName("Euro SA")).toBe("euro");
    expect(normalizeCompanyName("London PLC")).toBe("london");
  });

  it("strips trailing punctuation after suffix removal", () => {
    expect(normalizeCompanyName("Acme, Inc.")).toBe("acme");
  });

  it("handles already-clean names", () => {
    expect(normalizeCompanyName("google")).toBe("google");
  });

  it("handles empty string", () => {
    expect(normalizeCompanyName("")).toBe("");
  });
});

// ── normalizeTitle ───────────────────────────────────────────────────

describe("normalizeTitle", () => {
  it("expands abbreviations: sr -> senior, jr -> junior", () => {
    expect(normalizeTitle("Sr. Engineer")).toContain("senior");
    expect(normalizeTitle("Jr Developer")).toContain("junior");
  });

  it("expands SWE and SDE", () => {
    expect(normalizeTitle("SWE")).toContain("software engineer");
    expect(normalizeTitle("SDE")).toContain("software development engineer");
  });

  it("normalizes fullstack / full-stack / full stack", () => {
    const a = normalizeTitle("Full-Stack Engineer");
    const b = normalizeTitle("Full Stack Engineer");
    const c = normalizeTitle("Fullstack Engineer");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("normalizes frontend / front-end / front end", () => {
    const a = normalizeTitle("Front-end Developer");
    const b = normalizeTitle("Frontend Developer");
    expect(a).toBe(b);
  });

  it("normalizes backend / back-end / back end", () => {
    const a = normalizeTitle("Back-end Developer");
    const b = normalizeTitle("Backend Developer");
    expect(a).toBe(b);
  });

  it("removes parenthetical content like (Remote) or (NYC)", () => {
    expect(normalizeTitle("Engineer (Remote)")).toBe("engineer");
    expect(normalizeTitle("Developer (NYC)")).toBe("developer");
  });

  it("replaces dashes and slashes with spaces", () => {
    expect(normalizeTitle("FE/BE Engineer")).toBe("frontend backend engineer");
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("  Senior   Engineer  ")).toBe("senior engineer");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

// ── deduplicateListings ──────────────────────────────────────────────

describe("deduplicateListings", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateListings([])).toEqual([]);
  });

  it("returns single listing unchanged", () => {
    const listing = makeListing();
    const result = deduplicateListings([listing]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(listing.id);
  });

  it("deduplicates listings with same company+title from different sources", () => {
    const a = makeListing({
      id: "a",
      source: "hn",
      description: "Short",
      relevanceScore: 60,
    });
    const b = makeListing({
      id: "b",
      source: "linkedin",
      description: "A much longer description with lots of detail about the role",
      relevanceScore: 80,
    });
    const result = deduplicateListings([a, b]);
    expect(result).toHaveLength(1);
  });

  it("merges sources into combined string", () => {
    const a = makeListing({ id: "a", source: "hn" });
    const b = makeListing({ id: "b", source: "linkedin" });
    const result = deduplicateListings([a, b]);
    expect(result[0].source).toContain("+");
    expect(result[0].source).toContain("hn");
    expect(result[0].source).toContain("linkedin");
  });

  it("keeps listing with longest description", () => {
    const a = makeListing({ id: "a", description: "short" });
    const b = makeListing({
      id: "b",
      description: "A very long description with much more detail",
    });
    const result = deduplicateListings([a, b]);
    expect(result[0].description).toBe(b.description);
  });

  it("merges requirements from all duplicates", () => {
    const a = makeListing({ id: "a", requirements: ["typescript", "react"] });
    const b = makeListing({ id: "b", requirements: ["typescript", "node.js"] });
    const result = deduplicateListings([a, b]);
    expect(result[0].requirements).toContain("typescript");
    expect(result[0].requirements).toContain("react");
    expect(result[0].requirements).toContain("node.js");
  });

  it("keeps the highest relevance score", () => {
    const a = makeListing({ id: "a", relevanceScore: 60 });
    const b = makeListing({ id: "b", relevanceScore: 85 });
    const result = deduplicateListings([a, b]);
    expect(result[0].relevanceScore).toBe(85);
  });

  it("keeps the earliest posted date", () => {
    const a = makeListing({ id: "a", postedDate: "2025-03-10" });
    const b = makeListing({ id: "b", postedDate: "2025-03-01" });
    const result = deduplicateListings([a, b]);
    expect(result[0].postedDate).toBe("2025-03-01");
  });

  it("handles company name suffix differences (Inc vs LLC)", () => {
    const a = makeListing({ id: "a", company: "Acme Inc" });
    const b = makeListing({ id: "b", company: "Acme LLC" });
    const result = deduplicateListings([a, b]);
    // Both normalize to "acme", same title → deduped
    expect(result).toHaveLength(1);
  });

  it("handles title abbreviation differences (Sr vs Senior)", () => {
    // "Sr" (without dot) normalizes to "senior" via title normalization
    const a = makeListing({ id: "a", title: "Sr Software Engineer" });
    const b = makeListing({ id: "b", title: "Senior Software Engineer" });
    const result = deduplicateListings([a, b]);
    expect(result).toHaveLength(1);
  });

  it("separates listings at different locations", () => {
    const a = makeListing({ id: "a", location: "San Francisco, CA" });
    const b = makeListing({ id: "b", location: "New York, NY" });
    const result = deduplicateListings([a, b]);
    expect(result).toHaveLength(2);
  });

  it("merges listings with matching city-level location", () => {
    const a = makeListing({ id: "a", location: "San Francisco" });
    const b = makeListing({ id: "b", location: "San Francisco, CA" });
    const result = deduplicateListings([a, b]);
    expect(result).toHaveLength(1);
  });

  it("treats empty location as matching any location", () => {
    const a = makeListing({ id: "a", location: "" });
    const b = makeListing({ id: "b", location: "Remote" });
    const result = deduplicateListings([a, b]);
    expect(result).toHaveLength(1);
  });

  it("keeps distinct jobs at the same company", () => {
    const a = makeListing({ id: "a", title: "Frontend Engineer" });
    const b = makeListing({ id: "b", title: "Backend Engineer" });
    const result = deduplicateListings([a, b]);
    expect(result).toHaveLength(2);
  });
});
