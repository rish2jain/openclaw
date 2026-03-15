import type { ChatType } from "../channels/chat-type.js";
import type { AgentDefaultsConfig } from "./types.agent-defaults.js";
import type { AgentModelConfig, AgentSandboxConfig } from "./types.agents-shared.js";
import type { HumanDelayConfig, IdentityConfig } from "./types.base.js";
import type { GroupChatConfig } from "./types.messages.js";
import type { AgentToolsConfig, MemorySearchConfig } from "./types.tools.js";

/** Per-agent default thinking level (overrides agents.defaults.thinkingDefault). */
export type AgentThinkingDefault = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type AgentConfig = {
  id: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentModelConfig;
  /** Optional allowlist of skills for this agent (omit = all skills; empty = none). */
  skills?: string[];
  memorySearch?: MemorySearchConfig;
  /** Human-like delay between block replies for this agent. */
  humanDelay?: HumanDelayConfig;
  /** Optional per-agent heartbeat overrides. */
  heartbeat?: AgentDefaultsConfig["heartbeat"];
  identity?: IdentityConfig;
  groupChat?: GroupChatConfig;
  /** Per-agent default thinking level (overrides agents.defaults.thinkingDefault). */
  thinkingDefault?: AgentThinkingDefault;
  subagents?: {
    /** Allow spawning sub-agents under other agent ids. Use "*" to allow any. */
    allowAgents?: string[];
    /** Per-agent default model for spawned sub-agents (string or {primary,fallbacks}). */
    model?: AgentModelConfig;
  };
  /** Optional per-agent sandbox overrides. */
  sandbox?: AgentSandboxConfig;
  /** Optional per-agent stream params (e.g. cacheRetention, temperature). */
  params?: Record<string, unknown>;
  tools?: AgentToolsConfig;
  /** Runtime type and options (e.g. ACP for persistent bindings). */
  runtime?: {
    type?: "acp";
    acp?: {
      agent?: string;
      mode?: string;
      cwd?: string;
      backend?: string;
    };
  };
};

/** LLM engine to use for agent runs. */
export type LlmEngineType = "aisdk" | "pi-agent";

export type AgentsConfig = {
  defaults?: AgentDefaultsConfig;
  list?: AgentConfig[];
  /** LLM engine to use for agent runs (default: "aisdk"). */
  engine?: LlmEngineType;
};

type AgentBindingMatch = {
  channel: string;
  accountId?: string;
  peer?: { kind: ChatType; id: string };
  guildId?: string;
  teamId?: string;
  /** Discord role IDs used for role-based routing. */
  roles?: string[];
};

export type AgentRouteBinding = {
  type: "route";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
};

export type AgentAcpBinding = {
  type: "acp";
  agentId: string;
  comment?: string;
  match: AgentBindingMatch;
  /** Per-binding ACP overrides (mode, cwd, backend, label). */
  acp?: {
    mode?: string;
    cwd?: string;
    backend?: string;
    label?: string;
  };
};

export type AgentBinding = AgentRouteBinding | AgentAcpBinding;
