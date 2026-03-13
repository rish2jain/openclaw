/**
 * Runtime log level control.
 *
 * Watches for config changes to `logging.level` and `logging.consoleLevel`
 * and applies them dynamically without requiring a gateway restart.
 *
 * Integrates with the existing config reload system via fs.watchFile
 * polling on the config path.
 */

import fs from "node:fs";
import json5 from "json5";
import { resolveConfigPath } from "../config/paths.js";
import { type LogLevel, tryParseLogLevel, ALLOWED_LOG_LEVELS } from "../logging/levels.js";
import { loggingState } from "../logging/state.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/log-level-watcher");

export type LogLevelWatcherState = {
  currentLevel?: LogLevel;
  currentConsoleLevel?: LogLevel;
  watchers: Set<(level: LogLevel, consoleLevel?: LogLevel) => void>;
};

const WATCHER_KEY: unique symbol = Symbol.for("openclaw.logLevelWatcher");

function getWatcherState(): LogLevelWatcherState {
  const globalStore = globalThis as typeof globalThis & {
    [WATCHER_KEY]?: LogLevelWatcherState;
  };
  if (!globalStore[WATCHER_KEY]) {
    globalStore[WATCHER_KEY] = {
      watchers: new Set(),
    };
  }
  return globalStore[WATCHER_KEY];
}

/**
 * Register a callback for log level changes.
 * Returns an unsubscribe function.
 */
export function onLogLevelChange(
  callback: (level: LogLevel, consoleLevel?: LogLevel) => void,
): () => void {
  const state = getWatcherState();
  state.watchers.add(callback);
  return () => {
    state.watchers.delete(callback);
  };
}

/**
 * Read the current log level from the config file.
 */
function readLogLevelFromConfig(): {
  level?: LogLevel;
  consoleLevel?: LogLevel;
} {
  const configPath = resolveConfigPath();
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = json5.parse(raw);
    const logging = parsed?.logging;
    if (!logging || typeof logging !== "object") {
      return {};
    }
    return {
      level: tryParseLogLevel(logging.level),
      consoleLevel: tryParseLogLevel(logging.consoleLevel),
    };
  } catch {
    return {};
  }
}

/**
 * Apply a new log level at runtime.
 * Updates the logging state so subsequent log calls respect the new level.
 */
export function applyLogLevel(level: LogLevel, consoleLevel?: LogLevel): void {
  const state = getWatcherState();
  const prevLevel = state.currentLevel;
  const prevConsoleLevel = state.currentConsoleLevel;

  // Update override settings in the global logging state.
  const overrides: Record<string, unknown> = {
    ...(typeof loggingState.overrideSettings === "object" && loggingState.overrideSettings !== null
      ? loggingState.overrideSettings
      : {}),
  };
  overrides.level = level;
  if (consoleLevel) {
    overrides.consoleLevel = consoleLevel;
  }
  loggingState.overrideSettings = overrides;

  state.currentLevel = level;
  state.currentConsoleLevel = consoleLevel;

  if (prevLevel !== level || prevConsoleLevel !== consoleLevel) {
    log.info(
      `log level updated: level=${level}${consoleLevel ? ` consoleLevel=${consoleLevel}` : ""}`,
    );
    for (const watcher of state.watchers) {
      try {
        watcher(level, consoleLevel);
      } catch {
        // Silently drop watcher errors.
      }
    }
  }
}

/**
 * Check the config file for log level changes and apply if different.
 */
export function refreshLogLevelFromConfig(): void {
  const { level, consoleLevel } = readLogLevelFromConfig();
  const state = getWatcherState();

  if (!level && !consoleLevel) {
    return;
  }

  const effectiveLevel = level ?? state.currentLevel ?? "info";
  const effectiveConsoleLevel = consoleLevel ?? state.currentConsoleLevel;

  if (
    effectiveLevel !== state.currentLevel ||
    effectiveConsoleLevel !== state.currentConsoleLevel
  ) {
    applyLogLevel(effectiveLevel, effectiveConsoleLevel);
  }
}

export type LogLevelWatcher = {
  /** Stop watching for config changes. */
  stop: () => void;
};

/**
 * Start watching the config file for log level changes.
 * Uses fs.watchFile (polling) for cross-platform reliability.
 */
export function startLogLevelWatcher(): LogLevelWatcher {
  const configPath = resolveConfigPath();
  const pollIntervalMs = 3000;

  refreshLogLevelFromConfig();

  fs.watchFile(configPath, { interval: pollIntervalMs }, () => {
    try {
      refreshLogLevelFromConfig();
    } catch (err) {
      log.warn(
        `failed to refresh log level from config: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  return {
    stop() {
      fs.unwatchFile(configPath);
    },
  };
}

/**
 * Validate that a string is a valid log level.
 * Used by `openclaw config set log.level <value>`.
 */
export function isValidLogLevel(value: string): value is LogLevel {
  return ALLOWED_LOG_LEVELS.includes(value as LogLevel);
}

/**
 * Reset watcher state for tests.
 */
export function resetLogLevelWatcherForTest(): void {
  const state = getWatcherState();
  state.currentLevel = undefined;
  state.currentConsoleLevel = undefined;
  state.watchers.clear();
}
