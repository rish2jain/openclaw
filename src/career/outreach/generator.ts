/**
 * Outreach message drafting engine.
 *
 * Builds structured outreach messages from contextual parameters rather than
 * rigid templates. Each message type has a defined section flow; the generator
 * composes content for each section based on the provided recipient, job, and
 * network context.
 */

import type {
  DraftParams,
  MessageType,
  OutreachRecord,
  StyleProfile,
  TemplateSection,
} from "./types.js";
import { DEFAULT_STYLE_PROFILE } from "./types.js";

// ── Section definitions per message type ────────────────────────────────────

const SECTIONS: Record<MessageType, TemplateSection[]> = {
  warm_intro: [
    { name: "greeting", purpose: "Warm, personalised opening" },
    { name: "shared_context", purpose: "Reference shared connection or history" },
    { name: "request", purpose: "Clear, specific ask" },
    { name: "value_prop", purpose: "What you bring to the conversation" },
    { name: "easy_out", purpose: "Low-pressure close that respects their time" },
  ],
  cold_outreach: [
    { name: "hook", purpose: "Specific reference to their work or company" },
    { name: "background", purpose: "Your relevant experience in brief" },
    { name: "interest", purpose: "Why you are reaching out to them specifically" },
    { name: "ask", purpose: "One clear, actionable request" },
  ],
  follow_up: [
    { name: "reference", purpose: "Callback to previous interaction" },
    { name: "nudge", purpose: "New information or gentle reminder" },
    { name: "next_step", purpose: "Clear proposed next action" },
  ],
  reconnection: [
    { name: "observation", purpose: "Genuine note about their recent work" },
    { name: "update", purpose: "Brief update on your own trajectory" },
    { name: "invitation", purpose: "Open-ended invitation to reconnect" },
  ],
  thank_you: [
    { name: "appreciation", purpose: "Specific thanks for what they did" },
    { name: "takeaway", purpose: "Key insight from the conversation" },
    { name: "next_steps", purpose: "Concrete follow-through items" },
  ],
};

// ── Public API ──────────────────────────────────────────────────────────────

export type OutreachGenerator = {
  /** Build a draft outreach record from contextual parameters. */
  draftMessage(params: DraftParams): OutreachRecord;
  /** Generate an email subject line for the given parameters. */
  generateSubjectLine(params: DraftParams): string;
};

/**
 * Create an outreach message generator.
 *
 * An optional base style profile can be provided; it will be overridden by
 * any per-draft style passed in DraftParams.
 */
export function createOutreachGenerator(baseStyle?: StyleProfile): OutreachGenerator {
  const defaultStyle = baseStyle ?? DEFAULT_STYLE_PROFILE;

  return {
    draftMessage(params: DraftParams): OutreachRecord {
      const style = params.style ?? defaultStyle;
      const sections = SECTIONS[params.messageType];
      const parts: string[] = [];

      for (const section of sections) {
        const text = buildSection(section, params, style);
        if (text.length > 0) {
          parts.push(text);
        }
      }

      // Apply style adjustments
      let content = parts.join("\n\n");
      content = applyStyleAdjustments(content, style);

      return {
        id: generateId(),
        recipientId: "",
        recipientName: params.recipientName,
        channel: "email",
        messageType: params.messageType,
        content,
        status: "draft",
        notes: [],
      };
    },

    generateSubjectLine(params: DraftParams): string {
      return buildSubjectLine(params);
    },
  };
}

// ── Section builders ────────────────────────────────────────────────────────

function buildSection(section: TemplateSection, params: DraftParams, style: StyleProfile): string {
  const builder = SECTION_BUILDERS[section.name];
  if (!builder) {
    return "";
  }
  return builder(params, style);
}

type SectionBuilder = (params: DraftParams, style: StyleProfile) => string;

const SECTION_BUILDERS: Record<string, SectionBuilder> = {
  greeting(params, style) {
    return `${style.formality >= 0.7 ? "Dear" : "Hi"} ${params.recipientName},`;
  },
  shared_context(params) {
    const { recipientContext: rc, networkContext: nc } = params;
    const parts: string[] = [];
    if (nc?.mutualConnections?.length) {
      parts.push(`${nc.mutualConnections.join(" and ")} suggested I reach out to you`);
    }
    if (rc.sharedHistory?.length) {
      parts.push(`I see we both have a connection to ${rc.sharedHistory[0]}`);
    }
    if (nc?.howConnected) {
      parts.push(nc.howConnected);
    }
    if (parts.length === 0 && rc.company) {
      parts.push(`I have been following ${rc.company}'s work closely`);
    }
    return parts.length > 0
      ? parts.join(". ") + "."
      : `I came across your profile and wanted to connect.`;
  },
  request(params) {
    return params.purpose;
  },
  value_prop(params) {
    if (params.jobContext) {
      const j = params.jobContext;
      return `I bring experience relevant to the ${j.title} role and would welcome the chance to discuss how my background aligns with ${j.company}'s direction.`;
    }
    return `I believe there could be a mutually beneficial exchange of ideas.`;
  },
  easy_out(_params, style) {
    return style.formality >= 0.7
      ? `I completely understand if now is not the right time. Please don't hesitate to let me know either way.`
      : `No worries at all if the timing doesn't work — just thought I'd reach out.`;
  },
  hook(params) {
    const { recipientContext: rc, recipientName } = params;
    if (rc.title && rc.company) {
      return `I noticed your work as ${rc.title} at ${rc.company}.`;
    }
    if (rc.company) {
      return `I have been impressed by what ${rc.company} is building.`;
    }
    return `${recipientName}, your work caught my attention.`;
  },
  background(params) {
    if (params.jobContext) {
      return `I have been working in the ${params.jobContext.title} space and am currently exploring opportunities where I can make an impact.`;
    }
    return `I have a background that I think overlaps with the challenges you are tackling.`;
  },
  interest(params) {
    return params.jobContext?.whyInterested ?? params.purpose;
  },
  ask(params, style) {
    const tf = style.formality >= 0.7 ? "at your convenience" : "sometime soon";
    return `Would you be open to a brief conversation ${tf}? ${params.purpose}`;
  },
  reference(params) {
    return `I wanted to follow up on my earlier message about ${params.purpose}.`;
  },
  nudge(params) {
    if (params.jobContext) {
      return `I have since learned more about the ${params.jobContext.title} role at ${params.jobContext.company} and remain very interested.`;
    }
    return `I understand you are busy, and I wanted to gently circle back.`;
  },
  next_step(_params, style) {
    return style.formality >= 0.7
      ? "Would a brief call this week or next work for your schedule?"
      : "Happy to jump on a quick call whenever works for you.";
  },
  observation(params) {
    const { recipientContext: rc, recipientName } = params;
    return rc.company
      ? `${recipientName}, I saw that you are at ${rc.company} now — that is a great move.`
      : `${recipientName}, it has been a while and I have been thinking about our previous conversations.`;
  },
  update(params) {
    if (params.jobContext) {
      return `On my end, I have been exploring the ${params.jobContext.title} space and finding it increasingly compelling.`;
    }
    return `I have been keeping busy with some interesting work and thought of you.`;
  },
  invitation(_params, style) {
    return style.formality >= 0.7
      ? `I would love to reconnect whenever your schedule allows. No agenda — just catching up.`
      : `Would love to grab a coffee (virtual or otherwise) and catch up sometime.`;
  },
  appreciation(params) {
    return `Thank you so much for taking the time to ${params.purpose}.`;
  },
  takeaway(params) {
    if (params.jobContext) {
      return `Your insights about ${params.jobContext.company} and the ${params.jobContext.title} role were incredibly helpful.`;
    }
    return `I found our conversation genuinely valuable and came away with a lot to think about.`;
  },
  next_steps(_params, style) {
    const sign = style.signatureStyle || "Best regards";
    return `I will follow through on the items we discussed.\n\n${sign}`;
  },
};

// ── Subject line generation ─────────────────────────────────────────────────

function buildSubjectLine(params: DraftParams): string {
  const { recipientName, messageType, jobContext, networkContext } = params;
  const firstName = recipientName.split(" ")[0];

  switch (messageType) {
    case "warm_intro": {
      if (networkContext?.mutualConnections?.length) {
        const mutual = networkContext.mutualConnections[0];
        return `Introduction via ${mutual}`;
      }
      return `Quick introduction — ${firstName}`;
    }
    case "cold_outreach": {
      if (jobContext) {
        return `${jobContext.title} at ${jobContext.company} — interested in connecting`;
      }
      return `Reaching out — shared interest`;
    }
    case "follow_up":
      return `Following up — ${params.purpose.slice(0, 50)}`;
    case "reconnection":
      return `Long time, ${firstName} — catching up`;
    case "thank_you":
      return `Thank you, ${firstName}`;
  }
}

// ── Style adjustments ───────────────────────────────────────────────────────

function applyStyleAdjustments(content: string, style: StyleProfile): string {
  let result = content;

  // Trim to approximate target length if the user prefers shorter messages
  if (style.avgLength > 0 && result.length > style.avgLength * 2) {
    // Preserve paragraph structure but tighten prose
    const paragraphs = result.split("\n\n");
    const trimmed: string[] = [];
    let totalLength = 0;
    for (const p of paragraphs) {
      if (totalLength > style.avgLength * 1.5 && trimmed.length >= 2) {
        break;
      }
      trimmed.push(p);
      totalLength += p.length;
    }
    result = trimmed.join("\n\n");
  }

  return result;
}

// ── Utilities ───────────────────────────────────────────────────────────────

let counter = 0;

function generateId(): string {
  counter++;
  return `outreach_${Date.now()}_${counter}`;
}
