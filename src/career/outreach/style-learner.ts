/**
 * Style learner — infers user communication preferences from their edits.
 *
 * When the outreach generator produces a draft and the user modifies it,
 * recording original-vs-edited pairs lets the learner converge on the user's
 * preferred tone, length, formality, and structural choices. A minimum of 3
 * edit samples is required before the defaults are adjusted.
 */

import type { MessageTone, StyleProfile } from "./types.js";
import { DEFAULT_STYLE_PROFILE } from "./types.js";

// ── Constants ───────────────────────────────────────────────────────────────

/** Minimum edits before the learner departs from defaults. */
const MIN_EDITS_THRESHOLD = 3;

/** Smoothing factor for running averages (higher = slower adaptation). */
const SMOOTHING = 0.3;

/** Max length samples to keep; sliding window to avoid unbounded memory growth. */
export const MAX_LENGTH_SAMPLES = 200;

// ── Vocabulary lists for formality detection ────────────────────────────────

const FORMAL_MARKERS = new Set([
  "sincerely",
  "regards",
  "respectfully",
  "kindly",
  "dear",
  "pursuant",
  "enclosed",
  "herewith",
  "furthermore",
  "accordingly",
  "esteemed",
  "cordially",
  "henceforth",
  "whereas",
]);

const CASUAL_MARKERS = new Set([
  "hey",
  "hi",
  "cheers",
  "thanks",
  "cool",
  "awesome",
  "btw",
  "fyi",
  "lol",
  "haha",
  "gonna",
  "wanna",
  "gotta",
  "nah",
  "yep",
  "yup",
  "sure",
  "totally",
]);

const EMOJI_PATTERN = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;

// ── Public API ──────────────────────────────────────────────────────────────

export type StyleLearner = {
  /** Record an original draft alongside the user's edited version. */
  recordEdit(original: string, edited: string): void;
  /** Get the current learned style profile. */
  getStyleProfile(): StyleProfile;
  /** Serialise learner state for persistence. */
  toJSON(): StyleLearnerState;
  /** Restore learner state from a previous toJSON() snapshot. */
  fromJSON(state: StyleLearnerState): void;
};

/** Serialisable internal state. */
export type StyleLearnerState = {
  editCount: number;
  avgLengthRatio: number;
  formalityDelta: number;
  emojiAdditions: number;
  emojiRemovals: number;
  signaturesSeen: string[];
  lengthSamples: number[];
};

// ── Factory ─────────────────────────────────────────────────────────────────

export function createStyleLearner(): StyleLearner {
  let editCount = 0;
  let avgLengthRatio = 1.0;
  let formalityDelta = 0;
  let emojiAdditions = 0;
  let emojiRemovals = 0;
  const signaturesSeen: string[] = [];
  const lengthSamples: number[] = [];

  return {
    recordEdit(original: string, edited: string): void {
      if (original.length === 0) {
        return;
      }
      editCount++;

      // ── Length tracking ──────────────────────────────────────────
      const ratio = edited.length / original.length;
      avgLengthRatio = smooth(avgLengthRatio, ratio);
      lengthSamples.push(edited.length);
      if (lengthSamples.length > MAX_LENGTH_SAMPLES) {
        lengthSamples.splice(0, lengthSamples.length - MAX_LENGTH_SAMPLES);
      }

      // ── Formality shift ─────────────────────────────────────────
      const origFormality = measureFormality(original);
      const editFormality = measureFormality(edited);
      const delta = editFormality - origFormality;
      formalityDelta = smooth(formalityDelta, delta);

      // ── Emoji usage ─────────────────────────────────────────────
      const origEmojis = countEmojis(original);
      const editEmojis = countEmojis(edited);
      if (editEmojis > origEmojis) {
        emojiAdditions++;
      }
      if (editEmojis < origEmojis) {
        emojiRemovals++;
      }

      // ── Signature detection ─────────────────────────────────────
      const sig = detectSignature(edited);
      if (sig && !signaturesSeen.includes(sig)) {
        signaturesSeen.push(sig);
      }
    },

    getStyleProfile(): StyleProfile {
      if (editCount < MIN_EDITS_THRESHOLD) {
        return { ...DEFAULT_STYLE_PROFILE, learnedFromEdits: editCount };
      }

      // Preferred tone derived from formality delta
      const preferredTone = deriveTone(formalityDelta);

      // Average message length from samples
      const avgLength =
        lengthSamples.length > 0
          ? Math.round(lengthSamples.reduce((a, b) => a + b, 0) / lengthSamples.length)
          : DEFAULT_STYLE_PROFILE.avgLength;

      // Formality as a 0-1 value
      const baseFormality = DEFAULT_STYLE_PROFILE.formality;
      const formality = clamp(baseFormality + formalityDelta, 0, 1);

      // Emoji preference
      const usesEmoji = emojiAdditions > emojiRemovals;

      // Most recently observed signature, or default
      const signatureStyle =
        signaturesSeen.length > 0
          ? signaturesSeen[signaturesSeen.length - 1]
          : DEFAULT_STYLE_PROFILE.signatureStyle;

      return {
        preferredTone,
        avgLength,
        formality,
        usesEmoji,
        signatureStyle,
        learnedFromEdits: editCount,
      };
    },

    toJSON(): StyleLearnerState {
      return {
        editCount,
        avgLengthRatio,
        formalityDelta,
        emojiAdditions,
        emojiRemovals,
        signaturesSeen: [...signaturesSeen],
        lengthSamples: [...lengthSamples],
      };
    },

    fromJSON(state: StyleLearnerState): void {
      editCount = state.editCount;
      avgLengthRatio = state.avgLengthRatio;
      formalityDelta = state.formalityDelta;
      emojiAdditions = state.emojiAdditions;
      emojiRemovals = state.emojiRemovals;
      signaturesSeen.length = 0;
      signaturesSeen.push(...state.signaturesSeen);
      lengthSamples.length = 0;
      lengthSamples.push(...state.lengthSamples);
      if (lengthSamples.length > MAX_LENGTH_SAMPLES) {
        lengthSamples.splice(0, lengthSamples.length - MAX_LENGTH_SAMPLES);
      }
    },
  };
}

// ── Formality measurement ───────────────────────────────────────────────────

/**
 * Produce a formality score in roughly [-1, 1] for a piece of text.
 * Positive = formal, negative = casual.
 */
function measureFormality(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length === 0) {
    return 0;
  }

  let formalCount = 0;
  let casualCount = 0;

  for (const w of words) {
    const cleaned = w.replace(/[^a-z]/g, "");
    if (FORMAL_MARKERS.has(cleaned)) {
      formalCount++;
    }
    if (CASUAL_MARKERS.has(cleaned)) {
      casualCount++;
    }
  }

  const total = formalCount + casualCount;
  if (total === 0) {
    return 0;
  }
  return (formalCount - casualCount) / total;
}

// ── Emoji counting ──────────────────────────────────────────────────────────

function countEmojis(text: string): number {
  let count = 0;
  for (const char of text) {
    if (EMOJI_PATTERN.test(char)) {
      count++;
    }
  }
  return count;
}

// ── Signature detection ─────────────────────────────────────────────────────

/** Common sign-off patterns to detect at the end of a message. */
const SIGN_OFF_PATTERNS = [
  "best regards",
  "kind regards",
  "warm regards",
  "regards",
  "sincerely",
  "cheers",
  "thanks",
  "thank you",
  "best",
  "all the best",
  "respectfully",
  "take care",
];

/**
 * Attempt to detect a sign-off style from the last few lines of text.
 * Returns the matched pattern or undefined.
 */
function detectSignature(text: string): string | undefined {
  const lines = text.trim().split("\n");
  // Check the last 3 lines for a sign-off
  const tail = lines.slice(-3).map((l) => l.trim().toLowerCase());

  for (const line of tail) {
    for (const pattern of SIGN_OFF_PATTERNS) {
      if (line.startsWith(pattern)) {
        // Return the original-cased version from the text
        const original = lines.slice(-3).find((l) => l.trim().toLowerCase().startsWith(pattern));
        return original?.trim() ?? pattern;
      }
    }
  }

  return undefined;
}

// ── Tone derivation ─────────────────────────────────────────────────────────

function deriveTone(formalityDelta: number): MessageTone {
  if (formalityDelta > 0.15) {
    return "formal";
  }
  if (formalityDelta < -0.15) {
    return "casual";
  }
  return "professional";
}

// ── Utilities ───────────────────────────────────────────────────────────────

/** Exponential moving average smoothing. */
function smooth(current: number, sample: number): number {
  return current * (1 - SMOOTHING) + sample * SMOOTHING;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
