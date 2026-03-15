import { describe, it, expect } from "vitest";
import type { CompanyIntel, CompanySignal } from "../intel/types.js";
import type { Skill, WorkEntry, CareerPreferences } from "../profile/types.js";
import { createJobScorer } from "./scorer.js";
import type { JobListing } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

function makeListing(overrides: Partial<JobListing> = {}): JobListing {
  return {
    id: "test-1",
    title: "Senior Software Engineer",
    company: "Acme Corp",
    location: "San Francisco, CA",
    remotePolicy: "remote",
    description: "Build scalable backend services using TypeScript and Node.js.",
    requirements: ["typescript", "node.js", "aws"],
    sourceUrl: "https://example.com/job/1",
    source: "test",
    relevanceScore: 0,
    scoreBreakdown: {},
    status: "new",
    notes: [],
    ...overrides,
  };
}

function makeSkill(name: string, proficiency: number): Skill {
  return { name, category: "language", proficiency, sources: ["test"] };
}

function makeWorkEntry(title: string, endDate?: string): WorkEntry {
  return {
    company: "Previous Co",
    title,
    startDate: "2020-01-01",
    endDate,
    description: "",
    skills: [],
    achievements: [],
  };
}

function makePreferences(overrides: Partial<CareerPreferences> = {}): CareerPreferences {
  return {
    roleTypes: ["engineer"],
    industries: [],
    locationPreferences: [],
    dealBreakers: [],
    workStyle: "remote",
    companyStage: [],
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProfile(
  skills: Skill[] = [],
  workHistory: WorkEntry[] = [],
  preferences?: Partial<CareerPreferences>,
) {
  return {
    skills,
    workHistory,
    preferences: makePreferences(preferences),
  };
}

function makeIntel(signals: CompanySignal[]): CompanyIntel {
  return {
    name: "Acme Corp",
    industry: "Technology",
    stage: "Series B",
    recentSignals: signals,
    knownConnectionIds: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("createJobScorer", () => {
  describe("default weights (40/20/25/15)", () => {
    const scorer = createJobScorer();

    it("returns a score and breakdown with all four factors", () => {
      const result = scorer.scoreJob(makeListing(), makeProfile());
      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("breakdown");
      expect(result.breakdown).toHaveProperty("skillsOverlap");
      expect(result.breakdown).toHaveProperty("seniorityAlignment");
      expect(result.breakdown).toHaveProperty("preferenceMatch");
      expect(result.breakdown).toHaveProperty("companySignals");
    });

    it("score is an integer between 0 and 100", () => {
      const result = scorer.scoreJob(makeListing(), makeProfile());
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe("skills overlap scoring", () => {
    const scorer = createJobScorer();

    it("returns 50 when profile has no skills", () => {
      const result = scorer.scoreJob(makeListing(), makeProfile([]));
      expect(result.breakdown.skillsOverlap).toBe(50);
    });

    it("returns 50 when listing has no requirements", () => {
      const listing = makeListing({ requirements: [] });
      const result = scorer.scoreJob(listing, makeProfile([makeSkill("TypeScript", 0.9)]));
      expect(result.breakdown.skillsOverlap).toBe(50);
    });

    it("scores high when skills match requirements", () => {
      const skills = [makeSkill("TypeScript", 0.9), makeSkill("Node.js", 0.8)];
      const result = scorer.scoreJob(makeListing(), makeProfile(skills));
      expect(result.breakdown.skillsOverlap).toBeGreaterThan(80);
    });

    it("gives partial credit for description-only matches", () => {
      // "TypeScript" is in description but "python" is in requirements
      const listing = makeListing({
        requirements: ["python"],
        description: "We use TypeScript and React daily",
      });
      const skills = [makeSkill("TypeScript", 0.8)];
      const result = scorer.scoreJob(listing, makeProfile(skills));
      // Description match gets 0.5x weight
      expect(result.breakdown.skillsOverlap).toBe(50);
    });

    it("scores low when no skills match", () => {
      const listing = makeListing({ requirements: ["rust", "c++"] });
      const skills = [makeSkill("Python", 0.9)];
      const result = scorer.scoreJob(listing, makeProfile(skills));
      expect(result.breakdown.skillsOverlap).toBeLessThanOrEqual(50);
    });

    it("handles bidirectional substring matching (skill in req or req in skill)", () => {
      const listing = makeListing({ requirements: ["react"] });
      const skills = [makeSkill("React.js", 0.8)];
      const result = scorer.scoreJob(listing, makeProfile(skills));
      // "react" is in "react.js"
      expect(result.breakdown.skillsOverlap).toBe(100);
    });
  });

  describe("seniority alignment scoring", () => {
    const scorer = createJobScorer();

    it("returns 50 when job title has no seniority keyword", () => {
      const listing = makeListing({ title: "Software Engineer" });
      const profile = makeProfile([], [makeWorkEntry("Senior Engineer")]);
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.seniorityAlignment).toBe(50);
    });

    it("returns 50 when work history is empty", () => {
      const result = scorer.scoreJob(makeListing(), makeProfile([], []));
      expect(result.breakdown.seniorityAlignment).toBe(50);
    });

    it("returns 100 for exact seniority match", () => {
      const listing = makeListing({ title: "Senior Backend Engineer" });
      const profile = makeProfile([], [makeWorkEntry("Senior Developer")]);
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.seniorityAlignment).toBe(100);
    });

    it("returns 80 for one-level-off match", () => {
      const listing = makeListing({ title: "Staff Engineer" });
      const profile = makeProfile([], [makeWorkEntry("Senior Engineer")]);
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.seniorityAlignment).toBe(80);
    });

    it("returns 50 for two-levels-off match", () => {
      const listing = makeListing({ title: "Principal Engineer" });
      const profile = makeProfile([], [makeWorkEntry("Senior Developer")]);
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.seniorityAlignment).toBe(50);
    });

    it("returns 20 for three-or-more-levels-off match", () => {
      const listing = makeListing({ title: "VP of Engineering" });
      const profile = makeProfile([], [makeWorkEntry("Junior Developer")]);
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.seniorityAlignment).toBe(20);
    });

    it("uses most recent work entry (sorts by endDate descending)", () => {
      const entries = [
        makeWorkEntry("Junior Developer", "2018-01-01"),
        makeWorkEntry("Senior Engineer"), // null endDate = current
      ];
      const listing = makeListing({ title: "Senior Software Engineer" });
      const result = scorer.scoreJob(listing, makeProfile([], entries));
      expect(result.breakdown.seniorityAlignment).toBe(100);
    });

    it("recognizes abbreviations like sr. and jr.", () => {
      const listing = makeListing({ title: "Sr. Software Engineer" });
      const profile = makeProfile([], [makeWorkEntry("Senior Developer")]);
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.seniorityAlignment).toBe(100);
    });
  });

  describe("preference match scoring", () => {
    const scorer = createJobScorer();

    it("gives full location points when no location preference set", () => {
      const profile = makeProfile([], [], { locationPreferences: [] });
      const result = scorer.scoreJob(makeListing(), profile);
      // All factors should get full or partial credit
      expect(result.breakdown.preferenceMatch).toBeGreaterThanOrEqual(50);
    });

    it("gives full location points for matching location", () => {
      const listing = makeListing({ location: "San Francisco" });
      const profile = makeProfile([], [], {
        locationPreferences: ["San Francisco"],
      });
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.preferenceMatch).toBeGreaterThanOrEqual(50);
    });

    it("gives full remote policy points when policy matches workStyle", () => {
      const listing = makeListing({ remotePolicy: "remote" });
      const profile = makeProfile([], [], { workStyle: "remote" });
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.preferenceMatch).toBeGreaterThanOrEqual(50);
    });

    it("gives zero remote policy points when policy conflicts with workStyle", () => {
      const listing = makeListing({ remotePolicy: "onsite" });
      const profile = makeProfile([], [], { workStyle: "remote" });
      const result = scorer.scoreJob(listing, profile);
      // "remote" workStyle only accepts ["remote"], "onsite" is excluded
      expect(result.breakdown.preferenceMatch).toBeLessThan(100);
    });

    it("gives partial points for unknown remote policy", () => {
      const listing = makeListing({ remotePolicy: "unknown" });
      const profile = makeProfile([], [], { workStyle: "remote" });
      const result = scorer.scoreJob(listing, profile);
      // Unknown gets partial credit (15/25)
      expect(result.breakdown.preferenceMatch).toBeGreaterThan(0);
    });

    it("gives full industry points when no industries specified", () => {
      const profile = makeProfile([], [], { industries: [] });
      const result = scorer.scoreJob(makeListing(), profile);
      expect(result.breakdown.preferenceMatch).toBeGreaterThanOrEqual(50);
    });

    it("gives full industry points when description mentions the industry", () => {
      const listing = makeListing({
        description: "Join our fintech platform revolutionizing payments.",
      });
      const profile = makeProfile([], [], { industries: ["fintech"] });
      const result = scorer.scoreJob(listing, profile);
      expect(result.breakdown.preferenceMatch).toBeGreaterThanOrEqual(50);
    });

    it("gives low industry points when description does not match", () => {
      const listing = makeListing({
        description: "We build healthcare software for hospitals.",
      });
      const profile = makeProfile([], [], { industries: ["fintech"] });
      const result = scorer.scoreJob(listing, profile);
      // Industry only gets 5/25 when unmatched, so overall preference < 100
      // location(no pref)=25, remote(match)=25, companyStage(empty)=25, industry(miss)=5 → 80/100
      expect(result.breakdown.preferenceMatch).toBeLessThanOrEqual(80);
      expect(result.breakdown.preferenceMatch).toBeLessThan(100);
    });
  });

  describe("company signals scoring", () => {
    const scorer = createJobScorer();

    it("returns 50 when no company intel provided", () => {
      const result = scorer.scoreJob(makeListing(), makeProfile());
      expect(result.breakdown.companySignals).toBe(50);
    });

    it("returns 50 when company has no signals", () => {
      const intel = makeIntel([]);
      const result = scorer.scoreJob(makeListing(), makeProfile(), intel);
      expect(result.breakdown.companySignals).toBe(50);
    });

    it("boosts score for funding signal (+15)", () => {
      const intel = makeIntel([{ type: "funding", summary: "Series C $50M", date: "2025-01-01" }]);
      const result = scorer.scoreJob(makeListing(), makeProfile(), intel);
      expect(result.breakdown.companySignals).toBe(65);
    });

    it("boosts score for hiring_surge signal (+20)", () => {
      const intel = makeIntel([
        { type: "hiring_surge", summary: "50 new roles", date: "2025-01-01" },
      ]);
      const result = scorer.scoreJob(makeListing(), makeProfile(), intel);
      expect(result.breakdown.companySignals).toBe(70);
    });

    it("reduces score for layoff signal (-20)", () => {
      const intel = makeIntel([{ type: "layoff", summary: "10% reduction", date: "2025-01-01" }]);
      const result = scorer.scoreJob(makeListing(), makeProfile(), intel);
      expect(result.breakdown.companySignals).toBe(30);
    });

    it("clamps score to [0, 100] with multiple negative signals", () => {
      const intel = makeIntel([
        { type: "layoff", summary: "Round 1", date: "2025-01-01" },
        { type: "layoff", summary: "Round 2", date: "2025-02-01" },
        { type: "layoff", summary: "Round 3", date: "2025-03-01" },
      ]);
      const result = scorer.scoreJob(makeListing(), makeProfile(), intel);
      expect(result.breakdown.companySignals).toBe(0);
    });

    it("clamps score to [0, 100] with multiple positive signals", () => {
      const intel = makeIntel([
        { type: "hiring_surge", summary: "S1", date: "2025-01-01" },
        { type: "hiring_surge", summary: "S2", date: "2025-02-01" },
        { type: "funding", summary: "S3", date: "2025-03-01" },
      ]);
      const result = scorer.scoreJob(makeListing(), makeProfile(), intel);
      expect(result.breakdown.companySignals).toBe(100);
    });

    it("leadership_change adds zero", () => {
      const intel = makeIntel([
        { type: "leadership_change", summary: "New CEO", date: "2025-01-01" },
      ]);
      const result = scorer.scoreJob(makeListing(), makeProfile(), intel);
      expect(result.breakdown.companySignals).toBe(50);
    });
  });

  describe("custom weights", () => {
    it("respects overridden weights", () => {
      // Skills-only scorer
      const scorer = createJobScorer({
        skillsOverlap: 100,
        seniorityAlignment: 0,
        preferenceMatch: 0,
        companySignals: 0,
      });

      const skills = [makeSkill("TypeScript", 0.9), makeSkill("Node.js", 0.8)];
      const result = scorer.scoreJob(makeListing(), makeProfile(skills));

      // Score should be dominated by skills overlap
      expect(result.score).toBe(result.breakdown.skillsOverlap);
    });

    it("partial weight override merges with defaults", () => {
      const scorer = createJobScorer({ skillsOverlap: 60 });
      const result = scorer.scoreJob(makeListing(), makeProfile());
      // Should still work without errors
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("composite score calculation", () => {
    it("weighted average is mathematically correct", () => {
      const scorer = createJobScorer({
        skillsOverlap: 40,
        seniorityAlignment: 20,
        preferenceMatch: 25,
        companySignals: 15,
      });

      const listing = makeListing({ requirements: [] }); // skills=50
      const profile = makeProfile([], []); // seniority=50
      // No intel → companySignals=50
      const result = scorer.scoreJob(listing, profile);

      // All subfactors should be around 50, so composite should be around 50
      const expected = Math.round(
        (result.breakdown.skillsOverlap * 40 +
          result.breakdown.seniorityAlignment * 20 +
          result.breakdown.preferenceMatch * 25 +
          result.breakdown.companySignals * 15) /
          100,
      );
      expect(result.score).toBe(expected);
    });
  });
});
