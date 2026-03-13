/**
 * Career profile type definitions.
 * All types for the professional profile builder subsystem.
 */

/** High-level career profile summary. */
export type CareerProfile = {
  name: string;
  headline: string;
  narrative: string;
  targetRoles: string[];
  locationPreferences: string[];
  compensationExpectations?: {
    min: number;
    max: number;
    currency: string;
  };
  updatedAt: Date;
};

/** A single work history entry. */
export type WorkEntry = {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  description: string;
  skills: string[];
  achievements: string[];
};

/** Skill category classification. */
export type SkillCategory = "language" | "framework" | "domain" | "soft" | "tool";

/** A discrete skill with proficiency tracking. */
export type Skill = {
  name: string;
  category: SkillCategory;
  /** Proficiency score from 0 (beginner) to 1 (expert). */
  proficiency: number;
  lastUsed?: string;
  /** Where this skill was observed or claimed (e.g. "linkedin", "github", "resume"). */
  sources: string[];
};

/** A project entry with tech stack and impact. */
export type Project = {
  name: string;
  description: string;
  url?: string;
  techStack: string[];
  role: string;
  impact?: string;
};

/** An education entry. */
export type Education = {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate?: string;
};

/** Career preferences and filters. */
export type CareerPreferences = {
  roleTypes: string[];
  industries: string[];
  dealBreakers: string[];
  workStyle: "remote" | "hybrid" | "onsite" | "flexible";
  companyStage: string[];
  updatedAt: Date;
};

/** Aggregated full profile combining all subsections. */
export type FullProfile = {
  profile: CareerProfile | null;
  workEntries: WorkEntry[];
  skills: Skill[];
  projects: Project[];
  education: Education[];
  preferences: CareerPreferences | null;
};

/** Suggestion for a profile update detected from conversation. */
export type ProfileUpdateSuggestion = {
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  confidence: number;
  source: string;
};

/** Serialized profile format for JSON persistence. */
export type SerializedProfile = {
  profile: (Omit<CareerProfile, "updatedAt"> & { updatedAt: string }) | null;
  workEntries: WorkEntry[];
  skills: Skill[];
  projects: Project[];
  education: Education[];
  preferences: (Omit<CareerPreferences, "updatedAt"> & { updatedAt: string }) | null;
};

/** Raw GitHub data passed in by the caller (no HTTP calls made here). */
export type GitHubProfileData = {
  username: string;
  repos: {
    name: string;
    description: string | null;
    language: string | null;
    stars: number;
    url: string;
    topics: string[];
  }[];
  languages: Record<string, number>;
};

/** Result of resume text parsing. */
export type ResumeParseResult = {
  workEntries: WorkEntry[];
  skills: Skill[];
  education: Education[];
  summary: string;
};

/** Raw LinkedIn connection record. */
export type LinkedInConnection = {
  firstName: string;
  lastName: string;
  emailAddress: string;
  company: string;
  position: string;
  connectedOn: string;
};
