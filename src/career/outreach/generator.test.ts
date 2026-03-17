import { describe, expect, it } from "vitest";
import { createOutreachGenerator } from "./generator.js";
import type { DraftParams, StyleProfile } from "./types.js";
import { DEFAULT_STYLE_PROFILE } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeDraftParams(overrides: Partial<DraftParams> = {}): DraftParams {
  return {
    recipientName: "Jane Doe",
    recipientContext: { company: "Acme Corp", title: "VP Engineering" },
    messageType: "cold_outreach",
    purpose: "discuss engineering opportunities",
    ...overrides,
  };
}

const FORMAL_STYLE: StyleProfile = {
  ...DEFAULT_STYLE_PROFILE,
  formality: 0.9,
};

const CASUAL_STYLE: StyleProfile = {
  ...DEFAULT_STYLE_PROFILE,
  formality: 0.3,
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe("OutreachGenerator", () => {
  describe("draftMessage", () => {
    it("returns a well-formed OutreachRecord", () => {
      const gen = createOutreachGenerator();
      const record = gen.draftMessage(makeDraftParams());

      expect(record.id).toMatch(/^outreach_/);
      expect(record.status).toBe("draft");
      expect(record.channel).toBe("email");
      expect(record.messageType).toBe("cold_outreach");
      expect(record.recipientName).toBe("Jane Doe");
      expect(record.content.length).toBeGreaterThan(0);
      expect(record.notes).toEqual([]);
    });

    it("always sets recipientId to empty string", () => {
      const gen = createOutreachGenerator();
      const record = gen.draftMessage(makeDraftParams());
      expect(record.recipientId).toBe("");
    });

    it("generates unique IDs for successive drafts", () => {
      const gen = createOutreachGenerator();
      const a = gen.draftMessage(makeDraftParams());
      const b = gen.draftMessage(makeDraftParams());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("message types produce distinct content", () => {
    const gen = createOutreachGenerator();

    it("warm_intro includes greeting and shared context", () => {
      const record = gen.draftMessage(
        makeDraftParams({
          messageType: "warm_intro",
          networkContext: { howConnected: "met at a conference", mutualConnections: ["Alice"] },
        }),
      );
      expect(record.content).toContain("Alice");
      expect(record.content).toContain("Jane Doe");
    });

    it("cold_outreach includes hook referencing company/title", () => {
      const record = gen.draftMessage(makeDraftParams({ messageType: "cold_outreach" }));
      expect(record.content).toContain("VP Engineering");
      expect(record.content).toContain("Acme Corp");
    });

    it("follow_up includes reference to earlier message", () => {
      const record = gen.draftMessage(makeDraftParams({ messageType: "follow_up" }));
      expect(record.content).toContain("follow up");
    });

    it("reconnection addresses recipient by name", () => {
      const record = gen.draftMessage(makeDraftParams({ messageType: "reconnection" }));
      expect(record.content).toContain("Jane Doe");
    });

    it("thank_you includes appreciation", () => {
      const record = gen.draftMessage(
        makeDraftParams({
          messageType: "thank_you",
          purpose: "speak with me about the role",
        }),
      );
      expect(record.content).toContain("Thank you");
    });
  });

  describe("formality affects wording", () => {
    it("uses 'Dear' greeting at high formality", () => {
      const gen = createOutreachGenerator(FORMAL_STYLE);
      const record = gen.draftMessage(makeDraftParams({ messageType: "warm_intro" }));
      expect(record.content).toContain("Dear Jane Doe");
    });

    it("uses 'Hi' greeting at low formality", () => {
      const gen = createOutreachGenerator(CASUAL_STYLE);
      const record = gen.draftMessage(makeDraftParams({ messageType: "warm_intro" }));
      expect(record.content).toContain("Hi Jane Doe");
    });

    it("per-draft style overrides base style", () => {
      const gen = createOutreachGenerator(FORMAL_STYLE);
      const record = gen.draftMessage(
        makeDraftParams({
          messageType: "warm_intro",
          style: CASUAL_STYLE,
        }),
      );
      expect(record.content).toContain("Hi Jane Doe");
    });
  });

  describe("job context integration", () => {
    it("references job title and company in value_prop section", () => {
      const gen = createOutreachGenerator();
      const record = gen.draftMessage(
        makeDraftParams({
          messageType: "warm_intro",
          jobContext: {
            title: "Staff Engineer",
            company: "Acme Corp",
            whyInterested: "I love distributed systems",
          },
        }),
      );
      expect(record.content).toContain("Staff Engineer");
      expect(record.content).toContain("Acme Corp");
    });

    it("includes whyInterested in cold_outreach interest section", () => {
      const gen = createOutreachGenerator();
      const record = gen.draftMessage(
        makeDraftParams({
          messageType: "cold_outreach",
          jobContext: {
            title: "Staff Engineer",
            company: "Acme Corp",
            whyInterested: "distributed systems are my passion",
          },
        }),
      );
      expect(record.content).toContain("distributed systems are my passion");
    });
  });

  describe("network context integration", () => {
    it("mentions mutual connections", () => {
      const gen = createOutreachGenerator();
      const record = gen.draftMessage(
        makeDraftParams({
          messageType: "warm_intro",
          networkContext: {
            howConnected: "former colleague",
            mutualConnections: ["Bob", "Carol"],
          },
        }),
      );
      expect(record.content).toContain("Bob and Carol");
    });

    it("falls back to company mention when no network context", () => {
      const gen = createOutreachGenerator();
      const record = gen.draftMessage(
        makeDraftParams({
          messageType: "warm_intro",
          recipientContext: { company: "Acme Corp" },
        }),
      );
      expect(record.content).toContain("Acme Corp");
    });
  });

  describe("style length trimming", () => {
    it("trims content when it exceeds 2x the avgLength", () => {
      const shortStyle: StyleProfile = {
        ...DEFAULT_STYLE_PROFILE,
        avgLength: 50,
      };
      const gen = createOutreachGenerator(shortStyle);
      const record = gen.draftMessage(makeDraftParams({ messageType: "warm_intro" }));
      const genDefault = createOutreachGenerator();
      const defaultRecord = genDefault.draftMessage(makeDraftParams({ messageType: "warm_intro" }));
      expect(record.content.length).toBeLessThanOrEqual(defaultRecord.content.length);
    });
  });

  describe("generateSubjectLine", () => {
    const gen = createOutreachGenerator();

    it("warm_intro with mutual connection mentions that connection", () => {
      const subject = gen.generateSubjectLine(
        makeDraftParams({
          messageType: "warm_intro",
          networkContext: { howConnected: "", mutualConnections: ["Alice"] },
        }),
      );
      expect(subject).toContain("Alice");
    });

    it("warm_intro without mutual connection uses first name", () => {
      const subject = gen.generateSubjectLine(makeDraftParams({ messageType: "warm_intro" }));
      expect(subject).toContain("Jane");
    });

    it("cold_outreach with job context includes job title and company", () => {
      const subject = gen.generateSubjectLine(
        makeDraftParams({
          messageType: "cold_outreach",
          jobContext: { title: "Staff Engineer", company: "Acme Corp", whyInterested: "" },
        }),
      );
      expect(subject).toContain("Staff Engineer");
      expect(subject).toContain("Acme Corp");
    });

    it("cold_outreach without job context falls back to generic", () => {
      const subject = gen.generateSubjectLine(
        makeDraftParams({ messageType: "cold_outreach", jobContext: undefined }),
      );
      expect(subject).toContain("shared interest");
    });

    it("follow_up truncates purpose to 50 chars", () => {
      const longPurpose = "a".repeat(100);
      const subject = gen.generateSubjectLine(
        makeDraftParams({ messageType: "follow_up", purpose: longPurpose }),
      );
      expect(subject.length).toBeLessThanOrEqual("Following up — ".length + 50);
    });

    it("reconnection uses first name", () => {
      const subject = gen.generateSubjectLine(makeDraftParams({ messageType: "reconnection" }));
      expect(subject).toContain("Jane");
    });

    it("thank_you uses first name", () => {
      const subject = gen.generateSubjectLine(makeDraftParams({ messageType: "thank_you" }));
      expect(subject).toContain("Jane");
    });
  });
});
