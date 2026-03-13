/**
 * Outreach automation type definitions.
 *
 * Covers outreach records, templates, style profiling, and pipeline summaries
 * for the career intelligence outreach system.
 */

// ── Message classification ──────────────────────────────────────────────────

/** The intent behind an outreach message. */
export type MessageType =
  | "warm_intro"
  | "cold_outreach"
  | "follow_up"
  | "reconnection"
  | "thank_you";

/** Pipeline status of an outreach record. */
export type OutreachStatus = "draft" | "approved" | "sent" | "replied" | "no_response";

/** Communication channel for outreach delivery. */
export type OutreachChannel = "email" | "linkedin" | "twitter" | "other";

/** Tone preset for message generation. */
export type MessageTone = "formal" | "casual" | "professional";

// ── Records ─────────────────────────────────────────────────────────────────

/** A single outreach message with pipeline tracking. */
export type OutreachRecord = {
  id: string;
  /** Entity-graph person ID of the recipient. */
  recipientId: string;
  recipientName: string;
  channel: OutreachChannel;
  messageType: MessageType;
  content: string;
  status: OutreachStatus;
  sentAt?: number;
  followUpDate?: number;
  /** Links this outreach to a specific job listing. */
  relatedJobId?: string;
  notes: string[];
};

// ── Templates ───────────────────────────────────────────────────────────────

/** A message section descriptor used by the generator. */
export type TemplateSection = {
  name: string;
  purpose: string;
};

/** Structural template for a message type. */
export type OutreachTemplate = {
  messageType: MessageType;
  tone: MessageTone;
  sections: TemplateSection[];
};

// ── Style profiling ─────────────────────────────────────────────────────────

/** Learned communication style from user edits. */
export type StyleProfile = {
  preferredTone: MessageTone;
  avgLength: number;
  /** 0 = very casual, 1 = very formal. */
  formality: number;
  usesEmoji: boolean;
  signatureStyle: string;
  learnedFromEdits: number;
};

/** Sensible starting style before learning kicks in. */
export const DEFAULT_STYLE_PROFILE: StyleProfile = {
  preferredTone: "professional",
  avgLength: 150,
  formality: 0.6,
  usesEmoji: false,
  signatureStyle: "Best regards",
  learnedFromEdits: 0,
};

// ── Pipeline summary ────────────────────────────────────────────────────────

/** Aggregate stats for the outreach pipeline. */
export type OutreachPipelineSummary = {
  totalDrafts: number;
  totalSent: number;
  totalReplied: number;
  totalNoResponse: number;
  pendingFollowUps: number;
  responseRate: number;
};

// ── Generator params ────────────────────────────────────────────────────────

/** Context about the recipient for draft generation. */
export type RecipientContext = {
  company?: string;
  title?: string;
  sharedHistory?: string[];
};

/** Context about a target job for the outreach. */
export type JobContext = {
  title: string;
  company: string;
  whyInterested: string;
};

/** Context about the network path to the recipient. */
export type NetworkContext = {
  howConnected: string;
  mutualConnections?: string[];
};

/** All parameters needed to draft an outreach message. */
export type DraftParams = {
  recipientName: string;
  recipientContext: RecipientContext;
  messageType: MessageType;
  purpose: string;
  jobContext?: JobContext;
  networkContext?: NetworkContext;
  style?: StyleProfile;
};

// ── Serialisation ───────────────────────────────────────────────────────────

/** JSON-safe shape for OutreachRecord persistence. */
export type OutreachRecordJSON = OutreachRecord;

/** JSON-safe shape for StyleProfile persistence. */
export type StyleProfileJSON = StyleProfile;
