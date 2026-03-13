/**
 * A2A Agent Discovery: fetch and parse remote Agent Cards.
 *
 * Agent Cards are published at `/.well-known/agent.json` and describe
 * an agent's identity, capabilities, skills, and connection details.
 */

import type { AgentCard } from "../agent-card.js";

const AGENT_CARD_PATH = "/.well-known/agent.json";
const DEFAULT_TIMEOUT_MS = 10_000;

export type DiscoveryOptions = {
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Additional headers (e.g. auth tokens). */
  headers?: Record<string, string>;
};

export type DiscoveryResult =
  | { ok: true; card: AgentCard; url: string }
  | { ok: false; error: string };

/**
 * Discover a remote A2A agent by fetching its Agent Card.
 *
 * @param baseUrl - The agent's base URL (e.g. "https://agent.example.com").
 *                  The `/.well-known/agent.json` path is appended automatically.
 *                  If the URL already ends with `agent.json`, it is used as-is.
 */
export async function discoverAgent(
  baseUrl: string,
  opts?: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const cardUrl = resolveCardUrl(baseUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(cardUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...opts?.headers,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const body = await res.text();
    let card: AgentCard;
    try {
      card = JSON.parse(body) as AgentCard;
    } catch {
      return { ok: false, error: "Invalid JSON in Agent Card response" };
    }

    const validation = validateAgentCard(card);
    if (!validation.ok) {
      return { ok: false, error: `Invalid Agent Card: ${validation.reason}` };
    }

    return { ok: true, card, url: cardUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to fetch Agent Card: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Validation ───────────────────────────────────────────────────────

type ValidationResult = { ok: true } | { ok: false; reason: string };

function validateAgentCard(card: unknown): ValidationResult {
  if (!card || typeof card !== "object") {
    return { ok: false, reason: "Card must be a JSON object" };
  }
  const obj = card as Record<string, unknown>;

  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return { ok: false, reason: "name is required" };
  }
  if (typeof obj.description !== "string") {
    return { ok: false, reason: "description is required" };
  }
  if (typeof obj.version !== "string") {
    return { ok: false, reason: "version is required" };
  }
  if (!Array.isArray(obj.skills)) {
    return { ok: false, reason: "skills must be an array" };
  }
  if (!obj.capabilities || typeof obj.capabilities !== "object") {
    return { ok: false, reason: "capabilities is required" };
  }

  return { ok: true };
}

// ── Helpers ──────────────────────────────────────────────────────────

function resolveCardUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/agent.json")) {
    return normalized;
  }
  if (normalized.endsWith("/.well-known")) {
    return `${normalized}/agent.json`;
  }
  return `${normalized}${AGENT_CARD_PATH}`;
}
