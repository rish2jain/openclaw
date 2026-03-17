import { describe, it, expect, vi, afterEach } from "vitest";
import { createInteractionTracker } from "./tracker.js";
import type { NetworkPerson, RelationshipEdge, InteractionRecord } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function makePerson(id: string, company?: string): NetworkPerson {
  return { id, name: `Person ${id}`, company, tags: [], addedAt: Date.now() };
}

function makeEdge(fromId: string, toId: string, strength: number): RelationshipEdge {
  return {
    fromId,
    toId,
    type: "knows",
    connectionStrength: strength,
    sharedHistory: [],
    manualBoost: 0,
  };
}

function makeRecord(
  personId: string,
  daysAgo: number,
  channel: InteractionRecord["channel"] = "dm",
): InteractionRecord {
  return { personId, channel, date: Date.now() - daysAgo * DAY_MS, type: channel };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("createInteractionTracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("logInteraction / getInteractions", () => {
    it("stores and retrieves interactions", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 5));
      tracker.logInteraction(makeRecord("p1", 10));

      const interactions = tracker.getInteractions("p1");
      expect(interactions).toHaveLength(2);
    });

    it("returns interactions sorted newest-first", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 30)); // Older
      tracker.logInteraction(makeRecord("p1", 5)); // Newer

      const interactions = tracker.getInteractions("p1");
      expect(interactions[0].date).toBeGreaterThan(interactions[1].date);
    });

    it("returns empty array for unknown person", () => {
      const tracker = createInteractionTracker();
      expect(tracker.getInteractions("unknown")).toEqual([]);
    });

    it("keeps interactions per person separate", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 5));
      tracker.logInteraction(makeRecord("p2", 10));

      expect(tracker.getInteractions("p1")).toHaveLength(1);
      expect(tracker.getInteractions("p2")).toHaveLength(1);
    });
  });

  describe("getStaleConnections", () => {
    it("returns persons with no interactions", () => {
      const tracker = createInteractionTracker();
      const persons = [makePerson("p1"), makePerson("p2")];

      const stale = tracker.getStaleConnections(persons, 90);
      expect(stale).toHaveLength(2);
    });

    it("returns persons whose last interaction is older than threshold", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 100)); // 100 days ago
      tracker.logInteraction(makeRecord("p2", 30)); // 30 days ago

      const persons = [makePerson("p1"), makePerson("p2")];
      const stale = tracker.getStaleConnections(persons, 90);

      expect(stale).toHaveLength(1);
      expect(stale[0].id).toBe("p1");
    });

    it("excludes persons with recent interactions", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 1)); // 1 day ago

      const persons = [makePerson("p1")];
      const stale = tracker.getStaleConnections(persons, 90);
      expect(stale).toHaveLength(0);
    });

    it("uses the most recent interaction date for staleness check", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 200)); // 200 days ago
      tracker.logInteraction(makeRecord("p1", 10)); // 10 days ago (most recent)

      const persons = [makePerson("p1")];
      const stale = tracker.getStaleConnections(persons, 90);
      expect(stale).toHaveLength(0); // Not stale, most recent is 10 days ago
    });

    it("returns empty when all persons have recent activity", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 5));
      tracker.logInteraction(makeRecord("p2", 10));

      const persons = [makePerson("p1"), makePerson("p2")];
      const stale = tracker.getStaleConnections(persons, 90);
      expect(stale).toHaveLength(0);
    });

    it("handles empty persons array", () => {
      const tracker = createInteractionTracker();
      expect(tracker.getStaleConnections([], 90)).toEqual([]);
    });
  });

  describe("suggestReconnections", () => {
    it("returns empty when targetCompanies is empty", () => {
      const tracker = createInteractionTracker();
      const persons = [makePerson("p1", "Google")];
      const edges = [makeEdge("me", "p1", 0.8)];

      const suggestions = tracker.suggestReconnections(persons, edges, []);
      expect(suggestions).toEqual([]);
    });

    it("returns stale connections at target companies", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 200)); // Stale

      const persons = [makePerson("p1", "Google"), makePerson("p2", "Meta")];
      const edges = [makeEdge("me", "p1", 0.8), makeEdge("me", "p2", 0.6)];

      const suggestions = tracker.suggestReconnections(persons, edges, ["Google"]);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].id).toBe("p1");
    });

    it("excludes non-stale connections at target companies", () => {
      const tracker = createInteractionTracker();
      tracker.logInteraction(makeRecord("p1", 5)); // Recent

      const persons = [makePerson("p1", "Google")];
      const edges = [makeEdge("me", "p1", 0.8)];

      const suggestions = tracker.suggestReconnections(persons, edges, ["Google"]);
      expect(suggestions).toHaveLength(0);
    });

    it("matches company names case-insensitively", () => {
      const tracker = createInteractionTracker();

      const persons = [makePerson("p1", "Google")];
      const edges = [makeEdge("me", "p1", 0.8)];

      const suggestions = tracker.suggestReconnections(persons, edges, ["google"]);
      expect(suggestions).toHaveLength(1);
    });

    it("sorts by connection strength descending", () => {
      const tracker = createInteractionTracker();

      const persons = [makePerson("p1", "Google"), makePerson("p2", "Google")];
      const edges = [makeEdge("me", "p1", 0.4), makeEdge("me", "p2", 0.9)];

      const suggestions = tracker.suggestReconnections(persons, edges, ["Google"]);
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].id).toBe("p2"); // Stronger connection first
    });

    it("skips persons without a company", () => {
      const tracker = createInteractionTracker();

      const persons = [makePerson("p1")]; // No company
      const edges = [makeEdge("me", "p1", 0.8)];

      const suggestions = tracker.suggestReconnections(persons, edges, ["Google"]);
      expect(suggestions).toHaveLength(0);
    });

    it("includes persons with no interactions (stale by definition)", () => {
      const tracker = createInteractionTracker();

      const persons = [makePerson("p1", "Google")];
      const edges = [makeEdge("me", "p1", 0.8)];

      const suggestions = tracker.suggestReconnections(persons, edges, ["Google"]);
      expect(suggestions).toHaveLength(1);
    });
  });
});
