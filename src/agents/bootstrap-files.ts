import type { OpenClawConfig } from "../config/config.js";
import { getOrLoadBootstrapFiles } from "./bootstrap-cache.js";
import { applyBootstrapHookOverrides } from "./bootstrap-hooks.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import {
  buildBootstrapContextFiles,
  resolveBootstrapMaxChars,
  resolveBootstrapTotalMaxChars,
} from "./pi-embedded-helpers.js";
import {
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
  type WorkspaceBootstrapFile,
} from "./workspace.js";

export type BootstrapContextMode = "full" | "lightweight";
export type BootstrapContextRunKind = "default" | "heartbeat" | "cron";

export function makeBootstrapWarn(params: {
  sessionLabel: string;
  warn?: (message: string) => void;
}): ((message: string) => void) | undefined {
  if (!params.warn) {
    return undefined;
  }
  return (message: string) => params.warn?.(`${message} (sessionKey=${params.sessionLabel})`);
}

function sanitizeBootstrapFiles(
  files: WorkspaceBootstrapFile[],
  warn?: (message: string) => void,
): WorkspaceBootstrapFile[] {
  const sanitized: WorkspaceBootstrapFile[] = [];
  for (const file of files) {
    const pathValue = typeof file.path === "string" ? file.path.trim() : "";
    if (!pathValue) {
      warn?.(
        `skipping bootstrap file "${file.name}" — missing or invalid "path" field (hook may have used "filePath" instead)`,
      );
      continue;
    }
    sanitized.push({ ...file, path: pathValue });
  }
  return sanitized;
}

/** Bootstrap file names included in "minimal" inject mode (identity + user only). */
const MINIMAL_INJECT_ALLOWLIST = new Set(["IDENTITY.md", "USER.md"]);

function applyContextModeFilter(params: {
  files: WorkspaceBootstrapFile[];
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): WorkspaceBootstrapFile[] {
  const contextMode = params.contextMode ?? "full";
  const runKind = params.runKind ?? "default";
  if (contextMode !== "lightweight") {
    return params.files;
  }
  if (runKind === "heartbeat") {
    return params.files.filter((file) => file.name === "HEARTBEAT.md");
  }
  // cron/default lightweight mode keeps bootstrap context empty on purpose.
  return [];
}

export async function resolveBootstrapFilesForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  warn?: (message: string) => void;
  /** When "once" and bootstrapInjected true, skip loading. When "minimal" and bootstrapInjected true, filter to minimal set. */
  injectMode?: "every-turn" | "once" | "minimal";
  bootstrapInjected?: boolean;
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): Promise<WorkspaceBootstrapFile[]> {
  if (params.injectMode === "once" && params.bootstrapInjected === true) {
    return [];
  }
  const sessionKey = params.sessionKey ?? params.sessionId;
  const rawFiles = params.sessionKey
    ? await getOrLoadBootstrapFiles({
        workspaceDir: params.workspaceDir,
        sessionKey: params.sessionKey,
      })
    : await loadWorkspaceBootstrapFiles(params.workspaceDir);
  let bootstrapFiles = applyContextModeFilter({
    files: filterBootstrapFilesForSession(rawFiles, sessionKey),
    contextMode: params.contextMode,
    runKind: params.runKind,
  });
  if (params.injectMode === "minimal" && params.bootstrapInjected === true) {
    bootstrapFiles = bootstrapFiles.filter((f) => MINIMAL_INJECT_ALLOWLIST.has(f.name));
  }

  const updated = await applyBootstrapHookOverrides({
    files: bootstrapFiles,
    workspaceDir: params.workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
  });
  return sanitizeBootstrapFiles(updated, params.warn);
}

export async function resolveBootstrapContextForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  warn?: (message: string) => void;
  injectMode?: "every-turn" | "once" | "minimal";
  bootstrapInjected?: boolean;
  contextMode?: BootstrapContextMode;
  runKind?: BootstrapContextRunKind;
}): Promise<{
  bootstrapFiles: WorkspaceBootstrapFile[];
  contextFiles: EmbeddedContextFile[];
}> {
  const bootstrapFiles = await resolveBootstrapFilesForRun(params);
  const contextFiles = buildBootstrapContextFiles(bootstrapFiles, {
    maxChars: resolveBootstrapMaxChars(params.config),
    totalMaxChars: resolveBootstrapTotalMaxChars(params.config),
    warn: params.warn,
  });
  return { bootstrapFiles, contextFiles };
}

export type ResolveContextForRunParams = Parameters<typeof resolveBootstrapContextForRun>[0];
export type ResolveContextForRunResult = Awaited<ReturnType<typeof resolveBootstrapContextForRun>>;

/**
 * Resolves workspace/memory context for a run. When agents.defaults.context.mode is
 * "index-rank-compact", uses the index-rank-compact pipeline (when implemented); otherwise
 * uses raw bootstrap injection. Keeps existing behavior as fallback.
 */
export async function resolveContextForRun(
  params: ResolveContextForRunParams,
): Promise<ResolveContextForRunResult> {
  const mode = params.config?.agents?.defaults?.context?.mode;
  if (mode === "index-rank-compact") {
    return getIndexRankCompactContext(params);
  }
  return resolveBootstrapContextForRun(params);
}

/**
 * Index-rank-compact backend: returns ranked, size-bounded context.
 * Currently delegates to raw bootstrap; replace with real index + rank + compact when implemented.
 */
async function getIndexRankCompactContext(
  params: ResolveContextForRunParams,
): Promise<ResolveContextForRunResult> {
  return resolveBootstrapContextForRun(params);
}
