import { describe, expect, it } from "vitest";
import { createCompanyTracker } from "./company-tracker.js";
import type { CompanyIntel, CompanySignal } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeCompany(overrides: Partial<CompanyIntel> = {}): CompanyIntel {
  return {
    name: "Acme Corp",
    industry: "tech",
    stage: "growth",
    recentSignals: [],
    knownConnectionIds: [],
    ...overrides,
  };
}

function makeSignal(overrides: Partial<CompanySignal> = {}): CompanySignal {
  return {
    type: "funding",
    summary: "Series B raised",
    date: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("CompanyTracker", () => {
  describe("addCompany / getCompany", () => {
    it("stores and retrieves a company by name", () => {
      const tracker = createCompanyTracker();
      const company = makeCompany({ name: "Acme" });
      tracker.addCompany(company);

      const retrieved = tracker.getCompany("Acme");
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe("Acme");
    });

    it("performs case-insensitive lookup", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme Corp" }));

      expect(tracker.getCompany("acme corp")).toBeDefined();
      expect(tracker.getCompany("ACME CORP")).toBeDefined();
      expect(tracker.getCompany("Acme Corp")).toBeDefined();
    });

    it("trims whitespace in names for lookup", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme" }));

      expect(tracker.getCompany("  Acme  ")).toBeDefined();
    });

    it("returns undefined for non-existent company", () => {
      const tracker = createCompanyTracker();
      expect(tracker.getCompany("nonexistent")).toBeUndefined();
    });

    it("overwrites existing company on re-add", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme", industry: "tech" }));
      tracker.addCompany(makeCompany({ name: "Acme", industry: "fintech" }));

      expect(tracker.getCompany("Acme")!.industry).toBe("fintech");
    });
  });

  describe("getAllCompanies", () => {
    it("returns all tracked companies", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "A" }));
      tracker.addCompany(makeCompany({ name: "B" }));
      tracker.addCompany(makeCompany({ name: "C" }));

      expect(tracker.getAllCompanies()).toHaveLength(3);
    });

    it("returns empty array when tracker is empty", () => {
      const tracker = createCompanyTracker();
      expect(tracker.getAllCompanies()).toEqual([]);
    });
  });

  describe("addSignal", () => {
    it("appends a signal to an existing company", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme" }));

      tracker.addSignal("Acme", makeSignal({ summary: "Series C" }));

      const company = tracker.getCompany("Acme")!;
      expect(company.recentSignals).toHaveLength(1);
      expect(company.recentSignals[0].summary).toBe("Series C");
    });

    it("auto-creates a company if it does not exist", () => {
      const tracker = createCompanyTracker();
      tracker.addSignal("NewCo", makeSignal({ summary: "launched" }));

      const company = tracker.getCompany("NewCo");
      expect(company).toBeDefined();
      expect(company!.recentSignals).toHaveLength(1);
      expect(company!.industry).toBe("");
    });

    it("appends multiple signals in order", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme" }));

      tracker.addSignal("Acme", makeSignal({ summary: "first" }));
      tracker.addSignal("Acme", makeSignal({ summary: "second" }));

      const signals = tracker.getCompany("Acme")!.recentSignals;
      expect(signals).toHaveLength(2);
      expect(signals[0].summary).toBe("first");
      expect(signals[1].summary).toBe("second");
    });
  });

  describe("getCompaniesWithRecentSignals", () => {
    it("returns companies with signals within the given day range", () => {
      const tracker = createCompanyTracker();
      const today = new Date().toISOString();
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago

      tracker.addCompany(
        makeCompany({
          name: "Recent",
          recentSignals: [makeSignal({ date: today })],
        }),
      );
      tracker.addCompany(
        makeCompany({
          name: "Old",
          recentSignals: [makeSignal({ date: oldDate })],
        }),
      );

      const results = tracker.getCompaniesWithRecentSignals(30);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Recent");
    });

    it("returns empty array when no signals are recent", () => {
      const tracker = createCompanyTracker();
      const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      tracker.addCompany(
        makeCompany({
          name: "Old",
          recentSignals: [makeSignal({ date: oldDate })],
        }),
      );

      expect(tracker.getCompaniesWithRecentSignals(7)).toEqual([]);
    });

    it("handles companies with no signals", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "NoSignals", recentSignals: [] }));

      expect(tracker.getCompaniesWithRecentSignals(30)).toEqual([]);
    });

    it("uses ISO string comparison for date filtering", () => {
      const tracker = createCompanyTracker();
      // Signal from one hour ago - should be recent
      const recentDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      tracker.addCompany(
        makeCompany({
          name: "JustNow",
          recentSignals: [makeSignal({ date: recentDate })],
        }),
      );

      const results = tracker.getCompaniesWithRecentSignals(1);
      expect(results).toHaveLength(1);
    });
  });

  describe("linkConnection", () => {
    it("adds a connection ID to the company", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme" }));
      tracker.linkConnection("Acme", "conn-1");

      expect(tracker.getCompany("Acme")!.knownConnectionIds).toContain("conn-1");
    });

    it("deduplicates connection IDs", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme" }));
      tracker.linkConnection("Acme", "conn-1");
      tracker.linkConnection("Acme", "conn-1");

      expect(tracker.getCompany("Acme")!.knownConnectionIds).toHaveLength(1);
    });

    it("ignores linkConnection for non-existent company", () => {
      const tracker = createCompanyTracker();
      // Should not throw
      tracker.linkConnection("Ghost", "conn-1");
      expect(tracker.getCompany("Ghost")).toBeUndefined();
    });

    it("adds multiple distinct connection IDs", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Acme" }));
      tracker.linkConnection("Acme", "conn-1");
      tracker.linkConnection("Acme", "conn-2");
      tracker.linkConnection("Acme", "conn-3");

      expect(tracker.getCompany("Acme")!.knownConnectionIds).toHaveLength(3);
    });
  });

  describe("serialisation (toJSON / fromJSON)", () => {
    it("round-trips all companies", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "A", industry: "tech" }));
      tracker.addCompany(makeCompany({ name: "B", industry: "fintech" }));
      tracker.addSignal("A", makeSignal({ summary: "funding" }));
      tracker.linkConnection("B", "conn-1");

      const snapshot = tracker.toJSON();
      expect(snapshot.companies).toHaveLength(2);

      const restored = createCompanyTracker();
      restored.fromJSON(snapshot);

      expect(restored.getAllCompanies()).toHaveLength(2);
      expect(restored.getCompany("A")!.recentSignals).toHaveLength(1);
      expect(restored.getCompany("B")!.knownConnectionIds).toContain("conn-1");
    });

    it("clears existing data on fromJSON", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Old" }));

      tracker.fromJSON({ companies: [makeCompany({ name: "New" })] });

      expect(tracker.getCompany("Old")).toBeUndefined();
      expect(tracker.getCompany("New")).toBeDefined();
    });

    it("handles empty companies array in fromJSON", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Existing" }));

      tracker.fromJSON({ companies: [] });
      expect(tracker.getAllCompanies()).toHaveLength(0);
    });

    it("lookup works correctly after fromJSON rebuild", () => {
      const tracker = createCompanyTracker();
      tracker.addCompany(makeCompany({ name: "Alpha Corp" }));

      const snapshot = tracker.toJSON();
      const restored = createCompanyTracker();
      restored.fromJSON(snapshot);

      // Case-insensitive lookup should work after restore
      expect(restored.getCompany("alpha corp")).toBeDefined();
      expect(restored.getCompany("ALPHA CORP")).toBeDefined();
    });
  });
});
