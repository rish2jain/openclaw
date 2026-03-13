/**
 * Outreach pipeline — tracks outreach records and their status transitions.
 *
 * Provides filtered views (by status, recipient, job) and aggregate statistics
 * for the outreach funnel. Supports JSON round-tripping for persistence.
 */

import type { OutreachPipelineSummary, OutreachRecord, OutreachStatus } from "./types.js";

// ── Public API ──────────────────────────────────────────────────────────────

export type OutreachPipeline = {
  /** Add a record to the pipeline. */
  addRecord(record: OutreachRecord): void;
  /** Transition a record to a new status. Automatically sets sentAt on "sent". */
  updateStatus(id: string, status: OutreachStatus): void;
  /** All records matching a given status. */
  getByStatus(status: OutreachStatus): OutreachRecord[];
  /** All records for a given recipient (entity-graph person ID). */
  getByRecipient(recipientId: string): OutreachRecord[];
  /** All records linked to a specific job listing. */
  getByJob(jobId: string): OutreachRecord[];
  /** Records that were sent, have a followUpDate in the past, and never got a reply. */
  getPendingFollowUps(): OutreachRecord[];
  /** Aggregate pipeline statistics. */
  getSummary(): OutreachPipelineSummary;
  /** Ratio of replied / (sent + no_response). Returns 0 when denominator is 0. */
  getResponseRate(): number;
  /** Serialise the entire pipeline for persistence. */
  toJSON(): OutreachRecord[];
  /** Restore pipeline state from a previous toJSON() snapshot. */
  fromJSON(data: OutreachRecord[]): void;
};

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create an empty outreach pipeline.
 *
 * Records are stored in insertion order. Lookups are linear scans, which is
 * appropriate for personal-scale pipelines (< 10k records).
 */
export function createOutreachPipeline(): OutreachPipeline {
  const records: OutreachRecord[] = [];
  const byId = new Map<string, OutreachRecord>();

  function rebuildIndex(): void {
    byId.clear();
    for (const r of records) {
      byId.set(r.id, r);
    }
  }

  return {
    addRecord(record: OutreachRecord): void {
      if (byId.has(record.id)) {
        return;
      } // Dedup by ID
      records.push(record);
      byId.set(record.id, record);
    },

    updateStatus(id: string, status: OutreachStatus): void {
      const record = byId.get(id);
      if (!record) {
        return;
      }
      record.status = status;
      if (status === "sent" && record.sentAt === undefined) {
        record.sentAt = Date.now();
      }
    },

    getByStatus(status: OutreachStatus): OutreachRecord[] {
      const result: OutreachRecord[] = [];
      for (const r of records) {
        if (r.status === status) {
          result.push(r);
        }
      }
      return result;
    },

    getByRecipient(recipientId: string): OutreachRecord[] {
      const result: OutreachRecord[] = [];
      for (const r of records) {
        if (r.recipientId === recipientId) {
          result.push(r);
        }
      }
      return result;
    },

    getByJob(jobId: string): OutreachRecord[] {
      const result: OutreachRecord[] = [];
      for (const r of records) {
        if (r.relatedJobId === jobId) {
          result.push(r);
        }
      }
      return result;
    },

    getPendingFollowUps(): OutreachRecord[] {
      const now = Date.now();
      const result: OutreachRecord[] = [];
      for (const r of records) {
        if (r.status === "sent" && r.followUpDate !== undefined && r.followUpDate <= now) {
          result.push(r);
        }
      }
      return result;
    },

    getSummary(): OutreachPipelineSummary {
      let totalDrafts = 0;
      let totalSent = 0;
      let totalReplied = 0;
      let totalNoResponse = 0;
      let pendingFollowUps = 0;
      const now = Date.now();

      for (const r of records) {
        switch (r.status) {
          case "draft":
          case "approved":
            totalDrafts++;
            break;
          case "sent":
            totalSent++;
            if (r.followUpDate !== undefined && r.followUpDate <= now) {
              pendingFollowUps++;
            }
            break;
          case "replied":
            totalReplied++;
            break;
          case "no_response":
            totalNoResponse++;
            break;
        }
      }

      const denominator = totalSent + totalReplied + totalNoResponse;
      const responseRate = denominator > 0 ? totalReplied / denominator : 0;

      return {
        totalDrafts,
        totalSent,
        totalReplied,
        totalNoResponse,
        pendingFollowUps,
        responseRate,
      };
    },

    getResponseRate(): number {
      let replied = 0;
      let sent = 0;
      let noResponse = 0;

      for (const r of records) {
        if (r.status === "replied") {
          replied++;
        } else if (r.status === "sent") {
          sent++;
        } else if (r.status === "no_response") {
          noResponse++;
        }
      }

      const denominator = sent + replied + noResponse;
      return denominator > 0 ? replied / denominator : 0;
    },

    toJSON(): OutreachRecord[] {
      return records.map((r) => ({ ...r }));
    },

    fromJSON(data: OutreachRecord[]): void {
      records.length = 0;
      for (const r of data) {
        records.push({ ...r });
      }
      rebuildIndex();
    },
  };
}
