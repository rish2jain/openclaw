import { describe, expect, it, vi, afterEach } from "vitest";
import { createFollowUpScheduler } from "./followup.js";
import type { OutreachRecord } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeRecord(overrides: Partial<OutreachRecord> = {}): OutreachRecord {
  return {
    id: "test-record-1",
    recipientId: "person-1",
    recipientName: "Jane Doe",
    channel: "email",
    messageType: "cold_outreach",
    content: "Hello there",
    status: "draft",
    notes: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("FollowUpScheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("scheduleFollowUp", () => {
    it("sets followUpDate on the record N days from now", () => {
      const scheduler = createFollowUpScheduler();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      const record = makeRecord();
      const result = scheduler.scheduleFollowUp(record, 5);

      expect(result.followUpDate).toBe(now + 5 * MS_PER_DAY);
      // Should mutate in place and return same reference
      expect(result).toBe(record);
    });

    it("handles zero days (immediate follow-up)", () => {
      const scheduler = createFollowUpScheduler();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      const record = makeRecord();
      scheduler.scheduleFollowUp(record, 0);

      expect(record.followUpDate).toBe(now);
    });
  });

  describe("getDefaultFollowUpDays", () => {
    it("returns correct defaults for each message type", () => {
      const scheduler = createFollowUpScheduler();

      expect(scheduler.getDefaultFollowUpDays("warm_intro")).toBe(5);
      expect(scheduler.getDefaultFollowUpDays("cold_outreach")).toBe(7);
      expect(scheduler.getDefaultFollowUpDays("follow_up")).toBe(10);
      expect(scheduler.getDefaultFollowUpDays("reconnection")).toBe(14);
      expect(scheduler.getDefaultFollowUpDays("thank_you")).toBe(0);
    });
  });

  describe("getDueFollowUps", () => {
    it("returns records that are sent and past their follow-up date", () => {
      const scheduler = createFollowUpScheduler();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      const due = makeRecord({
        id: "due",
        status: "sent",
        followUpDate: now - MS_PER_DAY, // yesterday
      });
      const notDue = makeRecord({
        id: "not-due",
        status: "sent",
        followUpDate: now + MS_PER_DAY, // tomorrow
      });
      const draftWithDate = makeRecord({
        id: "draft-with-date",
        status: "draft",
        followUpDate: now - MS_PER_DAY,
      });
      const sentNoDate = makeRecord({
        id: "sent-no-date",
        status: "sent",
      });

      const results = scheduler.getDueFollowUps([due, notDue, draftWithDate, sentNoDate]);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("due");
    });

    it("returns empty array when no records are due", () => {
      const scheduler = createFollowUpScheduler();
      const results = scheduler.getDueFollowUps([]);
      expect(results).toEqual([]);
    });

    it("includes records whose follow-up date is exactly now", () => {
      const scheduler = createFollowUpScheduler();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      const exactlyNow = makeRecord({
        id: "exact",
        status: "sent",
        followUpDate: now,
      });

      const results = scheduler.getDueFollowUps([exactlyNow]);
      expect(results).toHaveLength(1);
    });
  });

  describe("generateFollowUpDraft", () => {
    it("creates a follow-up record referencing the original", () => {
      const scheduler = createFollowUpScheduler();
      const original = makeRecord({
        id: "orig-1",
        recipientId: "person-42",
        messageType: "cold_outreach",
        relatedJobId: "job-99",
      });

      const draft = scheduler.generateFollowUpDraft(original, {
        name: "Jane Doe",
        company: "Acme Corp",
      });

      expect(draft.id).toMatch(/^followup_/);
      expect(draft.recipientId).toBe("person-42");
      expect(draft.recipientName).toBe("Jane Doe");
      expect(draft.messageType).toBe("follow_up");
      expect(draft.status).toBe("draft");
      expect(draft.relatedJobId).toBe("job-99");
      expect(draft.notes).toContain("Follow-up to orig-1");
    });

    it("sets a followUpDate on the new draft (10 days default for follow_up type)", () => {
      const scheduler = createFollowUpScheduler();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      const original = makeRecord();
      const draft = scheduler.generateFollowUpDraft(original, { name: "Jane Doe" });

      expect(draft.followUpDate).toBe(now + 10 * MS_PER_DAY);
    });

    it("preserves the channel from the original", () => {
      const scheduler = createFollowUpScheduler();
      const original = makeRecord({ channel: "linkedin" });

      const draft = scheduler.generateFollowUpDraft(original, { name: "Jane Doe" });
      expect(draft.channel).toBe("linkedin");
    });

    it("content references the original message type contextually", () => {
      const scheduler = createFollowUpScheduler();

      for (const type of [
        "warm_intro",
        "cold_outreach",
        "follow_up",
        "reconnection",
        "thank_you",
      ] as const) {
        const original = makeRecord({ messageType: type });
        const draft = scheduler.generateFollowUpDraft(original, { name: "Jane Doe" });
        // All follow-ups should start with greeting
        expect(draft.content).toContain("Hi Jane");
        expect(draft.content.length).toBeGreaterThan(20);
      }
    });

    it("includes company angle when recipient has company and original has relatedJobId", () => {
      const scheduler = createFollowUpScheduler();
      const original = makeRecord({ relatedJobId: "job-1" });
      const draft = scheduler.generateFollowUpDraft(original, {
        name: "Jane Doe",
        company: "Acme Corp",
      });

      expect(draft.content).toContain("Acme Corp");
    });

    it("includes generic CTA when original has no relatedJobId", () => {
      const scheduler = createFollowUpScheduler();
      const original = makeRecord({ relatedJobId: undefined });
      const draft = scheduler.generateFollowUpDraft(original, { name: "Jane Doe" });

      expect(draft.content).toContain("quick chat");
    });

    it("includes job-related CTA when original has relatedJobId", () => {
      const scheduler = createFollowUpScheduler();
      const original = makeRecord({ relatedJobId: "job-1" });
      const draft = scheduler.generateFollowUpDraft(original, { name: "Jane Doe" });

      expect(draft.content).toContain("15-minute call");
    });
  });
});
