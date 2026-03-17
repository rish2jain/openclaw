/**
 * In-memory profile store with serialization support.
 * Factory-based design: call createProfileStore() to get a store instance.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type {
  CareerProfile,
  WorkEntry,
  Skill,
  Project,
  Education,
  CareerPreferences,
  FullProfile,
  SerializedProfile,
} from "./types.js";

const log = createSubsystemLogger("career/profile/store");

export type ProfileStore = {
  // Profile CRUD
  getProfile: () => CareerProfile | null;
  setProfile: (profile: CareerProfile) => void;
  updateProfile: (partial: Partial<CareerProfile>) => void;

  // Work entries
  getWorkEntries: () => WorkEntry[];
  addWorkEntry: (entry: WorkEntry) => void;
  updateWorkEntry: (index: number, entry: Partial<WorkEntry>) => boolean;
  removeWorkEntry: (index: number) => boolean;

  // Skills
  getSkills: () => Skill[];
  addSkill: (skill: Skill) => void;
  /** Find a skill by name (case-insensitive). */
  findSkill: (name: string) => Skill | undefined;
  updateSkillProficiency: (name: string, proficiency: number) => boolean;
  removeSkill: (name: string) => boolean;

  // Projects
  getProjects: () => Project[];
  addProject: (project: Project) => void;
  updateProject: (index: number, project: Partial<Project>) => boolean;
  removeProject: (index: number) => boolean;

  // Education
  getEducation: () => Education[];
  addEducation: (entry: Education) => void;
  updateEducation: (index: number, entry: Partial<Education>) => boolean;
  removeEducation: (index: number) => boolean;

  // Preferences
  getPreferences: () => CareerPreferences | null;
  setPreferences: (prefs: CareerPreferences) => void;
  updatePreferences: (partial: Partial<CareerPreferences>) => void;

  // Aggregation
  getFullProfile: () => FullProfile;

  // Serialization
  toJSON: () => SerializedProfile;
  fromJSON: (data: SerializedProfile) => void;
};

export function createProfileStore(): ProfileStore {
  let profile: CareerProfile | null = null;
  let workEntries: WorkEntry[] = [];
  let skills: Skill[] = [];
  let projects: Project[] = [];
  let education: Education[] = [];
  let preferences: CareerPreferences | null = null;

  function clampProficiency(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  const store: ProfileStore = {
    // -- Profile --
    getProfile: () => (profile ? { ...profile } : null),

    setProfile: (p) => {
      profile = { ...p };
      log.info("Profile set", { name: p.name });
    },

    updateProfile: (partial) => {
      if (!profile) {
        log.warn("Cannot update profile: no profile set");
        return;
      }
      profile = { ...profile, ...partial, updatedAt: new Date() };
      log.info("Profile updated");
    },

    // -- Work Entries --
    getWorkEntries: () => workEntries.map((e) => ({ ...e })),

    addWorkEntry: (entry) => {
      workEntries.push({ ...entry });
      log.info("Added work entry", { title: entry.title, company: entry.company });
    },

    updateWorkEntry: (index, partial) => {
      if (index < 0 || index >= workEntries.length) {
        return false;
      }
      workEntries[index] = { ...workEntries[index], ...partial };
      return true;
    },

    removeWorkEntry: (index) => {
      if (index < 0 || index >= workEntries.length) {
        return false;
      }
      workEntries.splice(index, 1);
      return true;
    },

    // -- Skills --
    getSkills: () => skills.map((s) => ({ ...s })),

    addSkill: (skill) => {
      const existing = skills.find((s) => s.name.toLowerCase() === skill.name.toLowerCase());
      if (existing) {
        // Merge: take higher proficiency, union sources
        existing.proficiency = Math.max(existing.proficiency, skill.proficiency);
        const sourceSet = new Set([...existing.sources, ...skill.sources]);
        existing.sources = [...sourceSet];
        if (skill.lastUsed) {
          existing.lastUsed = skill.lastUsed;
        }
        log.info("Merged skill", { name: skill.name });
        return;
      }
      skills.push({
        ...skill,
        proficiency: clampProficiency(skill.proficiency),
      });
      log.info("Added skill", { name: skill.name });
    },

    findSkill: (name) => skills.find((s) => s.name.toLowerCase() === name.toLowerCase()),

    updateSkillProficiency: (name, proficiency) => {
      const skill = skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (!skill) {
        return false;
      }
      skill.proficiency = clampProficiency(proficiency);
      log.info("Updated proficiency", { name, proficiency: skill.proficiency });
      return true;
    },

    removeSkill: (name) => {
      const index = skills.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
      if (index === -1) {
        return false;
      }
      skills.splice(index, 1);
      return true;
    },

    // -- Projects --
    getProjects: () => projects.map((p) => ({ ...p })),

    addProject: (project) => {
      projects.push({ ...project });
      log.info("Added project", { name: project.name });
    },

    updateProject: (index, partial) => {
      if (index < 0 || index >= projects.length) {
        return false;
      }
      projects[index] = { ...projects[index], ...partial };
      return true;
    },

    removeProject: (index) => {
      if (index < 0 || index >= projects.length) {
        return false;
      }
      projects.splice(index, 1);
      return true;
    },

    // -- Education --
    getEducation: () => education.map((e) => ({ ...e })),

    addEducation: (entry) => {
      education.push({ ...entry });
      log.info("Added education", { degree: entry.degree, institution: entry.institution });
    },

    updateEducation: (index, partial) => {
      if (index < 0 || index >= education.length) {
        return false;
      }
      education[index] = { ...education[index], ...partial };
      return true;
    },

    removeEducation: (index) => {
      if (index < 0 || index >= education.length) {
        return false;
      }
      education.splice(index, 1);
      return true;
    },

    // -- Preferences --
    getPreferences: () => (preferences ? { ...preferences } : null),

    setPreferences: (prefs) => {
      preferences = { ...prefs };
      log.info("Preferences set");
    },

    updatePreferences: (partial) => {
      if (!preferences) {
        log.warn("Cannot update preferences: none set");
        return;
      }
      preferences = { ...preferences, ...partial, updatedAt: new Date() };
      log.info("Preferences updated");
    },

    // -- Aggregation --
    getFullProfile: () => ({
      profile: store.getProfile(),
      workEntries: store.getWorkEntries(),
      skills: store.getSkills(),
      projects: store.getProjects(),
      education: store.getEducation(),
      preferences: store.getPreferences(),
    }),

    // -- Serialization --
    toJSON: () => ({
      profile: profile ? { ...profile, updatedAt: profile.updatedAt.toISOString() } : null,
      workEntries: workEntries.map((e) => ({ ...e })),
      skills: skills.map((s) => ({ ...s })),
      projects: projects.map((p) => ({ ...p })),
      education: education.map((e) => ({ ...e })),
      preferences: preferences
        ? { ...preferences, updatedAt: preferences.updatedAt.toISOString() }
        : null,
    }),

    fromJSON: (data) => {
      profile = data.profile
        ? { ...data.profile, updatedAt: new Date(data.profile.updatedAt) }
        : null;
      workEntries = data.workEntries.map((e) => ({ ...e }));
      skills = data.skills.map((s) => ({ ...s }));
      projects = data.projects.map((p) => ({ ...p }));
      education = data.education.map((e) => ({ ...e }));
      preferences = data.preferences
        ? {
            ...data.preferences,
            updatedAt: new Date(data.preferences.updatedAt),
          }
        : null;
      log.info("Profile loaded from JSON");
    },
  };

  return store;
}
