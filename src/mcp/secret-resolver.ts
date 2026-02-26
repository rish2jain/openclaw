/**
 * Secret resolver — resolves secret:// URIs in MCP server config.
 *
 * Supported schemes:
 * - secret://env/VAR_NAME      — read from process.env
 * - secret://file/PATH          — read file contents (trimmed)
 * - secret://file/PATH#FIELD    — parse .env format, extract field
 * - secret://gcp/NAME[#VERSION] — GCP Secret Manager (not yet implemented)
 *
 * Plain text values pass through unchanged.
 * Secret values are NEVER logged.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ── Types ──────────────────────────────────────────────────────

const SUPPORTED_PROVIDERS = ["env", "file", "gcp"] as const;
type SecretProvider = (typeof SUPPORTED_PROVIDERS)[number];

export type SecretUri = {
  provider: SecretProvider;
  path: string;
  field?: string;
};

// ── URI Parsing ────────────────────────────────────────────────

const SECRET_PREFIX = "secret://";

/**
 * Parse a secret:// URI. Returns null if the value is not a secret URI.
 * Throws on unsupported provider.
 */
export function parseSecretUri(value: string): SecretUri | null {
  if (!value.startsWith(SECRET_PREFIX)) {
    return null;
  }

  const rest = value.slice(SECRET_PREFIX.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`Invalid secret URI: ${value} (missing path)`);
  }

  const provider = rest.slice(0, slashIndex);
  if (!SUPPORTED_PROVIDERS.includes(provider as SecretProvider)) {
    throw new Error(`Unsupported secret provider '${provider}' in URI: ${value}`);
  }

  let pathPart = rest.slice(slashIndex + 1);
  let field: string | undefined;

  const hashIndex = pathPart.lastIndexOf("#");
  if (hashIndex !== -1) {
    field = pathPart.slice(hashIndex + 1);
    pathPart = pathPart.slice(0, hashIndex);
  }

  return {
    provider: provider as SecretProvider,
    path: pathPart,
    ...(field !== undefined && { field }),
  };
}

// ── Resolution ─────────────────────────────────────────────────

/**
 * Expand ~ to home directory in file paths.
 */
function expandHome(filePath: string): string {
  if (filePath.startsWith("~/") || filePath === "~") {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/**
 * Parse a simple .env file format. Handles:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='quoted value'
 * - Comments (#) and blank lines
 */
function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    let val = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

async function resolveEnv(uri: SecretUri): Promise<string> {
  const value = process.env[uri.path];
  if (value === undefined) {
    throw new Error(`Environment variable '${uri.path}' not set (from secret://env/${uri.path})`);
  }
  return value;
}

async function resolveFile(uri: SecretUri): Promise<string> {
  const filePath = expandHome(uri.path);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`File not found: ${filePath}`, { cause: err });
    }
    throw err;
  }

  if (uri.field) {
    const parsed = parseDotEnv(content);
    const value = parsed[uri.field];
    if (value === undefined) {
      throw new Error(`Field '${uri.field}' not found in ${filePath}`);
    }
    return value;
  }

  return content.trimEnd();
}

async function resolveGcp(_uri: SecretUri): Promise<string> {
  throw new Error(
    "GCP Secret Manager is not yet implemented. Use secret://env/ or secret://file/ instead.",
  );
}

const RESOLVERS: Record<SecretProvider, (uri: SecretUri) => Promise<string>> = {
  env: resolveEnv,
  file: resolveFile,
  gcp: resolveGcp,
};

/**
 * Resolve a single value. If it's a secret:// URI, resolve it.
 * Plain text values pass through unchanged.
 */
export async function resolveSecret(value: string): Promise<string> {
  const uri = parseSecretUri(value);
  if (!uri) {
    return value;
  }
  return RESOLVERS[uri.provider](uri);
}

/**
 * Resolve all secret:// URIs in a string record (env vars, headers).
 * Returns a new record with resolved values.
 */
export async function resolveSecrets(
  record: Record<string, string> | undefined,
): Promise<Record<string, string>> {
  if (!record) {
    return {};
  }
  const entries = Object.entries(record);
  if (entries.length === 0) {
    return {};
  }

  const resolved = await Promise.all(
    entries.map(async ([key, value]) => {
      const resolvedValue = await resolveSecret(value);
      return [key, resolvedValue] as const;
    }),
  );

  return Object.fromEntries(resolved);
}
