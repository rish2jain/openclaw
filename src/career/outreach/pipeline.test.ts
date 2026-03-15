import { describe, expect, it, vi, afterEach } from "vitest";
import { createOutreachPipeline } from "./pipeline.js";
import type { OutreachRecord } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeRecord(overrides: Partial<OutreachRecord> = {}): OutreachRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    recipientId: "person-1",
    recipientName: "Jane Doe",
    channel: "email",
    messageType: "cold_outreach",
    content: "Hello",
    status: "draft",
    notes: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("OutreachPipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("addRecord", () => {
    it("adds a record that can be retrieved by status", () => {
      const pipeline = createOutreachPipeline();
      const record = makeRecord({ id: "a", status: "draft" });

      pipeline.addRecord(record);

      expect(pipeline.getByStatus("draft")).toHaveLength(1);
      expect(pipeline.getByStatus("draft")[0].id).toBe("a");
    });

    it("deduplicates records by ID", () => {
      const pipeline = createOutreachPipeline();
      const record = makeRecord({ id: "dup" });

      pipeline.addRecord(record);
      pipeline.addRecord(record);

      expect(pipeline.getByStatus("draft")).toHaveLength(1);
    });
  });

  describe("updateStatus", () => {
    it("transitions a record to a new status", () => {
      const pipeline = createOutreachPipeline();
      const record = makeRecord({ id: "x", status: "draft" });
      pipeline.addRecord(record);

      pipeline.updateStatus("x", "sent");

      expect(pipeline.getByStatus("sent")).toHaveLength(1);
      expect(pipeline.getByStatus("draft")).toHaveLength(0);
    });

    it("sets sentAt when transitioning to sent", () => {
      const pipeline = createOutreachPipeline();
      const now = 1700000000000;
      vi.spyOn(Date, "now").mockReturnValue(now);

      const record = makeRecord({ id: "s" });
      pipeline.addRecord(record);
      pipeline.updateStatus("s", "sent");

      const sent = pipeline.getByStatus("sent")[0];
      expect(sent.sentAt).toBe(now);
    });

    it("does not overwrite sentAt on subsequent status updates", () => {
      const pipeline = createOutreachPipeline();
      const firstTime = 1700000000000;
      vi.spyOn(Date, "now").mockReturnValue(firstTime);

      const record = makeRecord({ id: "s2" });
      pipeline.addRecord(record);
      pipeline.updateStatus("s2", "sent");

      vi.spyOn(Date, "now").mockReturnValue(firstTime + 100000);
      pipeline.updateStatus("s2", "replied");

      const replied = pipeline.getByStatus("replied")[0];
      expect(replied.sentAt).toBe(firstTime);
    });

    it("silently ignores updates for non-existent IDs", () => {
      const pipeline = createOutreachPipeline();
      // Should not throw
      pipeline.updateStatus("non-existent", "sent");
    });
  });

  describe("getByRecipient", () => {
    it("filters records by recipientId", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "a", recipientId: "p1" }));
      pipeline.addRecord(makeRecord({ id: "b", recipientId: "p2" }));
      pipeline.addRecord(makeRecord({ id: "c", recipientId: "p1" }));

      const results = pipeline.getByRecipient("p1");
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id).toSorted()).toEqual(["a", "c"]);
    });
  });

  describe("getByJob", () => {
    it("filters records by relatedJobId", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "a", relatedJobId: "j1" }));
      pipeline.addRecord(makeRecord({ id: "b", relatedJobId: "j2" }));
      pipeline.addRecord(makeRecord({ id: "c", relatedJobId: "j1" }));

      const results = pipeline.getByJob("j1");
      expect(results).toHaveLength(2);
    });
  });

  describe("getPendingFollowUps", () => {
    it("returns sent records with past follow-up dates", () => {
      const pipeline = createOutreachPipeline();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      pipeline.addRecord(makeRecord({ id: "due", status: "sent", followUpDate: now - MS_PER_DAY }));
      pipeline.addRecord(
        makeRecord({ id: "future", status: "sent", followUpDate: now + MS_PER_DAY }),
      );
      pipeline.addRecord(makeRecord({ id: "no-date", status: "sent" }));
      pipeline.addRecord(
        makeRecord({ id: "draft-due", status: "draft", followUpDate: now - MS_PER_DAY }),
      );

      const pending = pipeline.getPendingFollowUps();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe("due");
    });
  });

  describe("getSummary", () => {
    it("returns correct aggregate counts", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "d1", status: "draft" }));
      pipeline.addRecord(makeRecord({ id: "d2", status: "approved" }));
      pipeline.addRecord(makeRecord({ id: "s1", status: "sent" }));
      pipeline.addRecord(makeRecord({ id: "s2", status: "sent" }));
      pipeline.addRecord(makeRecord({ id: "r1", status: "replied" }));
      pipeline.addRecord(makeRecord({ id: "n1", status: "no_response" }));

      const summary = pipeline.getSummary();
      expect(summary.totalDrafts).toBe(2); // draft + approved
      expect(summary.totalSent).toBe(2);
      expect(summary.totalReplied).toBe(1);
      expect(summary.totalNoResponse).toBe(1);
    });

    it("computes response rate correctly", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "s1", status: "sent" }));
      pipeline.addRecord(makeRecord({ id: "s2", status: "sent" }));
      pipeline.addRecord(makeRecord({ id: "r1", status: "replied" }));
      pipeline.addRecord(makeRecord({ id: "n1", status: "no_response" }));

      const summary = pipeline.getSummary();
      // 1 replied / (2 sent + 1 replied + 1 no_response) = 0.25
      expect(summary.responseRate).toBeCloseTo(0.25);
    });

    it("returns 0 response rate when no outreach has been sent", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "d1", status: "draft" }));

      const summary = pipeline.getSummary();
      expect(summary.responseRate).toBe(0);
    });

    it("counts pending follow-ups in summary", () => {
      const pipeline = createOutreachPipeline();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      pipeline.addRecord(makeRecord({ id: "s1", status: "sent", followUpDate: now - MS_PER_DAY }));
      pipeline.addRecord(makeRecord({ id: "s2", status: "sent", followUpDate: now + MS_PER_DAY }));

      const summary = pipeline.getSummary();
      expect(summary.pendingFollowUps).toBe(1);
    });
  });

  describe("getResponseRate", () => {
    it("matches the summary response rate", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "s1", status: "sent" }));
      pipeline.addRecord(makeRecord({ id: "r1", status: "replied" }));

      const rate = pipeline.getResponseRate();
      // 1 / (1 + 1) = 0.5
      expect(rate).toBeCloseTo(0.5);
    });

    it("returns 0 for empty pipeline", () => {
      const pipeline = createOutreachPipeline();
      expect(pipeline.getResponseRate()).toBe(0);
    });
  });

  describe("serialisation (toJSON / fromJSON)", () => {
    it("round-trips all records", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "a", status: "draft" }));
      pipeline.addRecord(makeRecord({ id: "b", status: "sent" }));

      const snapshot = pipeline.toJSON();
      expect(snapshot).toHaveLength(2);

      const restored = createOutreachPipeline();
      restored.fromJSON(snapshot);

      expect(restored.getByStatus("draft")).toHaveLength(1);
      expect(restored.getByStatus("sent")).toHaveLength(1);
    });

    it("rebuilds internal index after fromJSON (updateStatus works)", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "z", status: "draft" }));

      const restored = createOutreachPipeline();
      restored.fromJSON(pipeline.toJSON());

      restored.updateStatus("z", "approved");
      expect(restored.getByStatus("approved")).toHaveLength(1);
    });

    it("clears existing records on fromJSON", () => {
      const pipeline = createOutreachPipeline();
      pipeline.addRecord(makeRecord({ id: "old" }));

      pipeline.fromJSON([makeRecord({ id: "new" })]);

      expect(pipeline.getByStatus("draft").map((r) => r.id)).toEqual(["new"]);
    });
  });
});
