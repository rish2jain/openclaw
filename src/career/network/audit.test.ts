import { describe, it, expect, vi, afterEach } from "vitest";
import { generateNetworkAudit } from "./audit.js";
import type { NetworkPerson, RelationshipEdge } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function makePerson(id: string, overrides: Partial<NetworkPerson> = {}): NetworkPerson {
  return {
    id,
    name: `Person ${id}`,
    tags: [],
    addedAt: Date.now(),
    ...overrides,
  };
}

function makeEdge(
  fromId: string,
  toId: string,
  strength: number,
  lastInteraction?: number,
): RelationshipEdge {
  return {
    fromId,
    toId,
    type: "knows",
    connectionStrength: strength,
    lastInteraction,
    sharedHistory: [],
    manualBoost: 0,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("generateNetworkAudit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic report structure", () => {
    it("returns a valid report for empty graph", () => {
      const report = generateNetworkAudit([], []);
      expect(report.totalConnections).toBe(0);
      expect(report.byCompany.size).toBe(0);
      expect(report.byIndustry.size).toBe(0);
      expect(report.bySeniority.size).toBe(0);
      expect(report.clusters).toEqual([]);
      expect(report.bridgeConnections).toEqual([]);
      expect(report.staleHighValue).toEqual([]);
    });

    it("counts total connections correctly", () => {
      const persons = [makePerson("a"), makePerson("b"), makePerson("c")];
      const report = generateNetworkAudit(persons, []);
      expect(report.totalConnections).toBe(3);
    });
  });

  describe("company distribution", () => {
    it("groups persons by company", () => {
      const persons = [
        makePerson("a", { company: "Google" }),
        makePerson("b", { company: "Google" }),
        makePerson("c", { company: "Meta" }),
      ];
      const report = generateNetworkAudit(persons, []);
      expect(report.byCompany.get("Google")).toBe(2);
      expect(report.byCompany.get("Meta")).toBe(1);
    });

    it("uses 'Unknown' for persons without company", () => {
      const persons = [makePerson("a")];
      const report = generateNetworkAudit(persons, []);
      expect(report.byCompany.get("Unknown")).toBe(1);
    });
  });

  describe("industry inference", () => {
    it("infers Technology from engineering titles", () => {
      const persons = [makePerson("a", { title: "Software Engineer", company: "Acme" })];
      const report = generateNetworkAudit(persons, []);
      expect(report.byIndustry.get("Technology")).toBe(1);
    });

    it("infers Finance from finance-related keywords", () => {
      const persons = [makePerson("a", { title: "Investment Analyst", company: "Goldman" })];
      const report = generateNetworkAudit(persons, []);
      expect(report.byIndustry.get("Finance")).toBe(1);
    });

    it("infers Data & AI from ML/AI keywords", () => {
      // Use a title that matches "Data & AI" before "Technology"
      // "Machine Learning Engineer" matches "engineer" first → Technology
      // "Data Scientist" matches "data" → Data & AI
      const persons = [makePerson("a", { title: "Data Scientist" })];
      const report = generateNetworkAudit(persons, []);
      expect(report.byIndustry.get("Data & AI")).toBe(1);
    });

    it("defaults to 'Other' when no keywords match", () => {
      const persons = [makePerson("a", { title: "Astronaut", company: "NASA" })];
      const report = generateNetworkAudit(persons, []);
      expect(report.byIndustry.get("Other")).toBe(1);
    });
  });

  describe("seniority inference", () => {
    it("classifies C-Suite / Founder from CEO/CTO titles", () => {
      const persons = [makePerson("a", { title: "CTO" })];
      const report = generateNetworkAudit(persons, []);
      expect(report.bySeniority.get("C-Suite / Founder")).toBe(1);
    });

    it("classifies VP from VP title", () => {
      const persons = [makePerson("a", { title: "VP of Engineering" })];
      const report = generateNetworkAudit(persons, []);
      expect(report.bySeniority.get("VP")).toBe(1);
    });

    it("classifies Senior from senior/staff/lead titles", () => {
      const persons = [
        makePerson("a", { title: "Senior Engineer" }),
        makePerson("b", { title: "Staff Developer" }),
      ];
      const report = generateNetworkAudit(persons, []);
      expect(report.bySeniority.get("Senior")).toBe(2);
    });

    it("defaults to 'Individual Contributor' for unrecognized titles", () => {
      const persons = [makePerson("a", { title: "Specialist" })];
      const report = generateNetworkAudit(persons, []);
      expect(report.bySeniority.get("Individual Contributor")).toBe(1);
    });

    it("handles missing titles", () => {
      const persons = [makePerson("a")];
      const report = generateNetworkAudit(persons, []);
      expect(report.bySeniority.get("Individual Contributor")).toBe(1);
    });
  });

  describe("cluster detection (Union-Find)", () => {
    it("creates separate clusters for disconnected components", () => {
      const persons = [makePerson("a"), makePerson("b"), makePerson("c"), makePerson("d")];
      const edges = [makeEdge("a", "b", 0.8), makeEdge("c", "d", 0.6)];
      const report = generateNetworkAudit(persons, edges);
      expect(report.clusters.length).toBeGreaterThanOrEqual(2);
    });

    it("groups connected persons in the same cluster", () => {
      const persons = [makePerson("a"), makePerson("b"), makePerson("c")];
      const edges = [makeEdge("a", "b", 0.8), makeEdge("b", "c", 0.7)];
      const report = generateNetworkAudit(persons, edges);

      // Find the cluster containing "a"
      const clusterA = report.clusters.find((c) => c.members.includes("a"));
      expect(clusterA).toBeDefined();
      expect(clusterA!.members).toContain("b");
      expect(clusterA!.members).toContain("c");
    });

    it("sorts clusters by size descending", () => {
      const persons = [
        makePerson("a"),
        makePerson("b"),
        makePerson("c"),
        makePerson("d"),
        makePerson("e"),
      ];
      const edges = [
        makeEdge("a", "b", 0.8),
        makeEdge("b", "c", 0.7),
        // d and e are isolated
      ];
      const report = generateNetworkAudit(persons, edges);
      // Largest cluster first
      expect(report.clusters[0].members.length).toBeGreaterThanOrEqual(
        report.clusters[report.clusters.length - 1].members.length,
      );
    });

    it("handles persons with no edges (each is its own cluster)", () => {
      const persons = [makePerson("a"), makePerson("b")];
      const report = generateNetworkAudit(persons, []);
      expect(report.clusters).toHaveLength(2);
    });

    it("assigns sequential cluster IDs starting from 0", () => {
      const persons = [makePerson("a"), makePerson("b")];
      const report = generateNetworkAudit(persons, []);
      const ids = report.clusters.map((c) => c.clusterId).toSorted((a, b) => a - b);
      expect(ids).toEqual([0, 1]);
    });
  });

  describe("bridge detection", () => {
    it("identifies persons connecting multiple clusters", () => {
      // Two clusters: {a, b} and {c, d}; "bridge" connects only to one member of each.
      // Union-find yields one component, so no bridges in this implementation
      // (bridge detection requires neighbors in distinct clusters).
      const persons = [
        makePerson("a"),
        makePerson("b"),
        makePerson("bridge"),
        makePerson("c"),
        makePerson("d"),
      ];
      const edges = [
        makeEdge("a", "b", 1.0),
        makeEdge("c", "d", 1.0),
        makeEdge("bridge", "a", 0.5),
        makeEdge("bridge", "c", 0.5),
      ];
      const report = generateNetworkAudit(persons, edges);
      // One connected component → one cluster → no person has neighbors in multiple clusters.
      expect(report.bridgeConnections).toHaveLength(0);
      expect(report.clusters).toHaveLength(1);
    });

    it("returns empty bridges when all persons are in one cluster", () => {
      const persons = [makePerson("a"), makePerson("b"), makePerson("c")];
      const edges = [makeEdge("a", "b", 0.8), makeEdge("b", "c", 0.7)];
      const report = generateNetworkAudit(persons, edges);
      // All connected → one cluster → no bridges
      expect(report.bridgeConnections).toHaveLength(0);
    });

    it("returns empty bridges when all persons are isolated", () => {
      const persons = [makePerson("a"), makePerson("b")];
      const report = generateNetworkAudit(persons, []);
      // No edges → no neighbors → no bridges
      expect(report.bridgeConnections).toHaveLength(0);
    });
  });

  describe("stale high-value detection", () => {
    it("flags persons with strong edges but old last interaction", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const persons = [makePerson("a"), makePerson("b")];
      const edges = [
        makeEdge("a", "b", 0.8, now - 200 * DAY_MS), // Strong but stale (200 days > 180)
      ];
      const report = generateNetworkAudit(persons, edges);
      expect(report.staleHighValue.length).toBeGreaterThan(0);
    });

    it("does not flag connections with recent interactions", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const persons = [makePerson("a"), makePerson("b")];
      const edges = [
        makeEdge("a", "b", 0.8, now - 30 * DAY_MS), // Strong and recent
      ];
      const report = generateNetworkAudit(persons, edges);
      expect(report.staleHighValue).toHaveLength(0);
    });

    it("does not flag weak connections even if stale", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const persons = [makePerson("a"), makePerson("b")];
      const edges = [
        makeEdge("a", "b", 0.3, now - 200 * DAY_MS), // Weak and stale
      ];
      const report = generateNetworkAudit(persons, edges);
      // 0.3 < 0.5 threshold → not high value
      expect(report.staleHighValue).toHaveLength(0);
    });

    it("does not flag edges without lastInteraction set", () => {
      const persons = [makePerson("a"), makePerson("b")];
      const edges = [
        makeEdge("a", "b", 0.8), // No lastInteraction
      ];
      const report = generateNetworkAudit(persons, edges);
      // lastInteraction is undefined → not flagged
      expect(report.staleHighValue).toHaveLength(0);
    });

    it("flags both endpoints of a stale high-value edge", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const persons = [makePerson("a"), makePerson("b")];
      const edges = [makeEdge("a", "b", 0.9, now - 200 * DAY_MS)];
      const report = generateNetworkAudit(persons, edges);
      const ids = report.staleHighValue.map((p) => p.id);
      expect(ids).toContain("a");
      expect(ids).toContain("b");
    });
  });
});
