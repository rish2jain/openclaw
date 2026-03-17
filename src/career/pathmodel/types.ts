/**
 * Types for career path modeling and skill gap analysis.
 */

export type SkillLevel = "none" | "beginner" | "intermediate" | "advanced" | "expert";

export type SkillGap = {
  skill: string;
  currentLevel: SkillLevel;
  requiredLevel: SkillLevel;
  closingStrategies: string[];
};

export type TransitionType = "promotion" | "lateral" | "pivot" | "upskill";

export type PathStep = {
  fromRole: string;
  toRole: string;
  transitionType: TransitionType;
  skillGaps: SkillGap[];
  suggestedActions: string[];
  timeEstimate: string;
};

export type PathDifficulty = "straightforward" | "moderate" | "ambitious";

export type PathRoute = {
  name: string;
  steps: PathStep[];
  estimatedTimeline: string;
  difficulty: PathDifficulty;
  tradeoffs: string[];
};

export type RoleSnapshot = {
  title: string;
  level: string;
  domain: string;
  keySkills: string[];
  typicalYearsExp: number;
};

export type CareerPath = {
  origin: RoleSnapshot;
  destination: RoleSnapshot;
  paths: PathRoute[];
};

/** Ordered skill levels for comparison. */
const SKILL_ORDER: SkillLevel[] = ["none", "beginner", "intermediate", "advanced", "expert"];

/** Returns true if current level is below required level. */
export function isGap(current: SkillLevel, required: SkillLevel): boolean {
  return SKILL_ORDER.indexOf(current) < SKILL_ORDER.indexOf(required);
}
