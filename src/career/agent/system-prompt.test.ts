import { describe, expect, it } from "vitest";
import { buildCareerSystemPrompt, type CareerAgentContext } from "./system-prompt.js";

// ── Helpers ───────────────────────────────────────────────────────────────

const BASE_CONTEXT: CareerAgentContext = {
  mode: "discovery",
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe("buildCareerSystemPrompt", () => {
  describe("Available Skills block", () => {
    it("contains the Available Skills heading", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("## Available Skills");
    });

    it("lists all 11 skill names", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      const skills = [
        "/interview-prep",
        "/resume-tailor",
        "/weekly-standup",
        "/career-debrief",
        "/application-review",
        "/network-audit",
        "/outreach-draft",
        "/profile-gaps",
        "/salary-negotiation",
        "/offer-compare",
        "/career-path",
      ];
      for (const skill of skills) {
        expect(prompt).toContain(skill);
      }
    });

    it("includes the opt-in announcement instruction", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("I'll run [skill] for");
      expect(prompt).toContain("The user can decline");
    });
  });

  describe("Proactive Scheduling block", () => {
    it("contains the Proactive Scheduling heading", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("## Proactive Scheduling");
    });

    it("lists all four schedule names", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("weekly-standup");
      expect(prompt).toContain("follow-up-check");
      expect(prompt).toContain("job-scan");
      expect(prompt).toContain("network-pulse");
    });

    it("includes the consent instruction", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("Always ask before enabling a schedule");
      expect(prompt).toContain("Never enable without consent");
    });

    it("marks no schedules as active when activeSchedules is omitted", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).not.toContain("(active)");
    });

    it("marks schedules as active when provided in context", () => {
      const prompt = buildCareerSystemPrompt({
        ...BASE_CONTEXT,
        activeSchedules: ["weekly-standup", "job-scan"],
      });
      expect(prompt).toContain("weekly-standup (active)");
      expect(prompt).toContain("job-scan (active)");
    });

    it("does not mark unspecified schedules as active", () => {
      const prompt = buildCareerSystemPrompt({
        ...BASE_CONTEXT,
        activeSchedules: ["weekly-standup"],
      });
      expect(prompt).toContain("weekly-standup (active)");
      // follow-up-check should not be marked active
      expect(prompt).not.toContain("follow-up-check (active)");
    });
  });

  describe("Negotiation & Career Planning block", () => {
    it("contains the Negotiation & Career Planning heading", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("## Negotiation & Career Planning");
    });

    it("mentions career_negotiation_analyze", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("career_negotiation_analyze");
    });

    it("mentions career_offer_compare", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("career_offer_compare");
    });

    it("mentions career_path_model", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("career_path_model");
    });

    it("includes the cross-tool example with career_path_gaps and career_job_search", () => {
      const prompt = buildCareerSystemPrompt(BASE_CONTEXT);
      expect(prompt).toContain("career_path_gaps");
      expect(prompt).toContain("career_job_search");
    });
  });
});
