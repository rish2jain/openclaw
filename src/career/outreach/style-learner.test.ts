import { describe, expect, it } from "vitest";
import { createStyleLearner, MAX_LENGTH_SAMPLES } from "./style-learner.js";
import { DEFAULT_STYLE_PROFILE } from "./types.js";

describe("StyleLearner", () => {
  describe("recordEdit + getStyleProfile", () => {
    it("returns default profile when fewer than 3 edits recorded", () => {
      const learner = createStyleLearner();

      learner.recordEdit("Hello there", "Hey there");
      learner.recordEdit("Dear sir", "Hi friend");

      const profile = learner.getStyleProfile();
      expect(profile.preferredTone).toBe(DEFAULT_STYLE_PROFILE.preferredTone);
      expect(profile.formality).toBe(DEFAULT_STYLE_PROFILE.formality);
      expect(profile.learnedFromEdits).toBe(2);
    });

    it("returns default profile when zero edits recorded", () => {
      const learner = createStyleLearner();
      const profile = learner.getStyleProfile();
      expect(profile.learnedFromEdits).toBe(0);
      expect(profile).toEqual({ ...DEFAULT_STYLE_PROFILE, learnedFromEdits: 0 });
    });

    it("adjusts after reaching the 3-edit threshold", () => {
      const learner = createStyleLearner();

      learner.recordEdit("Dear sir, pursuant to our discussion", "Hey, about our chat");
      learner.recordEdit("Enclosed herewith the document", "Here is the doc btw");
      learner.recordEdit("Respectfully yours, sincerely", "Cheers, thanks");

      const profile = learner.getStyleProfile();
      expect(profile.learnedFromEdits).toBe(3);
      // Consistent casual edits should shift formality down from the 0.6 default
      expect(profile.formality).toBeLessThan(DEFAULT_STYLE_PROFILE.formality);
    });

    it("skips edits where original is empty", () => {
      const learner = createStyleLearner();

      learner.recordEdit("", "some text");
      learner.recordEdit("", "more text");
      learner.recordEdit("", "even more");

      const profile = learner.getStyleProfile();
      // Empty originals are ignored, so editCount stays 0
      expect(profile.learnedFromEdits).toBe(0);
    });
  });

  describe("EMA smoothing behaviour", () => {
    it("converges towards user preference over many edits", () => {
      const learner = createStyleLearner();

      // Consistently edit to shorter, more casual messages
      for (let i = 0; i < 10; i++) {
        learner.recordEdit(
          "Dear colleague, pursuant to our earlier discussion, I would like to respectfully request a meeting.",
          "Hey, can we chat?",
        );
      }

      const profile = learner.getStyleProfile();
      expect(profile.learnedFromEdits).toBe(10);
      // avgLength should reflect the shorter edited messages
      expect(profile.avgLength).toBeLessThan(100);
      // Formality should be low after consistent casual edits
      expect(profile.formality).toBeLessThan(0.5);
    });

    it("recent edits weigh more than older ones (EMA property)", () => {
      const learner = createStyleLearner();

      // Start with formal edits
      for (let i = 0; i < 5; i++) {
        learner.recordEdit("Hey friend", "Dear sir, sincerely yours");
      }
      const formalProfile = learner.getStyleProfile();

      // Then switch to casual edits
      for (let i = 0; i < 5; i++) {
        learner.recordEdit("Dear sir, sincerely yours", "Hey, cheers!");
      }
      const casualProfile = learner.getStyleProfile();

      // After the casual swing the formality should have dropped
      expect(casualProfile.formality).toBeLessThan(formalProfile.formality);
    });
  });

  describe("tone derivation", () => {
    it("derives formal tone when edits add formal markers", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 5; i++) {
        learner.recordEdit("hey cool awesome", "Dear sir, sincerely, respectfully");
      }

      const profile = learner.getStyleProfile();
      expect(profile.preferredTone).toBe("formal");
    });

    it("derives casual tone when edits add casual markers", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 5; i++) {
        learner.recordEdit("Dear sir, sincerely, respectfully", "hey cool awesome btw");
      }

      const profile = learner.getStyleProfile();
      expect(profile.preferredTone).toBe("casual");
    });

    it("derives professional tone when edits are neutral", () => {
      const learner = createStyleLearner();

      // Use text with no formal or casual markers
      for (let i = 0; i < 5; i++) {
        learner.recordEdit(
          "I would like to discuss the project timeline with you.",
          "Let me know about the project timeline.",
        );
      }

      const profile = learner.getStyleProfile();
      expect(profile.preferredTone).toBe("professional");
    });
  });

  describe("emoji tracking", () => {
    it("detects emoji additions", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 4; i++) {
        learner.recordEdit("That sounds great", "That sounds great \u{1F389}");
      }

      const profile = learner.getStyleProfile();
      expect(profile.usesEmoji).toBe(true);
    });

    it("detects emoji removals", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 4; i++) {
        learner.recordEdit("Great news \u{1F389}\u{1F680}", "Great news");
      }

      const profile = learner.getStyleProfile();
      expect(profile.usesEmoji).toBe(false);
    });
  });

  describe("signature detection", () => {
    it("picks up a sign-off from the edited text", () => {
      const learner = createStyleLearner();

      // Use text where the last line is clearly a sign-off
      for (let i = 0; i < 3; i++) {
        learner.recordEdit("Some message body here.", "Some message body here.\n\nWarm regards");
      }

      const profile = learner.getStyleProfile();
      // SIGN_OFF_PATTERNS contains "warm regards" (and "regards"); the detection
      // logic captures the original line text, so signatureStyle is "Warm regards".
      expect(profile.signatureStyle).toBe("Warm regards");
    });

    it("uses the most recent signature when multiple are seen", () => {
      const learner = createStyleLearner();

      learner.recordEdit("body text", "body text\n\nCheers");
      learner.recordEdit("body text", "body text\n\nBest regards");
      learner.recordEdit("body text", "body text\n\nSincerely");

      const profile = learner.getStyleProfile();
      expect(profile.signatureStyle).toBe("Sincerely");
    });

    it("returns default signature when none detected", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 3; i++) {
        learner.recordEdit("plain text", "also plain text");
      }

      const profile = learner.getStyleProfile();
      expect(profile.signatureStyle).toBe(DEFAULT_STYLE_PROFILE.signatureStyle);
    });

    it("detects cheers as a sign-off", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 3; i++) {
        learner.recordEdit("body", "body\n\nCheers");
      }

      const profile = learner.getStyleProfile();
      expect(profile.signatureStyle).toBe("Cheers");
    });
  });

  describe("serialisation round-trip (toJSON / fromJSON)", () => {
    it("preserves state through serialisation", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 5; i++) {
        learner.recordEdit("Dear sir, sincerely", "Hey, cheers btw");
      }

      const snapshot = learner.toJSON();
      const restored = createStyleLearner();
      restored.fromJSON(snapshot);

      const original = learner.getStyleProfile();
      const after = restored.getStyleProfile();

      expect(after.preferredTone).toBe(original.preferredTone);
      expect(after.avgLength).toBe(original.avgLength);
      expect(after.formality).toBeCloseTo(original.formality, 5);
      expect(after.usesEmoji).toBe(original.usesEmoji);
      expect(after.signatureStyle).toBe(original.signatureStyle);
      expect(after.learnedFromEdits).toBe(original.learnedFromEdits);
    });

    it("toJSON returns correct shape", () => {
      const learner = createStyleLearner();
      learner.recordEdit("a", "b");

      const json = learner.toJSON();
      expect(json).toHaveProperty("editCount", 1);
      expect(json).toHaveProperty("avgLengthRatio");
      expect(json).toHaveProperty("formalityDelta");
      expect(json).toHaveProperty("emojiAdditions");
      expect(json).toHaveProperty("emojiRemovals");
      expect(json).toHaveProperty("signaturesSeen");
      expect(json).toHaveProperty("lengthSamples");
      expect(Array.isArray(json.signaturesSeen)).toBe(true);
      expect(Array.isArray(json.lengthSamples)).toBe(true);
    });

    it("caps lengthSamples via sliding window when recording many edits", () => {
      const learner = createStyleLearner();
      for (let i = 0; i < 250; i++) {
        learner.recordEdit("original", "edited");
      }
      const json = learner.toJSON();
      expect(json.lengthSamples.length).toBeLessThanOrEqual(MAX_LENGTH_SAMPLES);
    });

    it("trims lengthSamples to cap when restoring from JSON with excess samples", () => {
      const json = {
        editCount: 250,
        avgLengthRatio: 1,
        formalityDelta: 0,
        emojiAdditions: 0,
        emojiRemovals: 0,
        signaturesSeen: [] as string[],
        lengthSamples: Array.from({ length: 250 }, (_, i) => 10 + i),
      };
      const restored = createStyleLearner();
      restored.fromJSON(json);
      expect(restored.toJSON().lengthSamples.length).toBeLessThanOrEqual(MAX_LENGTH_SAMPLES);
    });
  });

  describe("formality clamping", () => {
    it("clamps formality to [0, 1] even with extreme casual edits", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 30; i++) {
        learner.recordEdit(
          "Dear esteemed colleague, sincerely respectfully",
          "hey lol gonna wanna nah yep btw",
        );
      }

      const profile = learner.getStyleProfile();
      expect(profile.formality).toBeGreaterThanOrEqual(0);
      expect(profile.formality).toBeLessThanOrEqual(1);
    });

    it("clamps formality to [0, 1] even with extreme formal edits", () => {
      const learner = createStyleLearner();

      for (let i = 0; i < 30; i++) {
        learner.recordEdit(
          "hey lol gonna wanna nah yep btw",
          "Dear esteemed colleague, sincerely respectfully accordingly",
        );
      }

      const profile = learner.getStyleProfile();
      expect(profile.formality).toBeGreaterThanOrEqual(0);
      expect(profile.formality).toBeLessThanOrEqual(1);
    });
  });
});
