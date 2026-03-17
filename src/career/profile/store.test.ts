import { describe, it, expect, beforeEach } from "vitest";
import { createProfileStore, type ProfileStore } from "./store.js";
import type {
  CareerProfile,
  Skill,
  WorkEntry,
  Project,
  Education,
  CareerPreferences,
  SerializedProfile,
} from "./types.js";

// -- Fixtures --

function makeProfile(overrides: Partial<CareerProfile> = {}): CareerProfile {
  return {
    name: "Ada Lovelace",
    headline: "Software Engineer",
    narrative: "Experienced developer",
    targetRoles: ["Senior Engineer"],
    locationPreferences: ["Remote"],
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "TypeScript",
    category: "language",
    proficiency: 0.8,
    sources: ["resume"],
    ...overrides,
  };
}

function makeWorkEntry(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    company: "Acme Corp",
    title: "Engineer",
    startDate: "2023-01",
    description: "Built things",
    skills: ["TypeScript"],
    achievements: ["Shipped v2"],
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    name: "OpenWidget",
    description: "An open source widget",
    techStack: ["TypeScript", "React"],
    role: "Owner",
    ...overrides,
  };
}

function makeEducation(overrides: Partial<Education> = {}): Education {
  return {
    institution: "MIT",
    degree: "BS",
    field: "Computer Science",
    startDate: "2015",
    endDate: "2019",
    ...overrides,
  };
}

function makePreferences(overrides: Partial<CareerPreferences> = {}): CareerPreferences {
  return {
    roleTypes: ["Backend"],
    industries: ["Tech"],
    dealBreakers: [],
    workStyle: "remote",
    companyStage: ["Series A"],
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

describe("createProfileStore", () => {
  let store: ProfileStore;

  beforeEach(() => {
    store = createProfileStore();
  });

  // == Profile CRUD ==

  describe("profile", () => {
    it("returns null when no profile is set", () => {
      expect(store.getProfile()).toBeNull();
    });

    it("set and get returns a copy", () => {
      const p = makeProfile();
      store.setProfile(p);
      const got = store.getProfile()!;
      expect(got.name).toBe("Ada Lovelace");
      // Mutation of the returned value should not affect the store
      got.name = "Mutated";
      expect(store.getProfile()!.name).toBe("Ada Lovelace");
    });

    it("updateProfile merges fields and bumps updatedAt", () => {
      store.setProfile(makeProfile());
      const before = store.getProfile()!.updatedAt;
      store.updateProfile({ headline: "Staff Engineer" });
      const after = store.getProfile()!;
      expect(after.headline).toBe("Staff Engineer");
      expect(after.name).toBe("Ada Lovelace"); // unchanged
      expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it("updateProfile is a no-op when no profile is set", () => {
      store.updateProfile({ headline: "Nope" });
      expect(store.getProfile()).toBeNull();
    });
  });

  // == Skills ==

  describe("skills", () => {
    it("addSkill stores a new skill with clamped proficiency", () => {
      store.addSkill(makeSkill({ proficiency: 1.5 }));
      expect(store.getSkills()).toHaveLength(1);
      expect(store.getSkills()[0].proficiency).toBe(1);
    });

    it("addSkill clamps negative proficiency to 0", () => {
      store.addSkill(makeSkill({ proficiency: -0.3 }));
      expect(store.getSkills()[0].proficiency).toBe(0);
    });

    it("addSkill merges duplicate (case-insensitive) by taking higher proficiency and unioning sources", () => {
      store.addSkill(makeSkill({ name: "TypeScript", proficiency: 0.6, sources: ["resume"] }));
      store.addSkill(makeSkill({ name: "typescript", proficiency: 0.9, sources: ["github"] }));

      const skills = store.getSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0].proficiency).toBe(0.9);
      expect(skills[0].sources).toContain("resume");
      expect(skills[0].sources).toContain("github");
    });

    it("findSkill is case-insensitive", () => {
      store.addSkill(makeSkill({ name: "React" }));
      expect(store.findSkill("react")).toBeDefined();
      expect(store.findSkill("REACT")).toBeDefined();
      expect(store.findSkill("Vue")).toBeUndefined();
    });

    it("updateSkillProficiency clamps to [0, 1]", () => {
      store.addSkill(makeSkill({ name: "Go", proficiency: 0.5 }));

      expect(store.updateSkillProficiency("Go", 2)).toBe(true);
      expect(store.findSkill("Go")!.proficiency).toBe(1);

      expect(store.updateSkillProficiency("Go", -1)).toBe(true);
      expect(store.findSkill("Go")!.proficiency).toBe(0);
    });

    it("updateSkillProficiency returns false for unknown skill", () => {
      expect(store.updateSkillProficiency("Nonexistent", 0.5)).toBe(false);
    });

    it("removeSkill removes by case-insensitive name", () => {
      store.addSkill(makeSkill({ name: "Rust" }));
      expect(store.removeSkill("RUST")).toBe(true);
      expect(store.getSkills()).toHaveLength(0);
    });

    it("removeSkill returns false for unknown skill", () => {
      expect(store.removeSkill("Nonexistent")).toBe(false);
    });
  });

  // == Work Entries ==

  describe("workEntries", () => {
    it("add, get, and returns copies", () => {
      const entry = makeWorkEntry();
      store.addWorkEntry(entry);
      const entries = store.getWorkEntries();
      expect(entries).toHaveLength(1);
      entries[0].company = "Mutated";
      expect(store.getWorkEntries()[0].company).toBe("Acme Corp");
    });

    it("updateWorkEntry returns false for out-of-bounds index", () => {
      expect(store.updateWorkEntry(-1, { title: "x" })).toBe(false);
      expect(store.updateWorkEntry(0, { title: "x" })).toBe(false);
    });

    it("updateWorkEntry merges partial fields", () => {
      store.addWorkEntry(makeWorkEntry());
      expect(store.updateWorkEntry(0, { title: "Lead Engineer" })).toBe(true);
      expect(store.getWorkEntries()[0].title).toBe("Lead Engineer");
      expect(store.getWorkEntries()[0].company).toBe("Acme Corp");
    });

    it("removeWorkEntry returns false for out-of-bounds", () => {
      expect(store.removeWorkEntry(0)).toBe(false);
      expect(store.removeWorkEntry(-1)).toBe(false);
    });

    it("removeWorkEntry removes by index", () => {
      store.addWorkEntry(makeWorkEntry({ company: "A" }));
      store.addWorkEntry(makeWorkEntry({ company: "B" }));
      expect(store.removeWorkEntry(0)).toBe(true);
      expect(store.getWorkEntries()).toHaveLength(1);
      expect(store.getWorkEntries()[0].company).toBe("B");
    });
  });

  // == Projects ==

  describe("projects", () => {
    it("addProject and getProjects return copies", () => {
      store.addProject(makeProject());
      const projects = store.getProjects();
      projects[0].name = "Mutated";
      expect(store.getProjects()[0].name).toBe("OpenWidget");
    });

    it("updateProject returns false for invalid index", () => {
      expect(store.updateProject(0, {})).toBe(false);
    });

    it("removeProject removes and shifts", () => {
      store.addProject(makeProject({ name: "A" }));
      store.addProject(makeProject({ name: "B" }));
      expect(store.removeProject(0)).toBe(true);
      expect(store.getProjects()[0].name).toBe("B");
    });
  });

  // == Education ==

  describe("education", () => {
    it("addEducation and getEducation return copies", () => {
      store.addEducation(makeEducation());
      const edu = store.getEducation();
      edu[0].institution = "Mutated";
      expect(store.getEducation()[0].institution).toBe("MIT");
    });

    it("updateEducation returns false for invalid index", () => {
      expect(store.updateEducation(5, {})).toBe(false);
    });

    it("removeEducation returns false for empty list", () => {
      expect(store.removeEducation(0)).toBe(false);
    });
  });

  // == Preferences ==

  describe("preferences", () => {
    it("returns null when none set", () => {
      expect(store.getPreferences()).toBeNull();
    });

    it("set and get returns a copy", () => {
      const prefs = makePreferences();
      store.setPreferences(prefs);
      const got = store.getPreferences()!;
      got.workStyle = "onsite";
      expect(store.getPreferences()!.workStyle).toBe("remote");
    });

    it("updatePreferences merges and bumps updatedAt", () => {
      store.setPreferences(makePreferences());
      store.updatePreferences({ workStyle: "hybrid" });
      expect(store.getPreferences()!.workStyle).toBe("hybrid");
      expect(store.getPreferences()!.industries).toEqual(["Tech"]);
    });

    it("updatePreferences is a no-op when none set", () => {
      store.updatePreferences({ workStyle: "hybrid" });
      expect(store.getPreferences()).toBeNull();
    });
  });

  // == getFullProfile ==

  describe("getFullProfile", () => {
    it("returns all sections aggregated", () => {
      store.setProfile(makeProfile());
      store.addWorkEntry(makeWorkEntry());
      store.addSkill(makeSkill());
      store.addProject(makeProject());
      store.addEducation(makeEducation());
      store.setPreferences(makePreferences());

      const full = store.getFullProfile();
      expect(full.profile).not.toBeNull();
      expect(full.workEntries).toHaveLength(1);
      expect(full.skills).toHaveLength(1);
      expect(full.projects).toHaveLength(1);
      expect(full.education).toHaveLength(1);
      expect(full.preferences).not.toBeNull();
    });

    it("returns nulls and empty arrays for empty store", () => {
      const full = store.getFullProfile();
      expect(full.profile).toBeNull();
      expect(full.workEntries).toEqual([]);
      expect(full.skills).toEqual([]);
      expect(full.projects).toEqual([]);
      expect(full.education).toEqual([]);
      expect(full.preferences).toBeNull();
    });
  });

  // == Serialization ==

  describe("toJSON / fromJSON", () => {
    it("round-trips all data through JSON", () => {
      store.setProfile(makeProfile());
      store.addWorkEntry(makeWorkEntry());
      store.addSkill(makeSkill());
      store.addProject(makeProject());
      store.addEducation(makeEducation());
      store.setPreferences(makePreferences());

      const json = store.toJSON();

      const store2 = createProfileStore();
      store2.fromJSON(json);

      const full = store2.getFullProfile();
      expect(full.profile!.name).toBe("Ada Lovelace");
      expect(full.workEntries).toHaveLength(1);
      expect(full.skills).toHaveLength(1);
      expect(full.projects).toHaveLength(1);
      expect(full.education).toHaveLength(1);
      expect(full.preferences!.workStyle).toBe("remote");
    });

    it("toJSON converts updatedAt to ISO string", () => {
      store.setProfile(makeProfile({ updatedAt: new Date("2025-06-15T12:00:00Z") }));
      const json = store.toJSON();
      expect(json.profile!.updatedAt).toBe("2025-06-15T12:00:00.000Z");
    });

    it("fromJSON converts ISO string back to Date", () => {
      const json: SerializedProfile = {
        profile: {
          name: "Test",
          headline: "H",
          narrative: "N",
          targetRoles: [],
          locationPreferences: [],
          updatedAt: "2025-06-15T12:00:00.000Z",
        },
        workEntries: [],
        skills: [],
        projects: [],
        education: [],
        preferences: null,
      };
      store.fromJSON(json);
      expect(store.getProfile()!.updatedAt).toBeInstanceOf(Date);
      expect(store.getProfile()!.updatedAt.toISOString()).toBe("2025-06-15T12:00:00.000Z");
    });

    it("fromJSON handles null profile and preferences", () => {
      const json: SerializedProfile = {
        profile: null,
        workEntries: [],
        skills: [],
        projects: [],
        education: [],
        preferences: null,
      };
      store.fromJSON(json);
      expect(store.getProfile()).toBeNull();
      expect(store.getPreferences()).toBeNull();
    });

    it("toJSON throws on invalid updatedAt (Date.toISOString rejects invalid dates)", () => {
      store.setProfile(makeProfile({ updatedAt: new Date("invalid") }));
      expect(() => store.toJSON()).toThrow();
    });
  });
});
