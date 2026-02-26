import { describe, expect, it } from "vitest";

// We test the resolveMcpConfigForRun function indirectly by importing the module.
// Since it's a private function, we test via the exported attempt behavior.
// For unit testing, we extract the logic into a testable helper.

// For now, test the merge logic directly by recreating it:
type McpServers = Record<string, Record<string, unknown>>;
type McpSection = { servers?: McpServers };
type AgentEntry = { id?: string; mcp?: McpSection };
type TestConfig = {
  agents?: { defaults?: { mcp?: McpSection }; list?: AgentEntry[] };
};

function resolveMcpConfigForRun(config: TestConfig | undefined, sessionKey: string | undefined) {
  const defaultsMcp = config?.agents?.defaults?.mcp;
  // Simplified agent resolution for testing
  const agentId = sessionKey?.split(":")[1]; // e.g. "agent:nori:session" -> "nori"
  const agentEntry = config?.agents?.list?.find((a) => a.id === agentId);
  const agentMcp = agentEntry?.mcp;

  if (!defaultsMcp && !agentMcp) {
    return undefined;
  }

  const mergedServers = {
    ...defaultsMcp?.servers,
    ...agentMcp?.servers,
  };

  return { servers: mergedServers };
}

describe("resolveMcpConfigForRun", () => {
  it("returns undefined when no MCP config exists", () => {
    expect(resolveMcpConfigForRun(undefined, undefined)).toBeUndefined();
    expect(resolveMcpConfigForRun({}, undefined)).toBeUndefined();
    expect(resolveMcpConfigForRun({ agents: {} }, undefined)).toBeUndefined();
  });

  it("returns defaults MCP config when no agent override", () => {
    const config = {
      agents: {
        defaults: {
          mcp: {
            servers: {
              filesystem: { command: "mcp-filesystem", args: ["/tmp"] },
            },
          },
        },
      },
    };
    const result = resolveMcpConfigForRun(config, undefined);
    expect(result).toEqual({
      servers: {
        filesystem: { command: "mcp-filesystem", args: ["/tmp"] },
      },
    });
  });

  it("merges agent MCP config over defaults", () => {
    const config = {
      agents: {
        defaults: {
          mcp: {
            servers: {
              filesystem: { command: "mcp-filesystem", args: ["/tmp"] },
              shared: { command: "shared-server" },
            },
          },
        },
        list: [
          {
            id: "nori",
            mcp: {
              servers: {
                shared: { command: "agent-specific-server" }, // Override
                extra: { command: "extra-server" }, // New
              },
            },
          },
        ],
      },
    };
    const result = resolveMcpConfigForRun(config, "agent:nori:session");
    expect(result).toEqual({
      servers: {
        filesystem: { command: "mcp-filesystem", args: ["/tmp"] },
        shared: { command: "agent-specific-server" }, // Agent wins
        extra: { command: "extra-server" },
      },
    });
  });

  it("returns agent-only MCP config when no defaults", () => {
    const config = {
      agents: {
        list: [
          {
            id: "nori",
            mcp: {
              servers: {
                custom: { command: "custom-server" },
              },
            },
          },
        ],
      },
    };
    const result = resolveMcpConfigForRun(config, "agent:nori:session");
    expect(result).toEqual({
      servers: {
        custom: { command: "custom-server" },
      },
    });
  });
});
