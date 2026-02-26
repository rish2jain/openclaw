/**
 * MCP configuration types and validation.
 *
 * Defines the schema for MCP server entries in openclaw.json:
 * - agents.defaults.mcp.servers
 * - agents.list[].mcp.servers
 */
import { z } from "zod";

// ── Types ──────────────────────────────────────────────────────

export type McpTransport = "stdio" | "sse" | "http";

export type McpServerConfig = {
  /** Enable/disable this server (default: true) */
  enabled?: boolean;
  /** Lazy startup — don't connect until first tool call (default: false) */
  lazy?: boolean;

  /** Transport type (default: "stdio") */
  transport?: McpTransport;

  // --- stdio transport ---
  /** Executable command (required for stdio) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables — supports secret:// URIs */
  env?: Record<string, string>;
  /** Working directory for the child process */
  cwd?: string;

  // --- SSE/HTTP transport ---
  /** Server URL (required for sse/http) */
  url?: string;
  /** HTTP headers — supports secret:// URIs */
  headers?: Record<string, string>;

  // --- Shared ---
  /** Connection timeout in ms (default: 30000) */
  timeout?: number;
  /** Tool call timeout in ms (default: 60000) */
  toolTimeout?: number;
  /** Auto-restart on crash — stdio only (default: true) */
  restartOnCrash?: boolean;
  /** Max restart attempts before giving up (default: 5) */
  maxRestarts?: number;
  /** Custom tool name prefix (default: server key name) */
  toolPrefix?: string;
  /** Enable resource discovery for this server (default: true) */
  resources?: boolean;
  /** Specific resource URIs to subscribe to (empty = all) */
  resourceFilter?: string[];
  /** How often to refresh resources in ms (default: 300000 / 5 min) */
  resourceRefreshMs?: number;
};

export type McpConfig = {
  /** Named MCP server configurations */
  servers?: Record<string, McpServerConfig>;
};

// ── Zod Schemas ────────────────────────────────────────────────

export const McpServerConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    lazy: z.boolean().optional(),
    transport: z.enum(["stdio", "sse", "http"]).optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    timeout: z.number().positive().optional(),
    toolTimeout: z.number().positive().optional(),
    restartOnCrash: z.boolean().optional(),
    maxRestarts: z.number().nonnegative().optional(),
    toolPrefix: z.string().optional(),
    resources: z.boolean().optional(),
    resourceFilter: z.array(z.string()).optional(),
    resourceRefreshMs: z.number().positive().optional(),
  })
  .strict();

export const McpConfigSchema = z
  .object({
    servers: z.record(z.string(), McpServerConfigSchema).optional(),
  })
  .strict();

// ── Validation ─────────────────────────────────────────────────

export type McpValidationResult =
  | { success: true; data: McpConfig }
  | { success: false; error: string };

/**
 * Validate an MCP config object. Returns parsed config or actionable error.
 * Performs transport-specific checks (stdio needs command, sse/http needs url).
 */
export function validateMcpConfig(input: unknown): McpValidationResult {
  const parseResult = McpConfigSchema.safeParse(input);
  if (!parseResult.success) {
    const formatted = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { success: false, error: formatted };
  }

  const config = parseResult.data;

  // Transport-specific validation
  for (const [name, server] of Object.entries(config.servers ?? {})) {
    // Skip disabled servers
    if (server.enabled === false) {
      continue;
    }

    const transport = server.transport ?? "stdio";
    if (transport === "stdio" && !server.command) {
      return {
        success: false,
        error: `servers.${name}: stdio transport requires 'command'`,
      };
    }
    if ((transport === "sse" || transport === "http") && !server.url) {
      return {
        success: false,
        error: `servers.${name}: ${transport} transport requires 'url'`,
      };
    }
  }

  return { success: true, data: config };
}
