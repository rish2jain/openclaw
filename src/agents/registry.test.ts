import { describe, it, expect } from "vitest";
import { createAgentRegistry, type AgentDefinition } from "./registry.js";

function makeDef(id: string, overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id,
    name: `Agent ${id}`,
    description: `Test agent ${id}`,
    buildSystemPrompt: () => "prompt",
    getTools: () => [],
    getSkillDirs: () => [],
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  it("registers and retrieves an agent", () => {
    const reg = createAgentRegistry();
    reg.register(makeDef("career"));
    expect(reg.get("career")?.name).toBe("Agent career");
  });

  it("lists all registered agents", () => {
    const reg = createAgentRegistry();
    reg.register(makeDef("a"));
    reg.register(makeDef("b"));
    expect(reg.list()).toHaveLength(2);
  });

  it("throws on duplicate registration", () => {
    const reg = createAgentRegistry();
    reg.register(makeDef("x"));
    expect(() => reg.register(makeDef("x"))).toThrow("already registered");
  });

  it("returns empty tools for unknown agent", () => {
    const reg = createAgentRegistry();
    expect(reg.getToolsForAgent("nope")).toEqual([]);
  });

  it("aggregates bridge tools from all agents", () => {
    const reg = createAgentRegistry();
    const bridgeTool = {
      definition: {
        name: "bridge_a",
        description: "",
        inputSchema: { type: "object" as const, properties: {} },
      },
      execute: async () => ({ content: [] }),
    };
    reg.register(makeDef("a", { getBridgeTools: () => [bridgeTool] }));
    reg.register(makeDef("b"));
    expect(reg.getBridgeToolsForDefault()).toHaveLength(1);
  });
});
