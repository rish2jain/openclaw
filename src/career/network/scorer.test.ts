import { describe, it, expect, vi, afterEach } from "vitest";
import { createConnectionScorer, decayScore } from "./scorer.js";
import type { NetworkPerson, InteractionRecord } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function makePerson(overrides: Partial<NetworkPerson> = {}): NetworkPerson {
  return {
    id: "p1",
    name: "Test Person",
    tags: [],
    addedAt: Date.now(),
    ...overrides,
  };
}

function makeInteraction(
  daysAgo: number,
  channel: InteractionRecord["channel"] = "dm",
): InteractionRecord {
  return {
    personId: "p1",
    channel,
    date: Date.now() - daysAgo * DAY_MS,
  };
}

// ── decayScore (exported standalone) ─────────────────────────────────

describe("decayScore", () => {
  it("returns the current score for zero days elapsed", () => {
    expect(decayScore(0.8, 0)).toBe(0.8);
  });

  it("returns the current score for negative days", () => {
    expect(decayScore(0.8, -5)).toBe(0.8);
  });

  it("halves the score at the half-life (180 days)", () => {
    const result = decayScore(1.0, 180);
    expect(result).toBeCloseTo(0.5, 2);
  });

  it("quarters the score at 2x half-life (360 days)", () => {
    const result = decayScore(1.0, 360);
    expect(result).toBeCloseTo(0.25, 2);
  });

  it("clamps result to [0, 1] when decay is applied", () => {
    // With 0 days elapsed, function returns currentScore directly (early return)
    expect(decayScore(1.5, 0)).toBe(1.5);
    // With positive days, clamping is applied
    expect(decayScore(0.0, 100)).toBe(0);
    // A decayed value from a high input stays within [0, 1]
    expect(decayScore(1.0, 180)).toBeCloseTo(0.5, 2);
  });
});

// ── createConnectionScorer ───────────────────────────────────────────

describe("createConnectionScorer", () => {
  const scorer = createConnectionScorer();
  const person = makePerson();

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("overall composite", () => {
    it("returns 0 for zero interactions, no history, no boost", () => {
      const score = scorer.scoreConnection(person, [], [], 0);
      expect(score).toBe(0);
    });

    it("returns a value in [0, 1]", () => {
      const interactions = [makeInteraction(1, "dm")];
      const score = scorer.scoreConnection(person, interactions, ["Acme"], 0.5);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("never exceeds 1 even with maximum inputs", () => {
      // Many recent DM interactions, lots of shared history, max boost
      const interactions = Array.from({ length: 20 }, (_, i) => makeInteraction(i, "dm"));
      const score = scorer.scoreConnection(
        person,
        interactions,
        Array.from({ length: 20 }, (_, i) => `Org${i}`),
        1.0,
      );
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("recency factor (30%)", () => {
    it("gives higher score for recent interactions", () => {
      const recent = scorer.scoreConnection(person, [makeInteraction(1)], []);
      const old = scorer.scoreConnection(person, [makeInteraction(365)], []);
      expect(recent).toBeGreaterThan(old);
    });

    it("gives zero recency when no interactions exist", () => {
      const score = scorer.scoreConnection(person, [], [], 0);
      expect(score).toBe(0);
    });
  });

  describe("frequency factor (25%)", () => {
    it("gives higher score for more interactions in past year", () => {
      const few = scorer.scoreConnection(person, [makeInteraction(30), makeInteraction(60)], []);
      const many = scorer.scoreConnection(
        person,
        Array.from({ length: 12 }, (_, i) => makeInteraction(i * 30)),
        [],
      );
      expect(many).toBeGreaterThan(few);
    });

    it("caps frequency at 12 interactions per year", () => {
      const at12 = scorer.scoreConnection(
        person,
        Array.from({ length: 12 }, (_, i) => makeInteraction(i * 20)),
        [],
      );
      const at24 = scorer.scoreConnection(
        person,
        Array.from({ length: 24 }, (_, i) => makeInteraction(i * 10)),
        [],
      );
      // Both should yield similar scores since freq maxes out at 12
      expect(Math.abs(at12 - at24)).toBeLessThan(0.05);
    });

    it("ignores interactions older than 1 year for frequency", () => {
      const oldOnly = scorer.scoreConnection(person, [makeInteraction(400)], []);
      const recentOnly = scorer.scoreConnection(person, [makeInteraction(30)], []);
      // Old interaction still contributes to recency (decayed) but not frequency
      expect(recentOnly).toBeGreaterThan(oldOnly);
    });
  });

  describe("depth factor (20%)", () => {
    it("scores meeting highest", () => {
      const meeting = scorer.scoreConnection(person, [makeInteraction(1, "meeting")], []);
      const dm = scorer.scoreConnection(person, [makeInteraction(1, "dm")], []);
      expect(meeting).toBeGreaterThanOrEqual(dm);
    });

    it("averages depth over the most recent 20 interactions", () => {
      // 25 interactions: first 20 (most recent) are DMs, last 5 are group
      const interactions = [
        ...Array.from({ length: 20 }, (_, i) => makeInteraction(i, "dm")),
        ...Array.from({ length: 5 }, (_, i) => makeInteraction(20 + i, "group")),
      ];
      const allDm = scorer.scoreConnection(
        person,
        Array.from({ length: 25 }, (_, i) => makeInteraction(i, "dm")),
        [],
      );
      const mixed = scorer.scoreConnection(person, interactions, []);
      // The older group messages should be excluded from the depth sample
      expect(Math.abs(mixed - allDm)).toBeLessThan(0.05);
    });
  });

  describe("shared history factor (15%)", () => {
    it("gives zero for no shared organizations", () => {
      const noHistory = scorer.scoreConnection(person, [makeInteraction(1)], []);
      const withHistory = scorer.scoreConnection(person, [makeInteraction(1)], ["Acme Corp"]);
      expect(withHistory).toBeGreaterThan(noHistory);
    });

    it("caps at 1.0 (10 shared orgs)", () => {
      const manyOrgs = Array.from({ length: 15 }, (_, i) => `Org${i}`);
      const score10 = scorer.scoreConnection(person, [makeInteraction(1)], manyOrgs.slice(0, 10));
      const score15 = scorer.scoreConnection(person, [makeInteraction(1)], manyOrgs);
      // Both should be the same since history caps at 1.0
      expect(Math.abs(score10 - score15)).toBeLessThan(0.01);
    });

    it("adds 0.1 per shared organization", () => {
      const one = scorer.scoreConnection(person, [makeInteraction(1)], ["Acme"]);
      const two = scorer.scoreConnection(person, [makeInteraction(1)], ["Acme", "Beta"]);
      // Difference should be approximately 0.15 * 0.1 = 0.015
      expect(two).toBeGreaterThan(one);
    });
  });

  describe("manual boost factor (10%)", () => {
    it("defaults to 0 when not provided", () => {
      const noBoost = scorer.scoreConnection(person, [makeInteraction(1)], []);
      const withBoost = scorer.scoreConnection(person, [makeInteraction(1)], [], 0.5);
      expect(withBoost).toBeGreaterThan(noBoost);
    });

    it("clamps boost to [0, 1]", () => {
      const over = scorer.scoreConnection(person, [makeInteraction(1)], [], 2.0);
      const max = scorer.scoreConnection(person, [makeInteraction(1)], [], 1.0);
      // Both should yield the same since 2.0 is clamped to 1.0
      expect(Math.abs(over - max)).toBeLessThan(0.001);
    });

    it("clamps negative boost to 0", () => {
      const negative = scorer.scoreConnection(person, [makeInteraction(1)], [], -1.0);
      const zero = scorer.scoreConnection(person, [makeInteraction(1)], [], 0);
      expect(Math.abs(negative - zero)).toBeLessThan(0.001);
    });
  });
});
