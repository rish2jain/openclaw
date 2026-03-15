import { describe, expect, it } from "vitest";
import { createModeManager } from "./mode.js";
import type { ProfileReadiness } from "./mode.js";

// ── Helpers ───────────────────────────────────────────────────────────────

const FULL_PROFILE: ProfileReadiness = {
  hasPreferences: true,
  hasTargetRoles: true,
  hasWorkHistory: true,
};

const EMPTY_PROFILE: ProfileReadiness = {
  hasPreferences: false,
  hasTargetRoles: false,
  hasWorkHistory: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe("ModeManager", () => {
  describe("initial state", () => {
    it("defaults to discovery mode", () => {
      const mm = createModeManager();
      expect(mm.getMode()).toBe("discovery");
    });

    it("accepts an explicit initial mode", () => {
      const mm = createModeManager("execution");
      expect(mm.getMode()).toBe("execution");
    });
  });

  describe("setMode / getMode", () => {
    it("switches from discovery to execution", () => {
      const mm = createModeManager("discovery");
      mm.setMode("execution");
      expect(mm.getMode()).toBe("execution");
    });

    it("switches from execution to discovery", () => {
      const mm = createModeManager("execution");
      mm.setMode("discovery");
      expect(mm.getMode()).toBe("discovery");
    });

    it("setting the same mode is idempotent", () => {
      const mm = createModeManager("discovery");
      mm.setMode("discovery");
      expect(mm.getMode()).toBe("discovery");
    });
  });

  describe("shouldSuggestModeSwitch (from discovery)", () => {
    it("suggests execution when profile is fully ready", () => {
      const mm = createModeManager("discovery");
      const suggestion = mm.shouldSuggestModeSwitch(FULL_PROFILE);

      expect(suggestion.suggest).toBe(true);
      expect(suggestion.suggestedMode).toBe("execution");
      expect(suggestion.reason).toContain("preferences");
      expect(suggestion.reason).toContain("target roles");
      expect(suggestion.reason).toContain("work history");
    });

    it("does not suggest switch when no fields are set", () => {
      const mm = createModeManager("discovery");
      const suggestion = mm.shouldSuggestModeSwitch(EMPTY_PROFILE);

      expect(suggestion.suggest).toBe(false);
      expect(suggestion.suggestedMode).toBe("discovery");
      expect(suggestion.reason).toContain("career preferences");
      expect(suggestion.reason).toContain("target roles");
      expect(suggestion.reason).toContain("work history");
    });

    it("does not suggest switch when only preferences are set", () => {
      const mm = createModeManager("discovery");
      const suggestion = mm.shouldSuggestModeSwitch({
        hasPreferences: true,
        hasTargetRoles: false,
        hasWorkHistory: false,
      });

      expect(suggestion.suggest).toBe(false);
      expect(suggestion.reason).toContain("target roles");
      expect(suggestion.reason).toContain("work history");
      expect(suggestion.reason).not.toContain("career preferences");
    });

    it("does not suggest switch when only one field is missing", () => {
      const mm = createModeManager("discovery");
      const suggestion = mm.shouldSuggestModeSwitch({
        hasPreferences: true,
        hasTargetRoles: true,
        hasWorkHistory: false,
      });

      expect(suggestion.suggest).toBe(false);
      expect(suggestion.reason).toContain("work history");
    });
  });

  describe("shouldSuggestModeSwitch (from execution)", () => {
    it("suggests discovery when preferences are cleared", () => {
      const mm = createModeManager("execution");
      const suggestion = mm.shouldSuggestModeSwitch({
        hasPreferences: false,
        hasTargetRoles: true,
        hasWorkHistory: true,
      });

      expect(suggestion.suggest).toBe(true);
      expect(suggestion.suggestedMode).toBe("discovery");
      expect(suggestion.reason).toContain("Preferences or target roles");
    });

    it("suggests discovery when target roles are cleared", () => {
      const mm = createModeManager("execution");
      const suggestion = mm.shouldSuggestModeSwitch({
        hasPreferences: true,
        hasTargetRoles: false,
        hasWorkHistory: true,
      });

      expect(suggestion.suggest).toBe(true);
      expect(suggestion.suggestedMode).toBe("discovery");
    });

    it("does not suggest switch when full profile is present", () => {
      const mm = createModeManager("execution");
      const suggestion = mm.shouldSuggestModeSwitch(FULL_PROFILE);

      expect(suggestion.suggest).toBe(false);
      expect(suggestion.suggestedMode).toBe("execution");
      expect(suggestion.reason).toContain("appropriate");
    });

    it("stays in execution even when work history is missing (not a trigger)", () => {
      const mm = createModeManager("execution");
      const suggestion = mm.shouldSuggestModeSwitch({
        hasPreferences: true,
        hasTargetRoles: true,
        hasWorkHistory: false,
      });

      expect(suggestion.suggest).toBe(false);
      expect(suggestion.suggestedMode).toBe("execution");
    });
  });

  describe("getModeContext", () => {
    it("returns discovery context text", () => {
      const mm = createModeManager();
      const ctx = mm.getModeContext("discovery");

      expect(ctx).toContain("DISCOVERY");
      expect(ctx).toContain("probing questions");
      expect(ctx).not.toContain("EXECUTION");
    });

    it("returns execution context text", () => {
      const mm = createModeManager();
      const ctx = mm.getModeContext("execution");

      expect(ctx).toContain("EXECUTION");
      expect(ctx).toContain("pipeline");
      expect(ctx).not.toContain("DISCOVERY");
    });
  });
});
