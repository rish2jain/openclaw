/**
 * Conversational profile enricher.
 * Detects profile-relevant updates from natural language messages
 * and suggests structured changes to the profile store.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { inferSkillCategory } from "./infer-skill-category.js";
import type { ProfileStore } from "./store.js";
import type { ProfileUpdateSuggestion } from "./types.js";

const log = createSubsystemLogger("career/profile/enricher");

export type ProfileEnricher = {
  /** Analyze a message for profile-relevant information. */
  detectProfileUpdates: (message: string) => ProfileUpdateSuggestion[];
  /** Apply a detected update to the store. */
  applyUpdate: (suggestion: ProfileUpdateSuggestion) => void;
  /** Identify gaps in the current profile. */
  getGaps: () => string[];
};

/** Pattern definitions for detecting profile-relevant content. */
type DetectionPattern = {
  pattern: RegExp;
  field: string;
  extract: (
    match: RegExpMatchArray,
    message: string,
  ) => {
    suggestedValue: unknown;
    confidence: number;
  };
};

const JOB_CHANGE_PATTERNS: DetectionPattern[] = [
  {
    pattern: /(?:I(?:'m| am)\s+(?:now|currently)\s+(?:working\s+(?:at|for)|a)\s+)(.+?)(?:\.|,|$)/i,
    field: "workEntry",
    extract: (match) => ({
      suggestedValue: parseJobMention(match[1]),
      confidence: 0.8,
    }),
  },
  {
    pattern:
      /(?:I\s+(?:just\s+)?(?:started|joined|accepted|got\s+(?:a|the)\s+(?:job|offer|position)\s+(?:at|with)))\s+(.+?)(?:\.|,|$)/i,
    field: "workEntry",
    extract: (match) => ({
      suggestedValue: parseJobMention(match[1]),
      confidence: 0.85,
    }),
  },
  {
    pattern:
      /(?:I\s+(?:left|quit|resigned|was\s+laid\s+off)\s+(?:from\s+)?(?:my\s+(?:job|position|role)\s+(?:at|with)\s+)?)(.+?)(?:\.|,|$)/i,
    field: "workEntry.ended",
    extract: (match) => ({
      suggestedValue: { company: match[1].trim() },
      confidence: 0.8,
    }),
  },
];

const SKILL_PATTERNS: DetectionPattern[] = [
  {
    pattern:
      /(?:I(?:'ve| have)\s+been\s+(?:learning|studying|using|working\s+with))\s+(.+?)(?:\s+(?:for|lately|recently)|\.|,|$)/i,
    field: "skill",
    extract: (match) => ({
      suggestedValue: extractSkillNames(match[1]),
      confidence: 0.7,
    }),
  },
  {
    pattern:
      /(?:I(?:'m| am)\s+(?:proficient|experienced|skilled|expert)\s+(?:in|with|at))\s+(.+?)(?:\.|,|$)/i,
    field: "skill",
    extract: (match) => ({
      suggestedValue: extractSkillNames(match[1]),
      confidence: 0.75,
    }),
  },
  {
    pattern:
      /(?:I\s+(?:know|use|work\s+with))\s+(.+?)(?:\s+(?:daily|regularly|often|extensively)|\.|,|$)/i,
    field: "skill",
    extract: (match) => ({
      suggestedValue: extractSkillNames(match[1]),
      confidence: 0.65,
    }),
  },
];

const PREFERENCE_PATTERNS: DetectionPattern[] = [
  {
    pattern:
      /(?:I(?:'m| am)\s+(?:looking\s+for|interested\s+in|open\s+to))\s+(.+?)(?:\s+(?:roles?|positions?|jobs?|opportunities?))?(?:\.|,|$)/i,
    field: "preferences.roleTypes",
    extract: (match) => ({
      suggestedValue: match[1].split(/,\s*|\s+and\s+|\s+or\s+/).map((s) => s.trim()),
      confidence: 0.75,
    }),
  },
  {
    pattern:
      /(?:I\s+(?:prefer|want|need)\s+)?(remote|hybrid|onsite|on-site|flexible)\s+(?:work|position|role)?/i,
    field: "preferences.workStyle",
    extract: (match) => ({
      suggestedValue: match[1].toLowerCase().replace("on-site", "onsite"),
      confidence: 0.8,
    }),
  },
  {
    pattern:
      /(?:I\s+(?:don't|do\s+not|won't|will\s+not)\s+(?:want|accept|consider))\s+(.+?)(?:\.|,|$)/i,
    field: "preferences.dealBreakers",
    extract: (match) => ({
      suggestedValue: [match[1].trim()],
      confidence: 0.7,
    }),
  },
];

const LOCATION_PATTERNS: DetectionPattern[] = [
  {
    pattern:
      /(?:I(?:'m| am)\s+(?:based\s+in|located\s+in|living\s+in|moving\s+to))\s+(.+?)(?:\.|,|$)/i,
    field: "profile.locationPreferences",
    extract: (match) => ({
      suggestedValue: [match[1].trim()],
      confidence: 0.8,
    }),
  },
];

const ALL_PATTERNS: DetectionPattern[] = [
  ...JOB_CHANGE_PATTERNS,
  ...SKILL_PATTERNS,
  ...PREFERENCE_PATTERNS,
  ...LOCATION_PATTERNS,
];

export function createProfileEnricher(store: ProfileStore): ProfileEnricher {
  return {
    detectProfileUpdates(message: string): ProfileUpdateSuggestion[] {
      const suggestions: ProfileUpdateSuggestion[] = [];

      for (const detector of ALL_PATTERNS) {
        const match = message.match(detector.pattern);
        if (!match) {
          continue;
        }

        const { suggestedValue, confidence } = detector.extract(match, message);

        // Look up current value for context
        const currentValue = getCurrentValue(store, detector.field);

        suggestions.push({
          field: detector.field,
          currentValue,
          suggestedValue,
          confidence,
          source: "conversation",
        });
      }

      log.info(`Detected ${suggestions.length} profile update suggestions`);
      return suggestions;
    },

    applyUpdate(suggestion: ProfileUpdateSuggestion): void {
      const { field, suggestedValue } = suggestion;

      if (field === "workEntry" && isJobMention(suggestedValue)) {
        store.addWorkEntry({
          company: suggestedValue.company,
          title: suggestedValue.title ?? "",
          startDate: new Date().toISOString().slice(0, 7),
          description: "",
          skills: [],
          achievements: [],
        });
        log.info("Applied work entry update", { company: suggestedValue.company });
        return;
      }

      if (field === "workEntry.ended" && isCompanyRef(suggestedValue)) {
        const entries = store.getWorkEntries();
        const idx = entries.findIndex(
          (e) =>
            e.company.toLowerCase().includes(suggestedValue.company.toLowerCase()) && !e.endDate,
        );
        if (idx >= 0) {
          store.updateWorkEntry(idx, {
            endDate: new Date().toISOString().slice(0, 7),
          });
          log.info("Marked end date", { company: suggestedValue.company });
        }
        return;
      }

      if (field === "skill" && Array.isArray(suggestedValue)) {
        for (const name of suggestedValue) {
          if (typeof name !== "string") {
            continue;
          }
          const existing = store.findSkill(name);
          if (existing) {
            // Bump proficiency slightly when user mentions they use a skill
            const newProf = Math.min(1, existing.proficiency + 0.1);
            store.updateSkillProficiency(name, newProf);
          } else {
            store.addSkill({
              name,
              category: inferSkillCategory(name),
              proficiency: 0.5,
              sources: ["conversation"],
            });
          }
        }
        log.info("Applied skill updates", { skills: suggestedValue });
        return;
      }

      if (field === "preferences.workStyle" && typeof suggestedValue === "string") {
        const prefs = store.getPreferences();
        const workStyle = suggestedValue as "remote" | "hybrid" | "onsite" | "flexible";
        if (prefs) {
          store.updatePreferences({ workStyle });
        } else {
          store.setPreferences({
            roleTypes: [],
            industries: [],
            dealBreakers: [],
            workStyle,
            companyStage: [],
            updatedAt: new Date(),
          });
        }
        log.info("Applied work style preference", { workStyle });
        return;
      }

      if (field === "preferences.roleTypes" && Array.isArray(suggestedValue)) {
        const prefs = store.getPreferences();
        const roleTypes = suggestedValue.filter((v): v is string => typeof v === "string");
        if (prefs) {
          const merged = [...new Set([...prefs.roleTypes, ...roleTypes])];
          store.updatePreferences({ roleTypes: merged });
        } else {
          store.setPreferences({
            roleTypes,
            industries: [],
            dealBreakers: [],
            workStyle: "flexible",
            companyStage: [],
            updatedAt: new Date(),
          });
        }
        log.info("Applied role type preferences", { roleTypes });
        return;
      }

      if (field === "preferences.dealBreakers" && Array.isArray(suggestedValue)) {
        const prefs = store.getPreferences();
        const dealBreakers = suggestedValue.filter((v): v is string => typeof v === "string");
        if (prefs) {
          const merged = [...new Set([...prefs.dealBreakers, ...dealBreakers])];
          store.updatePreferences({ dealBreakers: merged });
        } else {
          store.setPreferences({
            roleTypes: [],
            industries: [],
            dealBreakers,
            workStyle: "flexible",
            companyStage: [],
            updatedAt: new Date(),
          });
        }
        log.info("Applied deal breaker preferences", { dealBreakers });
        return;
      }

      if (field === "profile.locationPreferences" && Array.isArray(suggestedValue)) {
        const profile = store.getProfile();
        const locations = suggestedValue.filter((v): v is string => typeof v === "string");
        if (profile) {
          const merged = [...new Set([...profile.locationPreferences, ...locations])];
          store.updateProfile({ locationPreferences: merged });
        }
        log.info("Applied location preferences", { locations });
        return;
      }

      log.warn("Unhandled update field", { field });
    },

    getGaps(): string[] {
      const gaps: string[] = [];
      const full = store.getFullProfile();

      if (!full.profile) {
        gaps.push("No basic profile set (name, headline, narrative)");
      } else {
        if (!full.profile.headline) {
          gaps.push("Missing headline");
        }
        if (!full.profile.narrative) {
          gaps.push("Missing career narrative/summary");
        }
        if (full.profile.targetRoles.length === 0) {
          gaps.push("No target roles specified");
        }
        if (full.profile.locationPreferences.length === 0) {
          gaps.push("No location preferences");
        }
      }

      if (full.workEntries.length === 0) {
        gaps.push("No work history entries");
      } else {
        const hasCurrentRole = full.workEntries.some((e) => !e.endDate);
        if (!hasCurrentRole) {
          gaps.push("No current role listed");
        }

        const entriesWithoutAchievements = full.workEntries.filter(
          (e) => e.achievements.length === 0,
        );
        if (entriesWithoutAchievements.length > 0) {
          gaps.push(
            `${entriesWithoutAchievements.length} work ${entriesWithoutAchievements.length === 1 ? "entry" : "entries"} missing achievements`,
          );
        }
      }

      if (full.skills.length === 0) {
        gaps.push("No skills listed");
      } else if (full.skills.length < 5) {
        gaps.push("Very few skills listed (less than 5)");
      }

      if (full.projects.length === 0) {
        gaps.push("No projects listed");
      }

      if (full.education.length === 0) {
        gaps.push("No education entries");
      }

      if (!full.preferences) {
        gaps.push("No career preferences set (role types, work style, industries)");
      } else {
        if (full.preferences.roleTypes.length === 0) {
          gaps.push("No preferred role types");
        }
        if (full.preferences.industries.length === 0) {
          gaps.push("No preferred industries");
        }
      }

      return gaps;
    },
  };
}

// -- Helpers --

function getCurrentValue(store: ProfileStore, field: string): unknown {
  if (field === "workEntry" || field === "workEntry.ended") {
    return store.getWorkEntries();
  }
  if (field === "skill") {
    return store.getSkills();
  }
  if (field.startsWith("preferences.")) {
    const prefs = store.getPreferences();
    if (!prefs) {
      return null;
    }
    const key = field.split(".")[1] as keyof typeof prefs;
    return prefs[key] ?? null;
  }
  if (field.startsWith("profile.")) {
    const profile = store.getProfile();
    if (!profile) {
      return null;
    }
    const key = field.split(".")[1] as keyof typeof profile;
    return profile[key] ?? null;
  }
  return null;
}

function parseJobMention(text: string): { company: string; title?: string } {
  const trimmed = text.trim();

  // "a [title] at [company]"
  const titleAtCompany = trimmed.match(/^a\s+(.+?)\s+(?:at|with)\s+(.+)$/i);
  if (titleAtCompany) {
    return { title: titleAtCompany[1].trim(), company: titleAtCompany[2].trim() };
  }

  // "[company] as [title]"
  const companyAsTitle = trimmed.match(/^(.+?)\s+as\s+(?:a\s+)?(.+)$/i);
  if (companyAsTitle) {
    return { company: companyAsTitle[1].trim(), title: companyAsTitle[2].trim() };
  }

  return { company: trimmed };
}

function extractSkillNames(text: string): string[] {
  return text
    .split(/,\s*|\s+and\s+|\s+&\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40);
}

function isJobMention(value: unknown): value is { company: string; title?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "company" in value &&
    typeof (value as Record<string, unknown>).company === "string"
  );
}

function isCompanyRef(value: unknown): value is { company: string } {
  return isJobMention(value);
}
