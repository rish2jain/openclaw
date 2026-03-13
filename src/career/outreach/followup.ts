/**
 * Follow-up scheduling and draft generation.
 *
 * Manages follow-up timing per message type and generates concise follow-up
 * drafts that reference the original message without quoting it.
 */

import type { MessageType, OutreachRecord } from "./types.js";

// ── Constants ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default days until follow-up, by original message type. */
const DEFAULT_FOLLOW_UP_DAYS: Record<MessageType, number> = {
  warm_intro: 5,
  cold_outreach: 7,
  follow_up: 10,
  reconnection: 14,
  thank_you: 0,
};

// ── Public API ──────────────────────────────────────────────────────────────

export type RecipientInfo = {
  name: string;
  company?: string;
};

export type FollowUpScheduler = {
  /**
   * Set a follow-up date on the given record, N days from now.
   * Mutates the record in place and returns it for chaining.
   */
  scheduleFollowUp(record: OutreachRecord, daysFromNow: number): OutreachRecord;

  /** Get the default follow-up interval for a message type. */
  getDefaultFollowUpDays(messageType: MessageType): number;

  /** Return records from the list that are due for follow-up (followUpDate <= now, status "sent"). */
  getDueFollowUps(records: OutreachRecord[]): OutreachRecord[];

  /**
   * Generate a follow-up draft based on the original outreach.
   *
   * The follow-up is shorter than the original, references the previous
   * message without quoting it, and attempts to introduce a new angle.
   */
  generateFollowUpDraft(original: OutreachRecord, recipientContext: RecipientInfo): OutreachRecord;
};

// ── Factory ─────────────────────────────────────────────────────────────────

export function createFollowUpScheduler(): FollowUpScheduler {
  return {
    scheduleFollowUp(record: OutreachRecord, daysFromNow: number): OutreachRecord {
      record.followUpDate = Date.now() + daysFromNow * MS_PER_DAY;
      return record;
    },

    getDefaultFollowUpDays(messageType: MessageType): number {
      return DEFAULT_FOLLOW_UP_DAYS[messageType];
    },

    getDueFollowUps(records: OutreachRecord[]): OutreachRecord[] {
      const now = Date.now();
      const result: OutreachRecord[] = [];
      for (const r of records) {
        if (r.status === "sent" && r.followUpDate !== undefined && r.followUpDate <= now) {
          result.push(r);
        }
      }
      return result;
    },

    generateFollowUpDraft(
      original: OutreachRecord,
      recipientContext: RecipientInfo,
    ): OutreachRecord {
      const content = buildFollowUpContent(original, recipientContext);
      const defaultDays = DEFAULT_FOLLOW_UP_DAYS.follow_up;

      return {
        id: generateId(),
        recipientId: original.recipientId,
        recipientName: recipientContext.name,
        channel: original.channel,
        messageType: "follow_up",
        content,
        status: "draft",
        followUpDate: Date.now() + defaultDays * MS_PER_DAY,
        relatedJobId: original.relatedJobId,
        notes: [`Follow-up to ${original.id}`],
      };
    },
  };
}

// ── Follow-up content generation ────────────────────────────────────────────

/**
 * Build a follow-up message body. The message is shorter than the original,
 * references the prior outreach contextually (not verbatim), and tries to
 * introduce a fresh angle to re-engage the recipient.
 */
function buildFollowUpContent(original: OutreachRecord, recipient: RecipientInfo): string {
  const firstName = recipient.name.split(" ")[0];
  const parts: string[] = [];

  // Opening — reference the previous message without quoting it
  parts.push(`Hi ${firstName},`);
  parts.push(buildReference(original));

  // New angle — add fresh context based on the original message type
  const angle = buildNewAngle(original, recipient);
  if (angle) {
    parts.push(angle);
  }

  // Clear call to action
  parts.push(buildCallToAction(original));

  return parts.join("\n\n");
}

function buildReference(original: OutreachRecord): string {
  switch (original.messageType) {
    case "warm_intro":
      return (
        `I reached out recently about connecting through a mutual contact. ` +
        `I know things get busy, so I wanted to circle back briefly.`
      );
    case "cold_outreach":
      return (
        `I sent a note a little while ago about your work and a potential ` +
        `conversation. I wanted to follow up in case it slipped through.`
      );
    case "follow_up":
      return (
        `I have followed up before on this, and I appreciate your patience. ` +
        `Just one more gentle nudge in case the timing is better now.`
      );
    case "reconnection":
      return (
        `I reached out to reconnect recently. Completely understand if the ` +
        `timing was not right — thought I would try once more.`
      );
    case "thank_you":
      return (
        `I sent a thank-you note recently and wanted to follow up on the ` +
        `next steps we discussed.`
      );
  }
}

function buildNewAngle(original: OutreachRecord, recipient: RecipientInfo): string | undefined {
  if (original.relatedJobId && recipient.company) {
    return (
      `I have been doing some additional research on ${recipient.company} ` +
      `and am even more excited about the potential fit.`
    );
  }

  if (recipient.company) {
    return (
      `I noticed some interesting developments at ${recipient.company} ` +
      `recently and thought it added more context to my initial note.`
    );
  }

  return undefined;
}

function buildCallToAction(original: OutreachRecord): string {
  if (original.relatedJobId) {
    return (
      `Would a 15-minute call work sometime this week? Happy to work around ` + `your schedule.`
    );
  }
  return `If a quick chat would work, I am flexible on timing. If not, no pressure at all.`;
}

// ── Utilities ───────────────────────────────────────────────────────────────

let counter = 0;

function generateId(): string {
  counter++;
  return `followup_${Date.now()}_${counter}`;
}
