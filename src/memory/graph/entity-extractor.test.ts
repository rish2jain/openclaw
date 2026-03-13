import { describe, expect, it } from "vitest";
import {
  extractEntitiesWithLlm,
  extractEntitiesWithRegex,
  type LlmExtractFn,
} from "./entity-extractor.js";

describe("entity-extractor", () => {
  describe("extractEntitiesWithLlm", () => {
    it("parses valid LLM JSON and returns entities and relationships with correct types", async () => {
      const validPayload = {
        entities: [
          { name: "Alice", type: "person", properties: {} },
          { name: "Project Alpha", type: "project", properties: {} },
        ],
        relationships: [
          { sourceName: "Alice", targetName: "Project Alpha", label: "works_on", weight: 0.9 },
        ],
      };
      const llmFn: LlmExtractFn = async () => JSON.stringify(validPayload);
      const result = await extractEntitiesWithLlm("Alice works on Project Alpha", llmFn);

      expect(result.entities).toHaveLength(2);
      const alice = result.entities.find((e) => e.name === "Alice");
      const project = result.entities.find((e) => e.name === "Project Alpha");
      expect(alice).toBeDefined();
      expect(alice!.type).toBe("person");
      expect(project).toBeDefined();
      expect(project!.type).toBe("project");

      expect(result.relationships).toHaveLength(1);
      expect(result.relationships[0]).toMatchObject({
        sourceName: "Alice",
        targetName: "Project Alpha",
        label: "works_on",
        weight: 0.9,
      });
    });

    it("falls back to extractEntitiesWithRegex when LLM throws", async () => {
      const llmFn: LlmExtractFn = async () => {
        throw new Error("LLM unavailable");
      };
      const text = "Talked to @alice and @bob about the plan";
      const result = await extractEntitiesWithLlm(text, llmFn);
      const regexResult = extractEntitiesWithRegex(text);

      expect(result.entities.map((e) => e.name).toSorted()).toEqual(
        regexResult.entities.map((e) => e.name).toSorted(),
      );
      expect(result.entities.every((e) => e.type === "person")).toBe(true);
      expect(result.relationships).toHaveLength(0);
    });

    it("returns empty entities/relationships for malformed LLM response without throwing", async () => {
      const llmFn: LlmExtractFn = async () => "not valid json at all";
      const result = await extractEntitiesWithLlm("Some text", llmFn);

      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it("returns empty for unparseable JSON object missing entities array", async () => {
      const llmFn: LlmExtractFn = async () => '{"relationships":[]}';
      const result = await extractEntitiesWithLlm("Some text", llmFn);

      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it("handles empty input without calling LLM", async () => {
      let llmCalled = false;
      const llmFn: LlmExtractFn = async () => {
        llmCalled = true;
        return "{}";
      };
      const result = await extractEntitiesWithLlm("   ", llmFn);

      expect(llmCalled).toBe(false);
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it("extracts and validates entity types like topic and channel from LLM payload", async () => {
      const payload = {
        entities: [
          { name: "Memory System", type: "topic", properties: {} },
          { name: "general", type: "channel", properties: {} },
        ],
        relationships: [],
      };
      const llmFn: LlmExtractFn = async () => JSON.stringify(payload);
      const result = await extractEntitiesWithLlm("Discuss Memory System in #general", llmFn);

      expect(result.entities).toHaveLength(2);
      const topicEntity = result.entities.find((e) => e.name === "Memory System");
      const channelEntity = result.entities.find((e) => e.name === "general");
      expect(topicEntity?.type).toBe("topic");
      expect(channelEntity?.type).toBe("channel");
    });

    it("parses JSON wrapped in markdown code block", async () => {
      const llmFn: LlmExtractFn = async () =>
        "```json\n" +
        JSON.stringify({ entities: [{ name: "Bob", type: "person" }], relationships: [] }) +
        "\n```";
      const result = await extractEntitiesWithLlm("Text", llmFn);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("Bob");
      expect(result.entities[0].type).toBe("person");
    });

    it("filters out entities with invalid type from LLM payload", async () => {
      const payload = {
        entities: [
          { name: "Valid", type: "person", properties: {} },
          { name: "InvalidType", type: "invalid_type", properties: {} },
        ],
        relationships: [],
      };
      const llmFn: LlmExtractFn = async () => JSON.stringify(payload);
      const result = await extractEntitiesWithLlm("Text", llmFn);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("Valid");
      expect(result.entities[0].type).toBe("person");
    });
  });

  describe("extractEntitiesWithRegex", () => {
    it("extracts @mentions as person entities", () => {
      const result = extractEntitiesWithRegex("Talked to @alice and @bob about the plan");
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("alice");
      expect(names).toContain("bob");
      expect(result.entities.every((e) => e.type === "person")).toBe(true);
    });

    it("extracts #channels as channel entities", () => {
      const result = extractEntitiesWithRegex("Check #general and #dev-ops channels");
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("general");
      expect(names).toContain("dev-ops");
      expect(result.entities.every((e) => e.type === "channel")).toBe(true);
    });

    it("extracts quoted capitalized names as topics", () => {
      const result = extractEntitiesWithRegex('Working on "Memory System" for the release');
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("Memory System");
      const topicEntity = result.entities.find((e) => e.name === "Memory System");
      expect(topicEntity).toBeDefined();
      expect(topicEntity!.type).toBe("topic");
    });

    it("does not treat @. or @... as mention names", () => {
      const result = extractEntitiesWithRegex("Hi @. and @... bye");
      const names = result.entities.map((e) => e.name);
      expect(names).not.toContain(".");
      expect(names).not.toContain("...");
    });

    it("allows dots and hyphens in the middle of mentions", () => {
      const result = extractEntitiesWithRegex("Ping @john.doe and @mary-jane");
      const names = result.entities.map((e) => e.name);
      expect(names).toContain("john.doe");
      expect(names).toContain("mary-jane");
    });

    it("deduplicates entities", () => {
      const result = extractEntitiesWithRegex("@alice said @alice should review");
      const aliceEntities = result.entities.filter((e) => e.name === "alice");
      expect(aliceEntities).toHaveLength(1);
    });

    it("returns empty for plain text without patterns", () => {
      const result = extractEntitiesWithRegex("Just a regular sentence with no entities");
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    });

    it("handles empty input", () => {
      const result = extractEntitiesWithRegex("");
      expect(result.entities).toHaveLength(0);
    });
  });
});
