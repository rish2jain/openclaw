/**
 * MCP tool handlers for the career intelligence module.
 *
 * Wraps the 10 career tool definitions with local execution handlers
 * that operate on the persisted career stores (no gateway RPC needed).
 */

import { getCareerToolDefinitions } from "../../../career/agent/tools.js";
import { findIntroPaths } from "../../../career/network/pathfinder.js";
import { getCareerContext } from "../../../career/persistence.js";
import type { McpToolHandler, McpToolCallResult, McpToolDefinition } from "../types.js";
import {
  parseStringArg,
  parseEnumArg,
  parseNumberArg,
  parseBooleanArg,
  ArgError,
  argErrorResult,
} from "./arg-utils.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function textResult(data: unknown): McpToolCallResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Parses a JSON string into an array of strings. Returns undefined for missing/empty
 * input; rejects non-arrays, non-string elements, and malformed JSON by throwing
 * ArgError so callers can treat bad input as validation failure.
 */
function tryParseJsonArray(val: string | undefined): string[] | undefined {
  if (!val || val.trim() === "") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(val);
  } catch {
    throw new ArgError("Invalid JSON for array field");
  }
  if (!Array.isArray(parsed)) {
    throw new ArgError("Value must be a JSON array");
  }
  for (let i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== "string") {
      throw new ArgError(`Array element at index ${i} must be a string`);
    }
  }
  return parsed as string[];
}

// ── Tool handlers ──────────────────────────────────────────────────────────

function handleCareerProfileRead(): McpToolHandler {
  return {
    definition: findDef("career_profile_read"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const sectionsArg = parseStringArg(args, "sections") ?? "all";
        const sections = new Set(sectionsArg.split(",").map((s) => s.trim().toLowerCase()));
        const full = ctx.profileStore.getFullProfile();

        if (sections.has("all")) {
          return textResult(full);
        }

        const result: Record<string, unknown> = {};
        if (sections.has("profile")) {
          result.profile = full.profile;
        }
        if (sections.has("work")) {
          result.workEntries = full.workEntries;
        }
        if (sections.has("skills")) {
          result.skills = full.skills;
        }
        if (sections.has("projects")) {
          result.projects = full.projects;
        }
        if (sections.has("education")) {
          result.education = full.education;
        }
        if (sections.has("preferences")) {
          result.preferences = full.preferences;
        }

        return textResult(result);
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleCareerProfileUpdate(): McpToolHandler {
  return {
    definition: findDef("career_profile_update"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const field = parseEnumArg(
          args,
          "field",
          [
            "name",
            "headline",
            "narrative",
            "targetRoles",
            "locationPreferences",
            "compensationExpectations",
          ] as const,
          true,
        )!;
        const value = parseStringArg(args, "value", true)!;

        const arrayFields = ["targetRoles", "locationPreferences"];
        const update: Record<string, unknown> = {};

        if (arrayFields.includes(field)) {
          const parsed = tryParseJsonArray(value);
          if (parsed === undefined) {
            return argErrorResult(
              new ArgError(`'value' for '${field}' must be a JSON-encoded array of strings`),
            );
          }
          update[field] = parsed;
        } else {
          update[field] = value;
        }

        if (!ctx.profileStore.getProfile()) {
          ctx.profileStore.setProfile({
            name: "",
            headline: "",
            narrative: "",
            targetRoles: [],
            locationPreferences: [],
            compensationExpectations: undefined,
            updatedAt: new Date(),
          });
        }

        ctx.profileStore.updateProfile(update);
        await ctx.save();

        return textResult({ updated: field, value: update[field] });
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleCareerPreferencesSet(): McpToolHandler {
  return {
    definition: findDef("career_preferences_set"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const partial: Record<string, unknown> = {};

        const roleTypes = tryParseJsonArray(parseStringArg(args, "roleTypes"));
        if (roleTypes) {
          partial.roleTypes = roleTypes;
        }

        const industries = tryParseJsonArray(parseStringArg(args, "industries"));
        if (industries) {
          partial.industries = industries;
        }

        const dealBreakers = tryParseJsonArray(parseStringArg(args, "dealBreakers"));
        if (dealBreakers) {
          partial.dealBreakers = dealBreakers;
        }

        const workStyle = parseEnumArg(args, "workStyle", [
          "remote",
          "hybrid",
          "onsite",
          "flexible",
        ] as const);
        if (workStyle) {
          partial.workStyle = workStyle;
        }

        const companyStage = tryParseJsonArray(parseStringArg(args, "companyStage"));
        if (companyStage) {
          partial.companyStage = companyStage;
        }

        partial.updatedAt = new Date();

        ctx.profileStore.updatePreferences(partial);
        await ctx.save();

        return textResult({
          updated: Object.keys(partial).filter((k) => k !== "updatedAt"),
          preferences: ctx.profileStore.getPreferences(),
        });
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleJobSearch(): McpToolHandler {
  return {
    definition: findDef("job_search"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const keywords = parseStringArg(args, "keywords", true)!;
        const location = parseStringArg(args, "location");
        const remotePolicy = parseEnumArg(args, "remotePolicy", [
          "remote",
          "hybrid",
          "onsite",
        ] as const);
        const minScore = parseNumberArg(args, "minScore", { min: 0, max: 100, default: 0 }) ?? 0;
        const limit = parseNumberArg(args, "limit", { min: 1, max: 100, default: 20 }) ?? 20;

        let results = ctx.jobStore.getHighMatches(minScore);

        const kws = keywords.toLowerCase().split(/\s+/);
        results = results.filter((listing) => {
          const text = `${listing.title} ${listing.company} ${listing.description}`.toLowerCase();
          return kws.some((kw) => text.includes(kw));
        });

        if (location) {
          const loc = location.toLowerCase();
          results = results.filter((listing) => listing.location.toLowerCase().includes(loc));
        }

        if (remotePolicy) {
          results = results.filter((listing) => listing.remotePolicy === remotePolicy);
        }

        return textResult({
          total: results.length,
          listings: results.slice(0, limit).map((l) => ({
            id: l.id,
            title: l.title,
            company: l.company,
            location: l.location,
            remotePolicy: l.remotePolicy,
            relevanceScore: l.relevanceScore,
            status: l.status,
            postedDate: l.postedDate,
          })),
        });
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleJobReview(): McpToolHandler {
  return {
    definition: findDef("job_review"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const listingId = parseStringArg(args, "listingId", true)!;

        const allListings = ctx.jobStore.getHighMatches(0);
        const listing = allListings.find((l) => l.id === listingId);

        if (!listing) {
          return textResult({ error: `No listing found with id '${listingId}'` });
        }

        return textResult(listing);
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleJobStatusUpdate(): McpToolHandler {
  return {
    definition: findDef("job_status_update"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const listingId = parseStringArg(args, "listingId", true)!;
        const status = parseEnumArg(
          args,
          "status",
          ["saved", "applied", "rejected", "interviewing", "offer", "dismissed"] as const,
          true,
        )!;

        ctx.jobStore.updateStatus(listingId, status);
        await ctx.save();

        return textResult({ updated: listingId, status });
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleNetworkLookup(): McpToolHandler {
  return {
    definition: findDef("network_lookup"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const company = parseStringArg(args, "company");
        const titleKeywords = parseStringArg(args, "titleKeywords");
        const tagsArg = parseStringArg(args, "tags");
        const limit = parseNumberArg(args, "limit", { min: 1, max: 100, default: 10 }) ?? 10;

        let persons = Array.from(ctx.networkGraph.persons.values());

        if (company) {
          const companyPersons = ctx.networkGraph.getPersonsByCompany(company);
          const ids = new Set(companyPersons.map((p) => p.id));
          persons = persons.filter((p) => ids.has(p.id));
        }

        if (titleKeywords) {
          const kws = titleKeywords.toLowerCase().split(/\s+/);
          persons = persons.filter(
            (p) => p.title && kws.some((kw) => p.title!.toLowerCase().includes(kw)),
          );
        }

        if (tagsArg) {
          const filterTags = tagsArg.split(",").map((t) => t.trim().toLowerCase());
          persons = persons.filter((p) =>
            filterTags.some((ft) => p.tags.some((pt: string) => pt.toLowerCase() === ft)),
          );
        }

        return textResult({
          total: persons.length,
          contacts: persons.slice(0, limit),
        });
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleNetworkIntroPath(): McpToolHandler {
  return {
    definition: findDef("network_intro_path"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const targetCompany = parseStringArg(args, "targetCompany");
        const targetPersonId = parseStringArg(args, "targetPersonId");
        const maxHopsStr = parseStringArg(args, "maxHops");

        // Validate: exactly one of targetCompany or targetPersonId
        const hasCompany = targetCompany && targetCompany.length > 0;
        const hasPerson = targetPersonId && targetPersonId.length > 0;
        if (!hasCompany && !hasPerson) {
          return argErrorResult(
            new ArgError("Exactly one of targetCompany or targetPersonId is required"),
          );
        }
        if (hasCompany && hasPerson) {
          return argErrorResult(
            new ArgError("targetCompany and targetPersonId are mutually exclusive"),
          );
        }

        const target = hasCompany ? targetCompany : targetPersonId!;
        let maxHops: number;
        if (maxHopsStr === undefined || maxHopsStr.trim() === "") {
          maxHops = 3;
        } else {
          const parsed = Number.parseInt(maxHopsStr, 10);
          if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
            return argErrorResult(
              new ArgError("Invalid maxHops; must be an integer between 1 and 6"),
            );
          }
          maxHops = parsed;
        }

        const persons = Array.from(ctx.networkGraph.persons.values());
        const self = persons.find((p) => p.tags.includes("self"));
        if (!self) {
          return textResult({
            error: "No 'self' node found in the network graph. Add yourself first.",
            paths: [],
          });
        }

        const paths = findIntroPaths(ctx.networkGraph, self.id, target, maxHops);

        return textResult({ paths });
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        if (e instanceof Error) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handleOutreachDraft(): McpToolHandler {
  return {
    definition: findDef("outreach_draft"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const personId = parseStringArg(args, "personId", true)!;
        const purpose = parseEnumArg(
          args,
          "purpose",
          [
            "reconnect",
            "informational_interview",
            "referral_request",
            "introduction_request",
            "congratulations",
            "general",
          ] as const,
          true,
        )!;
        const targetListingId = parseStringArg(args, "targetListingId");
        const channel = parseEnumArg(args, "channel", [
          "linkedin",
          "email",
          "slack",
          "other",
        ] as const);

        const person = ctx.networkGraph.persons.get(personId);
        if (!person) {
          return textResult({ error: `No contact found with id '${personId}'` });
        }

        const profile = ctx.profileStore.getFullProfile();
        // Look up "self" node from the network graph to find the sender's person id
        const selfNode = Array.from(ctx.networkGraph.persons.values()).find((p) =>
          p.tags.includes("self"),
        );
        const senderId = selfNode?.id;
        if (senderId === undefined) {
          return textResult({
            error:
              "No 'self' node found in the network graph. Add yourself first before drafting outreach.",
          });
        }
        const edges = ctx.networkGraph.edges.filter(
          (e) =>
            (e.fromId === personId && e.toId === senderId) ||
            (e.toId === personId && e.fromId === senderId),
        );

        const context: Record<string, unknown> = {
          recipient: person,
          purpose,
          channel: channel ?? "email",
          senderProfile: {
            name: profile.profile?.name,
            headline: profile.profile?.headline,
            narrative: profile.profile?.narrative,
          },
          sharedHistory: edges.flatMap((e) => e.sharedHistory),
          connectionStrength:
            edges.length > 0 ? Math.max(...edges.map((e) => e.connectionStrength)) : 0,
        };

        if (targetListingId) {
          const allListings = ctx.jobStore.getHighMatches(0);
          const listing = allListings.find((l) => l.id === targetListingId);
          if (listing) {
            context.targetJob = {
              title: listing.title,
              company: listing.company,
              description: listing.description,
            };
          }
        }

        return textResult({
          draftContext: context,
          instructions:
            "Use the context above to draft a personalized outreach message. " +
            "Match the tone to the purpose and channel. Reference shared history " +
            "and the sender's background to make the message authentic.",
        });
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

function handlePipelineSummary(): McpToolHandler {
  return {
    definition: findDef("pipeline_summary"),
    async execute(args) {
      try {
        const ctx = await getCareerContext();
        const includeDetails = parseBooleanArg(args, "includeDetails") ?? false;

        const jobSummary = ctx.jobStore.getPipelineSummary();
        const outreachSummary = ctx.outreachPipeline.getSummary();

        const result: Record<string, unknown> = {
          jobs: jobSummary,
          outreach: outreachSummary,
          mode: ctx.modeManager.getMode(),
        };

        if (includeDetails) {
          result.activeListings = {
            saved: ctx.jobStore.getByStatus("saved"),
            applied: ctx.jobStore.getByStatus("applied"),
            interviewing: ctx.jobStore.getByStatus("interviewing"),
          };
          result.pendingFollowUps = ctx.outreachPipeline.getPendingFollowUps();
        }

        return textResult(result);
      } catch (e) {
        if (e instanceof ArgError) {
          return argErrorResult(e);
        }
        throw e;
      }
    },
  };
}

// ── Definition lookup ──────────────────────────────────────────────────────

let _defs: Map<string, McpToolDefinition> | undefined;

function getDefsMap(): Map<string, McpToolDefinition> {
  if (!_defs) {
    _defs = new Map();
    for (const def of getCareerToolDefinitions()) {
      _defs.set(def.name, def as unknown as McpToolDefinition);
    }
  }
  return _defs;
}

function findDef(name: string): McpToolDefinition {
  const def = getDefsMap().get(name);
  if (!def) {
    throw new Error(`Career tool definition not found: ${name}`);
  }
  return def;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Create all career MCP tool handlers. */
export function createCareerTools(): McpToolHandler[] {
  return [
    handleCareerProfileRead(),
    handleCareerProfileUpdate(),
    handleCareerPreferencesSet(),
    handleJobSearch(),
    handleJobReview(),
    handleJobStatusUpdate(),
    handleNetworkLookup(),
    handleNetworkIntroPath(),
    handleOutreachDraft(),
    handlePipelineSummary(),
  ];
}
