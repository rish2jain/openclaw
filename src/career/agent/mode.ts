/**
 * Career agent mode management.
 *
 * Tracks whether the agent is in discovery mode (exploring options) or
 * execution mode (actively searching/applying) and provides heuristics
 * for suggesting mode switches.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentMode = "discovery" | "execution";

/** Profile completeness signals used to decide mode suggestions. */
export type ProfileReadiness = {
  hasPreferences: boolean;
  hasTargetRoles: boolean;
  hasWorkHistory: boolean;
};

export type ModeSwitchSuggestion = {
  suggest: boolean;
  reason: string;
  suggestedMode: AgentMode;
};

export type ModeManager = {
  /** Get the current agent mode. */
  getMode: () => AgentMode;
  /** Switch to a different mode. */
  setMode: (mode: AgentMode) => void;
  /**
   * Evaluate whether the agent should suggest switching modes based on
   * the user's profile readiness.
   */
  shouldSuggestModeSwitch: (profile: ProfileReadiness) => ModeSwitchSuggestion;
  /** Get mode-specific instruction text for injection into the system prompt. */
  getModeContext: (mode: AgentMode) => string;
};

// ── Factory ────────────────────────────────────────────────────────────────

/** Create a mode manager starting in the given mode (defaults to discovery). */
export function createModeManager(initial: AgentMode = "discovery"): ModeManager {
  let current: AgentMode = initial;

  function getMode(): AgentMode {
    return current;
  }

  function setMode(mode: AgentMode): void {
    current = mode;
  }

  function shouldSuggestModeSwitch(profile: ProfileReadiness): ModeSwitchSuggestion {
    if (current === "discovery") {
      // Suggest execution once the user has enough foundation.
      const ready = profile.hasPreferences && profile.hasTargetRoles && profile.hasWorkHistory;

      if (ready) {
        return {
          suggest: true,
          reason:
            "Your profile has preferences, target roles, and work history filled " +
            "out. You have enough context to start actively searching and applying.",
          suggestedMode: "execution",
        };
      }

      // Partial readiness: gentle nudge with specifics.
      const missing: string[] = [];
      if (!profile.hasPreferences) {
        missing.push("career preferences");
      }
      if (!profile.hasTargetRoles) {
        missing.push("target roles");
      }
      if (!profile.hasWorkHistory) {
        missing.push("work history");
      }

      return {
        suggest: false,
        reason:
          `Still in discovery. Missing: ${missing.join(", ")}. ` +
          "Fill these in to unlock execution mode.",
        suggestedMode: "discovery",
      };
    }

    // In execution mode: suggest discovery if the foundation crumbles
    // (e.g. user clears preferences or pivots direction).
    if (!profile.hasPreferences || !profile.hasTargetRoles) {
      return {
        suggest: true,
        reason:
          "Preferences or target roles are no longer set. Consider switching " +
          "back to discovery to re-establish direction before continuing applications.",
        suggestedMode: "discovery",
      };
    }

    return {
      suggest: false,
      reason: "Execution mode is appropriate given current profile state.",
      suggestedMode: "execution",
    };
  }

  function getModeContext(mode: AgentMode): string {
    if (mode === "discovery") {
      return [
        "Current mode: DISCOVERY",
        "",
        "Focus on understanding the user's goals, strengths, and gaps.",
        "Ask probing questions. Explore options. Analyze the market relative",
        "to their profile. Help them narrow down direction before taking action.",
        "Avoid pushing the user to apply before they have clarity.",
      ].join("\n");
    }

    return [
      "Current mode: EXECUTION",
      "",
      "Focus on concrete action: reviewing listings, tailoring materials,",
      "tracking applications, preparing for interviews, and drafting outreach.",
      "Reference the user's pipeline status to suggest next steps.",
      "Flag when the pipeline stalls or when a strategic pivot may be needed.",
    ].join("\n");
  }

  return {
    getMode,
    setMode,
    shouldSuggestModeSwitch,
    getModeContext,
  };
}
