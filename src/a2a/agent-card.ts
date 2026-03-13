/**
 * A2A Agent Card: a JSON metadata document published by the server
 * describing identity, capabilities, skills, endpoint, and auth requirements.
 *
 * @see https://a2a-protocol.org/latest/specification/
 */

import { VERSION } from "../version.js";
import { A2A_PROTOCOL_VERSION } from "./protocol.js";

// ── Agent Card Types ─────────────────────────────────────────────────

export type AgentProvider = {
  name: string;
  url?: string;
  contact?: string;
};

export type AgentSkill = {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
};

export type AgentCapabilities = {
  streaming?: boolean;
  pushNotifications?: boolean;
  extendedAgentCard?: boolean;
};

export type SecurityScheme =
  | { type: "apiKey"; in: "header" | "query"; parameterName: string; description?: string }
  | { type: "http"; scheme: string; bearerFormat?: string; description?: string }
  | { type: "oauth2"; flows: Record<string, unknown>; description?: string }
  | { type: "openIdConnect"; openIdConnectUrl: string; description?: string };

export type AgentInterface = {
  url: string;
  protocolBinding: "JSONRPC";
  protocolVersion: string;
};

export type AgentCard = {
  name: string;
  description: string;
  version: string;
  provider?: AgentProvider;
  capabilities: AgentCapabilities;
  skills: AgentSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  interfaces: AgentInterface[];
  securitySchemes?: Record<string, SecurityScheme>;
  security?: Array<Record<string, string[]>>;
  documentationUrl?: string;
  iconUrl?: string;
};

// ── Agent Card Configuration (from user config) ─────────────────────

export type A2AAgentCardConfig = {
  /** Human-readable agent name. */
  name?: string;
  /** Description of the agent's purpose and capabilities. */
  description?: string;
  /** Additional skills to advertise beyond defaults. */
  skills?: AgentSkill[];
  /** Agent provider organization info. */
  provider?: AgentProvider;
  /** Override supported input MIME types. */
  inputModes?: string[];
  /** Override supported output MIME types. */
  outputModes?: string[];
  /** URL to documentation. */
  documentationUrl?: string;
  /** URL to an icon/logo. */
  iconUrl?: string;
};

// ── Default Skills ───────────────────────────────────────────────────

const DEFAULT_SKILLS: AgentSkill[] = [
  {
    id: "general-assistant",
    name: "General Assistant",
    description:
      "General-purpose AI assistant capable of answering questions, writing, analysis, coding, and creative tasks.",
    tags: ["general", "assistant", "coding", "writing", "analysis"],
    examples: ["Help me write a Python script", "Explain quantum computing", "Review this code"],
  },
];

// ── Agent Card Builder ───────────────────────────────────────────────

export type BuildAgentCardParams = {
  /** Base URL of the A2A server (used for the interface endpoint). */
  baseUrl: string;
  /** Optional user-provided config overrides. */
  config?: A2AAgentCardConfig;
  /** Whether streaming is supported. */
  streaming?: boolean;
  /** Auth scheme to advertise. */
  authScheme?: SecurityScheme;
};

export function buildAgentCard(params: BuildAgentCardParams): AgentCard {
  const { baseUrl, config, streaming = true, authScheme } = params;

  // Normalize base URL: strip trailing slash
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  const skills = config?.skills?.length ? config.skills : DEFAULT_SKILLS;

  const securitySchemes: Record<string, SecurityScheme> | undefined = authScheme
    ? { default: authScheme }
    : undefined;

  const security: Array<Record<string, string[]>> | undefined = authScheme
    ? [{ default: [] }]
    : undefined;

  return {
    name: config?.name ?? "OpenClaw Agent",
    description:
      config?.description ??
      "An OpenClaw-powered AI agent accessible via the Agent2Agent (A2A) protocol.",
    version: VERSION,
    provider: config?.provider ?? {
      name: "OpenClaw",
      url: "https://openclaw.ai",
    },
    capabilities: {
      streaming,
      pushNotifications: false,
      extendedAgentCard: false,
    },
    skills,
    defaultInputModes: config?.inputModes ?? ["text/plain"],
    defaultOutputModes: config?.outputModes ?? ["text/plain"],
    interfaces: [
      {
        url: `${normalizedBase}/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    securitySchemes,
    security,
    documentationUrl: config?.documentationUrl ?? "https://docs.openclaw.ai",
    iconUrl: config?.iconUrl,
  };
}
