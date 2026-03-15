import { describe, expect, it } from "vitest";
import { getCareerToolDefinitions } from "./tools.js";
import type { ToolDefinition } from "./tools.js";

describe("Career tool definitions", () => {
  const tools = getCareerToolDefinitions();

  it("returns a non-empty array", () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it("includes all expected tool names", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("career_profile_read");
    expect(names).toContain("career_profile_update");
    expect(names).toContain("career_preferences_set");
    expect(names).toContain("job_search");
    expect(names).toContain("job_review");
    expect(names).toContain("job_status_update");
    expect(names).toContain("network_lookup");
    expect(names).toContain("network_intro_path");
    expect(names).toContain("outreach_draft");
    expect(names).toContain("pipeline_summary");
  });

  it("returns exactly 10 tools", () => {
    expect(tools).toHaveLength(10);
  });

  it("every tool has a valid inputSchema with type object", () => {
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.inputSchema.properties).toBe("object");
    }
  });

  it("every tool has a non-empty name and description", () => {
    for (const tool of tools) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it("required fields reference existing properties", () => {
    for (const tool of tools) {
      if (tool.inputSchema.required) {
        for (const req of tool.inputSchema.required) {
          expect(tool.inputSchema.properties).toHaveProperty(req);
        }
      }
    }
  });

  it("each property has type and description", () => {
    for (const tool of tools) {
      for (const [key, prop] of Object.entries(tool.inputSchema.properties)) {
        expect(prop.type, `${tool.name}.${key} missing type`).toBeDefined();
        expect(prop.description, `${tool.name}.${key} missing description`).toBeDefined();
      }
    }
  });

  describe("specific tool schemas", () => {
    function findTool(name: string): ToolDefinition {
      const found = tools.find((t) => t.name === name);
      if (!found) {
        throw new Error(`Tool ${name} not found`);
      }
      return found;
    }

    it("job_status_update has listingId and status as required", () => {
      const tool = findTool("job_status_update");
      expect(tool.inputSchema.required).toContain("listingId");
      expect(tool.inputSchema.required).toContain("status");
    });

    it("job_status_update status has valid enum values", () => {
      const tool = findTool("job_status_update");
      const statusProp = tool.inputSchema.properties.status;
      expect(statusProp.enum).toEqual([
        "saved",
        "applied",
        "rejected",
        "interviewing",
        "offer",
        "dismissed",
      ]);
    });

    it("outreach_draft requires personId and purpose", () => {
      const tool = findTool("outreach_draft");
      expect(tool.inputSchema.required).toContain("personId");
      expect(tool.inputSchema.required).toContain("purpose");
    });

    it("career_profile_update field has valid enum", () => {
      const tool = findTool("career_profile_update");
      const fieldProp = tool.inputSchema.properties.field;
      expect(fieldProp.enum).toContain("name");
      expect(fieldProp.enum).toContain("headline");
      expect(fieldProp.enum).toContain("targetRoles");
    });

    it("job_search requires keywords", () => {
      const tool = findTool("job_search");
      expect(tool.inputSchema.required).toContain("keywords");
    });

    it("job_review requires listingId", () => {
      const tool = findTool("job_review");
      expect(tool.inputSchema.required).toContain("listingId");
    });

    it("career_profile_update requires field and value", () => {
      const tool = findTool("career_profile_update");
      expect(tool.inputSchema.required).toContain("field");
      expect(tool.inputSchema.required).toContain("value");
    });

    it("network_lookup has no required fields", () => {
      const tool = findTool("network_lookup");
      expect(tool.inputSchema.required).toBeUndefined();
    });

    it("outreach_draft has channel with enum values", () => {
      const tool = findTool("outreach_draft");
      const channelProp = tool.inputSchema.properties.channel;
      expect(channelProp.enum).toEqual(["linkedin", "email", "slack", "other"]);
    });
  });
});
