import { describe, it, expect, beforeEach } from "vitest";
import { createProfileEnricher, type ProfileEnricher } from "./enricher.js";
import { createProfileStore, type ProfileStore } from "./store.js";
import type { CareerProfile, CareerPreferences } from "./types.js";

function makeProfile(overrides: Partial<CareerProfile> = {}): CareerProfile {
  return {
    name: "Test User",
    headline: "Engineer",
    narrative: "Summary",
    targetRoles: ["SWE"],
    locationPreferences: ["Remote"],
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePreferences(overrides: Partial<CareerPreferences> = {}): CareerPreferences {
  return {
    roleTypes: ["Backend"],
    industries: ["Tech"],
    locationPreferences: [],
    dealBreakers: [],
    workStyle: "remote",
    companyStage: [],
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("createProfileEnricher", () => {
  let store: ProfileStore;
  let enricher: ProfileEnricher;

  beforeEach(() => {
    store = createProfileStore();
    enricher = createProfileEnricher(store);
  });

  // == detectProfileUpdates ==

  describe("detectProfileUpdates", () => {
    it("returns empty array for irrelevant messages", () => {
      const suggestions = enricher.detectProfileUpdates("Nice weather today");
      expect(suggestions).toEqual([]);
    });

    it("detects 'I am now working at' job change", () => {
      const suggestions = enricher.detectProfileUpdates("I'm now working at Google.");
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      const job = suggestions.find((s) => s.field === "workEntry");
      expect(job).toBeDefined();
      expect(job!.confidence).toBeGreaterThanOrEqual(0.7);
      expect(job!.source).toBe("conversation");
    });

    it("detects 'I just started at' with company and title parsing", () => {
      const suggestions = enricher.detectProfileUpdates(
        "I just started at Stripe as a Staff Engineer.",
      );
      const job = suggestions.find((s) => s.field === "workEntry");
      expect(job).toBeDefined();
      const value = job!.suggestedValue as { company: string; title?: string };
      // parseJobMention receives "at Stripe as a Staff Engineer" — "[company] as [title]" pattern extracts both
      expect(value.company).toContain("Stripe");
      expect(value.title).toBe("Staff Engineer");
    });

    it("detects 'I joined' pattern as a new role", () => {
      const suggestions = enricher.detectProfileUpdates("I joined Meta as a senior engineer.");
      const job = suggestions.find((s) => s.field === "workEntry");
      expect(job).toBeDefined();
      const value = job!.suggestedValue as { company: string; title?: string };
      expect(value.title).toBe("senior engineer");
    });

    it("detects 'I left' as workEntry.ended", () => {
      const suggestions = enricher.detectProfileUpdates("I left my job at Amazon.");
      const ended = suggestions.find((s) => s.field === "workEntry.ended");
      expect(ended).toBeDefined();
      const value = ended!.suggestedValue as { company: string };
      expect(value.company.toLowerCase()).toContain("amazon");
    });

    it("detects skill learning mentions", () => {
      const suggestions = enricher.detectProfileUpdates(
        "I've been learning Rust and Go for the past month.",
      );
      const skill = suggestions.find((s) => s.field === "skill");
      expect(skill).toBeDefined();
      const names = skill!.suggestedValue as string[];
      expect(names).toContain("Rust");
      expect(names).toContain("Go");
    });

    it("detects 'I am proficient in' skill pattern", () => {
      const suggestions = enricher.detectProfileUpdates("I'm proficient in Python and TypeScript.");
      const skill = suggestions.find((s) => s.field === "skill");
      expect(skill).toBeDefined();
      const names = skill!.suggestedValue as string[];
      expect(names.length).toBeGreaterThanOrEqual(2);
    });

    it("detects 'I know X daily' skill pattern", () => {
      const suggestions = enricher.detectProfileUpdates("I use Docker daily.");
      const skill = suggestions.find((s) => s.field === "skill");
      expect(skill).toBeDefined();
    });

    it("detects work style preference", () => {
      const suggestions = enricher.detectProfileUpdates("I prefer remote work.");
      const pref = suggestions.find((s) => s.field === "preferences.workStyle");
      expect(pref).toBeDefined();
      expect(pref!.suggestedValue).toBe("remote");
    });

    it("normalizes on-site to onsite", () => {
      const suggestions = enricher.detectProfileUpdates("I want on-site work.");
      const pref = suggestions.find((s) => s.field === "preferences.workStyle");
      expect(pref).toBeDefined();
      expect(pref!.suggestedValue).toBe("onsite");
    });

    it("detects role type interest", () => {
      const suggestions = enricher.detectProfileUpdates(
        "I'm looking for backend and infrastructure roles.",
      );
      const pref = suggestions.find((s) => s.field === "preferences.roleTypes");
      expect(pref).toBeDefined();
      expect(Array.isArray(pref!.suggestedValue)).toBe(true);
    });

    it("detects deal breakers", () => {
      const suggestions = enricher.detectProfileUpdates("I won't consider unpaid internships.");
      const pref = suggestions.find((s) => s.field === "preferences.dealBreakers");
      expect(pref).toBeDefined();
    });

    it("detects location", () => {
      const suggestions = enricher.detectProfileUpdates("I'm based in San Francisco.");
      const loc = suggestions.find((s) => s.field === "profile.locationPreferences");
      expect(loc).toBeDefined();
      const value = loc!.suggestedValue as string[];
      expect(value).toContain("San Francisco");
    });

    it("can detect multiple patterns from a single message", () => {
      const suggestions = enricher.detectProfileUpdates(
        "I'm now working at Stripe. I've been learning Kubernetes and Terraform for a while. I prefer remote work.",
      );
      const fields = suggestions.map((s) => s.field);
      expect(fields).toContain("workEntry");
      expect(fields).toContain("skill");
      expect(fields).toContain("preferences.workStyle");
    });
  });

  // == applyUpdate ==

  describe("applyUpdate", () => {
    it("applies a workEntry suggestion by adding a work entry", () => {
      enricher.applyUpdate({
        field: "workEntry",
        currentValue: [],
        suggestedValue: { company: "Acme", title: "Engineer" },
        confidence: 0.8,
        source: "conversation",
      });

      const entries = store.getWorkEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].company).toBe("Acme");
      expect(entries[0].title).toBe("Engineer");
      expect(entries[0].startDate).toMatch(/^\d{4}-\d{2}$/);
    });

    it("applies workEntry.ended by setting endDate on matching entry", () => {
      store.addWorkEntry({
        company: "OldCo",
        title: "Dev",
        startDate: "2023-01",
        description: "",
        skills: [],
        achievements: [],
      });

      enricher.applyUpdate({
        field: "workEntry.ended",
        currentValue: null,
        suggestedValue: { company: "OldCo" },
        confidence: 0.8,
        source: "conversation",
      });

      const entries = store.getWorkEntries();
      expect(entries[0].endDate).toMatch(/^\d{4}-\d{2}$/);
    });

    it("workEntry.ended does not set endDate on already-ended entries", () => {
      store.addWorkEntry({
        company: "OldCo",
        title: "Dev",
        startDate: "2023-01",
        endDate: "2024-01",
        description: "",
        skills: [],
        achievements: [],
      });

      enricher.applyUpdate({
        field: "workEntry.ended",
        currentValue: null,
        suggestedValue: { company: "OldCo" },
        confidence: 0.8,
        source: "conversation",
      });

      // endDate should remain unchanged
      expect(store.getWorkEntries()[0].endDate).toBe("2024-01");
    });

    it("applies new skill suggestions", () => {
      enricher.applyUpdate({
        field: "skill",
        currentValue: [],
        suggestedValue: ["Rust", "Go"],
        confidence: 0.7,
        source: "conversation",
      });

      expect(store.getSkills()).toHaveLength(2);
      expect(store.findSkill("Rust")).toBeDefined();
      expect(store.findSkill("Rust")!.proficiency).toBe(0.5);
      expect(store.findSkill("Rust")!.sources).toContain("conversation");
    });

    it("bumps proficiency for existing skills by 0.1", () => {
      store.addSkill({
        name: "Python",
        category: "language",
        proficiency: 0.6,
        sources: ["resume"],
      });

      enricher.applyUpdate({
        field: "skill",
        currentValue: null,
        suggestedValue: ["Python"],
        confidence: 0.7,
        source: "conversation",
      });

      expect(store.findSkill("Python")!.proficiency).toBeCloseTo(0.7, 1);
    });

    it("skill proficiency bump does not exceed 1.0", () => {
      store.addSkill({
        name: "Python",
        category: "language",
        proficiency: 0.95,
        sources: ["resume"],
      });

      enricher.applyUpdate({
        field: "skill",
        currentValue: null,
        suggestedValue: ["Python"],
        confidence: 0.7,
        source: "conversation",
      });

      expect(store.findSkill("Python")!.proficiency).toBeLessThanOrEqual(1);
    });

    it("applies work style to existing preferences", () => {
      store.setPreferences(makePreferences({ workStyle: "onsite" }));

      enricher.applyUpdate({
        field: "preferences.workStyle",
        currentValue: "onsite",
        suggestedValue: "hybrid",
        confidence: 0.8,
        source: "conversation",
      });

      expect(store.getPreferences()!.workStyle).toBe("hybrid");
    });

    it("creates new preferences when applying workStyle with none set", () => {
      enricher.applyUpdate({
        field: "preferences.workStyle",
        currentValue: null,
        suggestedValue: "remote",
        confidence: 0.8,
        source: "conversation",
      });

      expect(store.getPreferences()).not.toBeNull();
      expect(store.getPreferences()!.workStyle).toBe("remote");
    });

    it("applies roleTypes by merging with existing", () => {
      store.setPreferences(makePreferences({ roleTypes: ["Backend"] }));

      enricher.applyUpdate({
        field: "preferences.roleTypes",
        currentValue: null,
        suggestedValue: ["Frontend", "Backend"],
        confidence: 0.75,
        source: "conversation",
      });

      const roles = store.getPreferences()!.roleTypes;
      expect(roles).toContain("Backend");
      expect(roles).toContain("Frontend");
      // No duplicates
      expect(roles.filter((r) => r === "Backend")).toHaveLength(1);
    });

    it("applies dealBreakers by merging with existing", () => {
      store.setPreferences(makePreferences({ dealBreakers: ["no equity"] }));

      enricher.applyUpdate({
        field: "preferences.dealBreakers",
        currentValue: null,
        suggestedValue: ["unpaid work"],
        confidence: 0.7,
        source: "conversation",
      });

      const breakers = store.getPreferences()!.dealBreakers;
      expect(breakers).toContain("no equity");
      expect(breakers).toContain("unpaid work");
    });

    it("applies location preferences to existing profile", () => {
      store.setProfile(makeProfile({ locationPreferences: ["NYC"] }));

      enricher.applyUpdate({
        field: "profile.locationPreferences",
        currentValue: null,
        suggestedValue: ["San Francisco"],
        confidence: 0.8,
        source: "conversation",
      });

      const locs = store.getProfile()!.locationPreferences;
      expect(locs).toContain("NYC");
      expect(locs).toContain("San Francisco");
    });

    it("filters out non-string values from skill arrays", () => {
      enricher.applyUpdate({
        field: "skill",
        currentValue: [],
        suggestedValue: ["ValidSkill", 42, null, "AnotherSkill"],
        confidence: 0.7,
        source: "conversation",
      });

      const skills = store.getSkills();
      expect(skills).toHaveLength(2);
    });
  });

  // == getGaps ==

  describe("getGaps", () => {
    it("reports all gaps for a completely empty profile", () => {
      const gaps = enricher.getGaps();
      expect(gaps).toContain("No basic profile set (name, headline, narrative)");
      expect(gaps).toContain("No work history entries");
      expect(gaps).toContain("No skills listed");
      expect(gaps).toContain("No projects listed");
      expect(gaps).toContain("No education entries");
      expect(gaps).toContain("No career preferences set (role types, work style, industries)");
    });

    it("reports missing headline when profile is set but headline is empty", () => {
      store.setProfile(makeProfile({ headline: "" }));
      const gaps = enricher.getGaps();
      expect(gaps).toContain("Missing headline");
    });

    it("reports missing narrative", () => {
      store.setProfile(makeProfile({ narrative: "" }));
      const gaps = enricher.getGaps();
      expect(gaps).toContain("Missing career narrative/summary");
    });

    it("reports no target roles", () => {
      store.setProfile(makeProfile({ targetRoles: [] }));
      const gaps = enricher.getGaps();
      expect(gaps).toContain("No target roles specified");
    });

    it("reports no current role when all work entries have endDate", () => {
      store.addWorkEntry({
        company: "OldCo",
        title: "Dev",
        startDate: "2020-01",
        endDate: "2023-01",
        description: "",
        skills: [],
        achievements: [],
      });
      const gaps = enricher.getGaps();
      expect(gaps).toContain("No current role listed");
    });

    it("does not report no current role when one entry lacks endDate", () => {
      store.addWorkEntry({
        company: "CurrentCo",
        title: "Dev",
        startDate: "2023-01",
        description: "",
        skills: [],
        achievements: [],
      });
      const gaps = enricher.getGaps();
      expect(gaps).not.toContain("No current role listed");
    });

    it("reports entries missing achievements with correct pluralization", () => {
      store.addWorkEntry({
        company: "A",
        title: "X",
        startDate: "2020",
        description: "",
        skills: [],
        achievements: [],
      });
      const gaps = enricher.getGaps();
      expect(gaps).toContain("1 work entry missing achievements");
    });

    it("uses plural for multiple entries missing achievements", () => {
      store.addWorkEntry({
        company: "A",
        title: "X",
        startDate: "2020",
        description: "",
        skills: [],
        achievements: [],
      });
      store.addWorkEntry({
        company: "B",
        title: "Y",
        startDate: "2021",
        description: "",
        skills: [],
        achievements: [],
      });
      const gaps = enricher.getGaps();
      expect(gaps).toContain("2 work entries missing achievements");
    });

    it("reports 'very few skills' for less than 5", () => {
      for (let i = 0; i < 3; i++) {
        store.addSkill({
          name: `Skill${i}`,
          category: "language",
          proficiency: 0.5,
          sources: ["test"],
        });
      }
      const gaps = enricher.getGaps();
      expect(gaps).toContain("Very few skills listed (less than 5)");
    });

    it("does not report few skills when 5 or more are present", () => {
      for (let i = 0; i < 5; i++) {
        store.addSkill({
          name: `Skill${i}`,
          category: "language",
          proficiency: 0.5,
          sources: ["test"],
        });
      }
      const gaps = enricher.getGaps();
      expect(gaps).not.toContain("Very few skills listed (less than 5)");
      expect(gaps).not.toContain("No skills listed");
    });

    it("reports no preferred role types / industries when preferences are set but empty", () => {
      store.setPreferences(makePreferences({ roleTypes: [], industries: [] }));
      const gaps = enricher.getGaps();
      expect(gaps).toContain("No preferred role types");
      expect(gaps).toContain("No preferred industries");
    });

    it("returns no gaps for a fully populated profile", () => {
      store.setProfile(makeProfile());
      store.addWorkEntry({
        company: "Co",
        title: "Eng",
        startDate: "2023",
        description: "",
        skills: [],
        achievements: ["Shipped feature"],
      });
      for (let i = 0; i < 5; i++) {
        store.addSkill({
          name: `Skill${i}`,
          category: "language",
          proficiency: 0.5,
          sources: ["test"],
        });
      }
      store.addProject({
        name: "P",
        description: "D",
        techStack: [],
        role: "Owner",
      });
      store.addEducation({
        institution: "Uni",
        degree: "BS",
        field: "CS",
        startDate: "2015",
      });
      store.setPreferences(makePreferences());

      const gaps = enricher.getGaps();
      expect(gaps).toHaveLength(0);
    });
  });
});
