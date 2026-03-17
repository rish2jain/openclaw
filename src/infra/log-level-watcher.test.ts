import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loggingState } from "../logging/state.js";
import {
  applyLogLevel,
  onLogLevelChange,
  isValidLogLevel,
  refreshLogLevelFromConfig,
  resetLogLevelWatcherForTest,
  startLogLevelWatcher,
} from "./log-level-watcher.js";

const getConfigPath = vi.hoisted(() => vi.fn());
const watchCallbackRef = vi.hoisted(() => ({
  current: null as ((curr: fs.Stats, prev: fs.Stats) => void) | null,
}));

vi.mock("../config/paths.js", () => ({
  resolveConfigPath: () => getConfigPath(),
}));

describe("log-level-watcher", () => {
  let tempDir: string;

  beforeEach(() => {
    resetLogLevelWatcherForTest();
    loggingState.overrideSettings = null;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "log-level-watcher-"));
    getConfigPath.mockReturnValue(path.join(tempDir, "openclaw.json"));
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    resetLogLevelWatcherForTest();
    loggingState.overrideSettings = null;
    watchCallbackRef.current = null;
  });

  it("applyLogLevel updates logging state override", () => {
    applyLogLevel("debug");

    expect(loggingState.overrideSettings).toBeDefined();
    const overrides = loggingState.overrideSettings as Record<string, unknown>;
    expect(overrides.level).toBe("debug");
  });

  it("applyLogLevel sets both level and consoleLevel", () => {
    applyLogLevel("trace", "debug");

    const overrides = loggingState.overrideSettings as Record<string, unknown>;
    expect(overrides.level).toBe("trace");
    expect(overrides.consoleLevel).toBe("debug");
  });

  it("notifies watchers on level change", () => {
    const changes: Array<{ level: string; consoleLevel?: string }> = [];
    onLogLevelChange((level, consoleLevel) => {
      changes.push({ level, consoleLevel });
    });

    applyLogLevel("warn");

    expect(changes).toHaveLength(1);
    expect(changes[0].level).toBe("warn");
  });

  it("does not notify when level unchanged", () => {
    const changes: Array<{ level: string }> = [];
    onLogLevelChange((level) => {
      changes.push({ level });
    });

    applyLogLevel("info");
    applyLogLevel("info");

    expect(changes).toHaveLength(1);
  });

  it("unsubscribe stops notifications", () => {
    const changes: string[] = [];
    const unsub = onLogLevelChange((level) => {
      changes.push(level);
    });

    applyLogLevel("debug");
    unsub();
    applyLogLevel("error");

    expect(changes).toHaveLength(1);
    expect(changes[0]).toBe("debug");
  });

  it("survives watcher errors", () => {
    onLogLevelChange(() => {
      throw new Error("watcher boom");
    });

    applyLogLevel("trace");

    const overrides = loggingState.overrideSettings as Record<string, unknown>;
    expect(overrides.level).toBe("trace");
  });

  describe("isValidLogLevel", () => {
    it("accepts valid log levels", () => {
      expect(isValidLogLevel("silent")).toBe(true);
      expect(isValidLogLevel("fatal")).toBe(true);
      expect(isValidLogLevel("error")).toBe(true);
      expect(isValidLogLevel("warn")).toBe(true);
      expect(isValidLogLevel("info")).toBe(true);
      expect(isValidLogLevel("debug")).toBe(true);
      expect(isValidLogLevel("trace")).toBe(true);
    });

    it("rejects invalid log levels", () => {
      expect(isValidLogLevel("verbose")).toBe(false);
      expect(isValidLogLevel("")).toBe(false);
      expect(isValidLogLevel("WARNING")).toBe(false);
    });
  });

  it("preserves existing override settings when applying", () => {
    loggingState.overrideSettings = { redactSensitive: "tools", consoleStyle: "json" };
    applyLogLevel("debug");

    const overrides = loggingState.overrideSettings as Record<string, unknown>;
    expect(overrides.level).toBe("debug");
    expect(overrides.redactSensitive).toBe("tools");
    expect(overrides.consoleStyle).toBe("json");
  });

  describe("refreshLogLevelFromConfig", () => {
    it("does not throw and does not set overrideSettings when config file is missing", () => {
      expect(() => refreshLogLevelFromConfig()).not.toThrow();
      expect(loggingState.overrideSettings).toBeNull();
    });

    it("does not throw and does not set overrideSettings when config contains invalid JSON", () => {
      const configPath = getConfigPath();
      fs.writeFileSync(configPath, "not valid json {", "utf-8");
      expect(() => refreshLogLevelFromConfig()).not.toThrow();
      expect(loggingState.overrideSettings).toBeNull();
    });

    it("does not throw and does not set overrideSettings when config lacks logging section", () => {
      const configPath = getConfigPath();
      fs.writeFileSync(configPath, "{}", "utf-8");
      expect(() => refreshLogLevelFromConfig()).not.toThrow();
      expect(loggingState.overrideSettings).toBeNull();
    });

    it("applies level from config when logging section is present", () => {
      const configPath = getConfigPath();
      fs.writeFileSync(configPath, '{"logging":{"level":"warn"}}', "utf-8");
      expect(() => refreshLogLevelFromConfig()).not.toThrow();
      expect(loggingState.overrideSettings).toBeDefined();
      const overrides = loggingState.overrideSettings as Record<string, unknown>;
      expect(overrides.level).toBe("warn");
    });
  });

  describe("startLogLevelWatcher", () => {
    let watchFileSpy: ReturnType<typeof vi.spyOn>;
    let unwatchFileSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      watchCallbackRef.current = null;
      watchFileSpy = vi.spyOn(fs, "watchFile").mockImplementation(((
        _path: fs.PathLike,
        optsOrListener: fs.WatchFileOptions | ((curr: fs.Stats, prev: fs.Stats) => void),
        listener?: (curr: fs.Stats, prev: fs.Stats) => void,
      ) => {
        const resolved = typeof optsOrListener === "function" ? optsOrListener : listener;
        if (resolved) {
          watchCallbackRef.current = resolved;
        }
      }) as typeof fs.watchFile);
      unwatchFileSpy = vi.spyOn(fs, "unwatchFile").mockImplementation(() => {});
    });

    afterEach(() => {
      watchFileSpy?.mockRestore();
      unwatchFileSpy?.mockRestore();
    });

    it("calls refreshLogLevelFromConfig on start and when watcher callback fires", () => {
      const configPath = path.join(tempDir, "openclaw.json");
      fs.writeFileSync(configPath, '{"logging":{"level":"info"}}', "utf-8");
      const watcher = startLogLevelWatcher();
      expect(loggingState.overrideSettings).toBeDefined();
      expect((loggingState.overrideSettings as Record<string, unknown>).level).toBe("info");

      fs.writeFileSync(configPath, '{"logging":{"level":"debug"}}', "utf-8");
      expect(watchCallbackRef.current).toBeDefined();
      watchCallbackRef.current!({} as fs.Stats, {} as fs.Stats);
      expect((loggingState.overrideSettings as Record<string, unknown>).level).toBe("debug");

      watcher.stop();
    });

    it("cleans up on stop (unwatchFile called)", () => {
      const configPath = path.join(tempDir, "openclaw.json");
      fs.writeFileSync(configPath, '{"logging":{"level":"info"}}', "utf-8");
      const watcher = startLogLevelWatcher();
      expect(watchFileSpy).toHaveBeenCalledWith(
        configPath,
        expect.any(Object),
        expect.any(Function),
      );
      watcher.stop();
      expect(unwatchFileSpy).toHaveBeenCalledWith(configPath);
    });
  });
});
