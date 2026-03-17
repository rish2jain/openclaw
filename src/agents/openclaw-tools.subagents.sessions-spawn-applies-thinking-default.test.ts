import { beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/fast-core-tools.js";
import * as harness from "./openclaw-tools.subagents.sessions-spawn.test-harness.js";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

const MAIN_SESSION_KEY = "agent:test:main";

type ThinkingLevel = "high" | "medium" | "low";

function applyThinkingDefault(thinking: ThinkingLevel) {
  harness.setSessionsSpawnConfigOverride({
    session: { mainKey: "main", scope: "per-sender" },
    agents: { defaults: { subagents: { thinking } } },
  });
}

function findSubagentThinking(
  calls: Array<{ method?: string; params?: unknown }>,
): string | undefined {
  for (const call of calls) {
    if (call.method !== "agent") {
      continue;
    }
    const params = call.params as { lane?: string; thinking?: string } | undefined;
    if (params?.lane === "subagent") {
      return params.thinking;
    }
  }
  return undefined;
}

function findPatchedThinking(
  calls: Array<{ method?: string; params?: unknown }>,
): string | undefined {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    const entry = calls[index];
    if (!entry || entry.method !== "sessions.patch") {
      continue;
    }
    const params = entry.params as { thinkingLevel?: string } | undefined;
    if (params?.thinkingLevel) {
      return params.thinkingLevel;
    }
  }
  return undefined;
}

async function expectThinkingPropagation(input: {
  callId: string;
  payload: Record<string, unknown>;
  expected: ThinkingLevel;
}) {
  const gateway = harness.setupSessionsSpawnGatewayMock({});
  const tool = await harness.getSessionsSpawnTool({ agentSessionKey: MAIN_SESSION_KEY });
  const result = await tool.execute(input.callId, input.payload);
  expect(result.details).toMatchObject({ status: "accepted" });

  expect(findSubagentThinking(gateway.calls)).toBe(input.expected);
  expect(findPatchedThinking(gateway.calls)).toBe(input.expected);
}

describe("sessions_spawn thinking defaults", () => {
  beforeEach(() => {
    harness.resetSessionsSpawnConfigOverride();
    resetSubagentRegistryForTests();
    harness.getCallGatewayMock().mockClear();
    applyThinkingDefault("high");
  });

  it("applies agents.defaults.subagents.thinking when thinking is omitted", async () => {
    await expectThinkingPropagation({
      callId: "call-1",
      payload: { task: "hello" },
      expected: "high",
    });
  });

  it("prefers explicit sessions_spawn.thinking over config default", async () => {
    await expectThinkingPropagation({
      callId: "call-2",
      payload: { task: "hello", thinking: "low" },
      expected: "low",
    });
  });

  it("passes tools filter to agent call when provided", async () => {
    const gateway = harness.setupSessionsSpawnGatewayMock({});
    const tool = await harness.getSessionsSpawnTool({ agentSessionKey: "agent:test:main" });
    const result = await tool.execute("call-tools-none", {
      task: "summarize",
      tools: "none",
    });
    expect(result.details).toMatchObject({ status: "accepted" });

    const agentCall = gateway.calls.find((call: { method?: string }) => call.method === "agent");
    expect((agentCall?.params as Record<string, unknown>)?.tools).toBe("none");
  });

  it("passes tools inherit to agent call when provided", async () => {
    const gateway = harness.setupSessionsSpawnGatewayMock({});
    const tool = await harness.getSessionsSpawnTool({ agentSessionKey: "agent:test:main" });
    const result = await tool.execute("call-tools-inherit", {
      task: "delegate",
      tools: "inherit",
    });
    expect(result.details).toMatchObject({ status: "accepted" });

    const agentCall = gateway.calls.find((call: { method?: string }) => call.method === "agent");
    expect((agentCall?.params as Record<string, unknown>)?.tools).toBe("inherit");
  });

  it("passes tools allowlist to agent call when provided", async () => {
    const gateway = harness.setupSessionsSpawnGatewayMock({});
    const tool = await harness.getSessionsSpawnTool({ agentSessionKey: "agent:test:main" });
    const result = await tool.execute("call-tools-list", {
      task: "edit file",
      tools: ["read_file", "write"],
    });
    expect(result.details).toMatchObject({ status: "accepted" });

    const agentCall = gateway.calls.find((call: { method?: string }) => call.method === "agent");
    expect((agentCall?.params as Record<string, unknown>)?.tools).toEqual(["read_file", "write"]);
  });
});
