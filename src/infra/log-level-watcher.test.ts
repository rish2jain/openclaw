import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loggingState } from "../logging/state.js";
import {
  applyLogLevel,
  onLogLevelChange,
  isValidLogLevel,
  resetLogLevelWatcherForTest,
} from "./log-level-watcher.js";

describe("log-level-watcher", () => {
  beforeEach(() => {
    resetLogLevelWatcherForTest();
    loggingState.overrideSettings = null;
  });

  afterEach(() => {
    resetLogLevelWatcherForTest();
    loggingState.overrideSettings = null;
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
});
