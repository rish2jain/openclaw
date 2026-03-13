/**
 * Career-specific tool definitions for the career coach agent.
 *
 * These are schema declarations (name, description, inputSchema) that describe
 * the tools available to the agent. Actual tool execution is handled by the
 * runtime that wires these definitions to real career subsystem calls.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** JSON-Schema-style property descriptor. */
export type SchemaProperty = {
  type: string;
  description: string;
  enum?: string[];
};

/** A tool definition consumable by an LLM tool-use interface. */
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, SchemaProperty>;
    required?: string[];
  };
};

// ── Tool definitions ───────────────────────────────────────────────────────

const careerProfileRead: ToolDefinition = {
  name: "career_profile_read",
  description:
    "Read the user's full career profile including work history, skills, " +
    "projects, education, and preferences. Returns null fields for sections " +
    "that have not been populated yet.",
  inputSchema: {
    type: "object",
    properties: {
      sections: {
        type: "string",
        description:
          'Comma-separated list of sections to return. Options: "all", ' +
          '"profile", "work", "skills", "projects", "education", "preferences". ' +
          'Defaults to "all".',
      },
    },
  },
};

const careerProfileUpdate: ToolDefinition = {
  name: "career_profile_update",
  description:
    "Update a specific field on the user's career profile. Use this when the " +
    "user shares new information about their background, headline, or target roles.",
  inputSchema: {
    type: "object",
    properties: {
      field: {
        type: "string",
        description: "The profile field to update.",
        enum: [
          "name",
          "headline",
          "narrative",
          "targetRoles",
          "locationPreferences",
          "compensationExpectations",
        ],
      },
      value: {
        type: "string",
        description:
          "The new value for the field. For array fields (targetRoles, " +
          "locationPreferences), provide a JSON-encoded array string.",
      },
    },
    required: ["field", "value"],
  },
};

const careerPreferencesSet: ToolDefinition = {
  name: "career_preferences_set",
  description:
    "Update the user's career search preferences. Merges provided fields " +
    "with existing preferences; omitted fields are left unchanged.",
  inputSchema: {
    type: "object",
    properties: {
      roleTypes: {
        type: "string",
        description:
          'JSON array of target role types (e.g. ["senior engineer", "staff engineer"]).',
      },
      industries: {
        type: "string",
        description: 'JSON array of preferred industries (e.g. ["fintech", "healthtech"]).',
      },
      dealBreakers: {
        type: "string",
        description:
          'JSON array of non-negotiable exclusions (e.g. ["no equity", "mandatory RTO"]).',
      },
      workStyle: {
        type: "string",
        description: "Preferred work arrangement.",
        enum: ["remote", "hybrid", "onsite", "flexible"],
      },
      companyStage: {
        type: "string",
        description:
          'JSON array of acceptable company stages (e.g. ["startup", "growth", "public"]).',
      },
    },
  },
};

const jobSearch: ToolDefinition = {
  name: "job_search",
  description:
    "Search for job listings matching the given keywords and optional filters. " +
    "Returns a ranked list scored against the user's profile.",
  inputSchema: {
    type: "object",
    properties: {
      keywords: {
        type: "string",
        description: "Space-separated search keywords (e.g. 'senior typescript react').",
      },
      location: {
        type: "string",
        description: 'Location filter (e.g. "San Francisco", "Remote"). Leave empty for no filter.',
      },
      remotePolicy: {
        type: "string",
        description: "Filter by remote work policy.",
        enum: ["remote", "hybrid", "onsite"],
      },
      minScore: {
        type: "string",
        description:
          "Minimum relevance score (0-100). Only return listings at or above this threshold. Default: 0.",
      },
      limit: {
        type: "string",
        description: "Maximum number of results to return. Default: 20.",
      },
    },
    required: ["keywords"],
  },
};

const jobReview: ToolDefinition = {
  name: "job_review",
  description:
    "Get detailed information about a specific job listing including a full " +
    "score breakdown against the user's profile, requirements match analysis, " +
    "and company intelligence signals.",
  inputSchema: {
    type: "object",
    properties: {
      listingId: {
        type: "string",
        description: "The unique identifier of the job listing to review.",
      },
    },
    required: ["listingId"],
  },
};

const jobStatusUpdate: ToolDefinition = {
  name: "job_status_update",
  description:
    "Change the pipeline status of a job listing. Use this to track the " +
    "user's progress through the application process.",
  inputSchema: {
    type: "object",
    properties: {
      listingId: {
        type: "string",
        description: "The unique identifier of the job listing.",
      },
      status: {
        type: "string",
        description: "The new pipeline status.",
        enum: ["saved", "applied", "rejected", "interviewing", "offer", "dismissed"],
      },
      note: {
        type: "string",
        description: "Optional note to attach (e.g. 'Applied via referral from Alex').",
      },
    },
    required: ["listingId", "status"],
  },
};

const networkLookup: ToolDefinition = {
  name: "network_lookup",
  description:
    "Search the user's professional network for contacts matching criteria. " +
    "Can filter by company, title keywords, or tags.",
  inputSchema: {
    type: "object",
    properties: {
      company: {
        type: "string",
        description: "Filter contacts by current company name.",
      },
      titleKeywords: {
        type: "string",
        description:
          "Space-separated keywords to match against contact titles " +
          '(e.g. "engineering manager").',
      },
      tags: {
        type: "string",
        description: 'Comma-separated tags to filter by (e.g. "mentor,ex-colleague").',
      },
      limit: {
        type: "string",
        description: "Maximum number of results. Default: 10.",
      },
    },
  },
};

const networkIntroPath: ToolDefinition = {
  name: "network_intro_path",
  description:
    "Find warm introduction paths through the user's network to reach a " +
    "target company or specific person. Returns the shortest paths ranked " +
    "by connection strength. Exactly one of targetCompany or targetPersonId is required; " +
    "they are mutually exclusive.",
  inputSchema: {
    type: "object",
    properties: {
      targetCompany: {
        type: "string",
        description:
          "The company to find a path to. Required in every call; set to empty string when " +
          "using targetPersonId instead (mutually exclusive with targetPersonId).",
      },
      targetPersonId: {
        type: "string",
        description:
          "The ID of a specific person to reach. Use when targetCompany is empty; " +
          "mutually exclusive with targetCompany.",
      },
      maxHops: {
        type: "string",
        description: "Maximum number of intermediary hops. Default: 3.",
      },
    },
    required: ["targetCompany"],
  },
};

const outreachDraft: ToolDefinition = {
  name: "outreach_draft",
  description:
    "Draft a personalized networking or outreach message to a contact. " +
    "Uses the relationship context and shared history to craft an authentic message.",
  inputSchema: {
    type: "object",
    properties: {
      personId: {
        type: "string",
        description: "The ID of the person to message.",
      },
      purpose: {
        type: "string",
        description: "The goal of the outreach.",
        enum: [
          "reconnect",
          "informational_interview",
          "referral_request",
          "introduction_request",
          "congratulations",
          "general",
        ],
      },
      targetListingId: {
        type: "string",
        description: "Optional job listing ID if the outreach is related to a specific role.",
      },
      channel: {
        type: "string",
        description: "The channel the message will be sent through.",
        enum: ["linkedin", "email", "slack", "other"],
      },
    },
    required: ["personId", "purpose"],
  },
};

const pipelineSummary: ToolDefinition = {
  name: "pipeline_summary",
  description:
    "Get a summary of the user's current application pipeline: counts by " +
    "status, average relevance scores, pending follow-ups, and recent activity.",
  inputSchema: {
    type: "object",
    properties: {
      includeDetails: {
        type: "string",
        description:
          'Set to "true" to include per-listing details for active statuses ' +
          "(saved, applied, interviewing). Default: false.",
      },
    },
  },
};

// ── Public API ─────────────────────────────────────────────────────────────

/** Return all career tool definitions for registration with an LLM runtime. */
export function getCareerToolDefinitions(): ToolDefinition[] {
  return [
    careerProfileRead,
    careerProfileUpdate,
    careerPreferencesSet,
    jobSearch,
    jobReview,
    jobStatusUpdate,
    networkLookup,
    networkIntroPath,
    outreachDraft,
    pipelineSummary,
  ];
}
