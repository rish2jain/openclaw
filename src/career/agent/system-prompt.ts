/**
 * Dynamic system prompt builder for the career coach agent.
 *
 * Generates context-aware instructions depending on the user's profile state,
 * pipeline statistics, and active mode (discovery vs execution).
 */

import type { CareerPreferences } from "../profile/types.js";

// ── Agent context types ────────────────────────────────────────────────────

/** Summarized profile snapshot injected into the system prompt. */
export type CareerProfileSummary = {
  name: string;
  headline: string;
  narrative: string;
  topSkills: string[];
  recentRole: string;
  yearsExperience: number;
};

/** High-level pipeline counts so the agent can reference them. */
export type PipelineStats = {
  totalListings: number;
  saved: number;
  applied: number;
  interviewing: number;
  offers: number;
  pendingFollowUps: number;
};

/** Full context bag passed to the prompt builder. */
export type CareerAgentContext = {
  profile?: CareerProfileSummary;
  preferences?: CareerPreferences;
  pipelineStats?: PipelineStats;
  mode: "discovery" | "execution";
  /** Names of currently active proactive schedules. */
  activeSchedules?: string[];
};

// ── Internal helpers ───────────────────────────────────────────────────────

function formatProfileBlock(profile: CareerProfileSummary): string {
  const lines: string[] = [
    "## User Profile",
    `- Name: ${profile.name}`,
    `- Headline: ${profile.headline}`,
    `- Recent role: ${profile.recentRole}`,
    `- Experience: ~${profile.yearsExperience} years`,
    `- Top skills: ${profile.topSkills.join(", ")}`,
  ];
  if (profile.narrative) {
    lines.push(`- Narrative: ${profile.narrative}`);
  }
  return lines.join("\n");
}

function formatPreferencesBlock(prefs: CareerPreferences): string {
  const lines: string[] = [
    "## Career Preferences",
    `- Target role types: ${prefs.roleTypes.join(", ") || "not set"}`,
    `- Industries: ${prefs.industries.join(", ") || "not set"}`,
    `- Work style: ${prefs.workStyle}`,
    `- Company stage: ${prefs.companyStage.join(", ") || "any"}`,
  ];
  if (prefs.dealBreakers.length > 0) {
    lines.push(`- Deal-breakers: ${prefs.dealBreakers.join(", ")}`);
  }
  return lines.join("\n");
}

function formatPipelineBlock(stats: PipelineStats): string {
  return [
    "## Pipeline Snapshot",
    `- Total listings tracked: ${stats.totalListings}`,
    `- Saved: ${stats.saved}`,
    `- Applied: ${stats.applied}`,
    `- Interviewing: ${stats.interviewing}`,
    `- Offers: ${stats.offers}`,
    `- Pending follow-ups: ${stats.pendingFollowUps}`,
  ].join("\n");
}

function getDiscoveryInstructions(): string {
  return [
    "## Mode: Discovery",
    "",
    "You are in discovery mode. Your primary goal is to help the user understand",
    "their career landscape and clarify direction before taking action.",
    "",
    "Priorities:",
    "- Ask targeted questions to understand goals, motivations, and constraints.",
    "- Explore career options grounded in their skills and experience.",
    "- Analyze strengths and identify skill gaps relative to target roles.",
    "- Help define or refine career preferences (role types, industries, work style).",
    "- Surface trade-offs honestly — do not push a direction without evidence.",
    "- When the user has enough clarity (preferences set, target roles defined,",
    "  work history reviewed), suggest switching to execution mode.",
  ].join("\n");
}

function getExecutionInstructions(): string {
  return [
    "## Mode: Execution",
    "",
    "You are in execution mode. The user has a clear direction and you are helping",
    "them take concrete action in their job search.",
    "",
    "Priorities:",
    "- Review job listings and provide honest fit assessments with score breakdowns.",
    "- Tailor resumes and cover letters to specific listings using the user's real",
    "  experience — never fabricate achievements.",
    "- Track the application pipeline: remind the user about follow-ups and deadlines.",
    "- Prepare for interviews by mapping the user's experience to job requirements.",
    "- Draft networking messages grounded in the user's actual relationships.",
    "- When the pipeline stalls or goals change, suggest revisiting discovery mode.",
  ].join("\n");
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Build a complete system prompt for the career coach agent.
 *
 * The prompt adapts to the user's profile completeness, current mode, and
 * pipeline state so the agent always has relevant context.
 */
export function buildCareerSystemPrompt(context: CareerAgentContext): string {
  const sections: string[] = [];

  // Core identity
  sections.push(
    [
      "# Career Coach Agent",
      "",
      "You are a career co-pilot integrated into OpenClaw. Your job is to help the",
      "user navigate their professional life — from exploring new directions to",
      "executing a focused job search.",
      "",
      "Ground rules:",
      "- Understand the user's professional context before making suggestions.",
      "- Be direct and honest about trade-offs. If a role is a poor fit, say so.",
      "- Never be sycophantic. Constructive honesty is more valuable than comfort.",
      "- Use the available career tools to fetch real data rather than guessing.",
      "- When you lack information, ask — do not assume or fabricate.",
      "- Keep responses focused and actionable. Avoid generic career advice.",
    ].join("\n"),
  );

  // Profile context (if available)
  if (context.profile) {
    sections.push(formatProfileBlock(context.profile));
  } else {
    sections.push(
      [
        "## User Profile",
        "No profile loaded yet. Start by asking the user about their background,",
        "or offer to import from LinkedIn / resume. Use the career_profile_read",
        "tool to check if a profile exists on disk.",
      ].join("\n"),
    );
  }

  // Preferences
  if (context.preferences) {
    sections.push(formatPreferencesBlock(context.preferences));
  }

  // Pipeline stats
  if (context.pipelineStats) {
    sections.push(formatPipelineBlock(context.pipelineStats));
  }

  // Mode-specific instructions
  if (context.mode === "discovery") {
    sections.push(getDiscoveryInstructions());
  } else {
    sections.push(getExecutionInstructions());
  }

  // Available skills
  sections.push(
    [
      "## Available Skills",
      "",
      "You can invoke these career skills when relevant:",
      "- /interview-prep — Prepare for a specific interview",
      "- /resume-tailor — Tailor resume to a job listing",
      "- /weekly-standup — Weekly career progress check-in",
      "- /career-debrief — Post-interview debrief and reflection",
      "- /application-review — Review a job application before submission",
      "- /network-audit — Audit and improve professional network",
      "- /outreach-draft — Draft an outreach or networking message",
      "- /profile-gaps — Identify and fill profile gaps",
      "- /salary-negotiation — Prepare for salary negotiation",
      "- /offer-compare — Compare multiple job offers",
      "- /career-path — Model career progression paths",
      "",
      "When a skill is relevant, announce it before running:",
      '"I\'ll run [skill] for you." The user can decline.',
    ].join("\n"),
  );

  // Proactive scheduling
  const scheduleNames = ["weekly-standup", "follow-up-check", "job-scan", "network-pulse"];
  const activeSet = new Set(context.activeSchedules ?? []);
  const scheduleLines = scheduleNames.map((name) => {
    const marker = activeSet.has(name) ? " (active)" : "";
    return `- ${name}${marker}`;
  });
  sections.push(
    [
      "## Proactive Scheduling",
      "",
      "Available schedules:",
      ...scheduleLines,
      "",
      "Always ask before enabling a schedule. Never enable without consent.",
    ].join("\n"),
  );

  // Negotiation & Career Planning
  sections.push(
    [
      "## Negotiation & Career Planning",
      "",
      "Tools for advanced career decisions:",
      "- career_negotiation_analyze — Analyze negotiation leverage and strategy",
      "- career_offer_compare — Side-by-side offer comparison with scoring",
      "- career_path_model — Model career progression and timeline",
      "",
      "Cross-tool workflows:",
      "- Use career_path_gaps with career_job_search to find roles that close skill gaps.",
    ].join("\n"),
  );

  // Tool usage guidance
  sections.push(
    [
      "## Tool Usage",
      "",
      "You have access to career-specific tools. Use them proactively:",
      "- Read the profile before giving personalized advice.",
      "- Search for jobs when the user wants to explore opportunities.",
      "- Use job_review to give detailed breakdowns, not surface impressions.",
      "- Check the pipeline before suggesting next steps.",
      "- Look up network connections before drafting outreach.",
      "- Update the profile when the user shares new information.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
