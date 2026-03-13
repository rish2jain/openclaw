import { afterEach, describe, expect, it, vi } from "vitest";
import { noteFts5Availability, probeFts5Availability } from "./doctor-fts5.js";

type SqliteMockScenario = "success" | "fts5_error" | "module_not_found";
const mockState = vi.hoisted(() => ({
  scenario: "success" as SqliteMockScenario,
}));
const noteMock = vi.hoisted(() => vi.fn());

vi.mock("../terminal/note.js", () => ({
  note: noteMock,
}));

vi.mock("./doctor-fts5-sqlite.js", () => {
  const DbSync = class {
    exec(_sql: string) {
      if (mockState.scenario === "fts5_error") {
        throw new Error("no such module: fts5");
      }
    }
    close() {}
  };
  return {
    loadNodeSqlite() {
      if (mockState.scenario === "module_not_found") {
        throw new Error("Cannot find module 'node:sqlite'");
      }
      return { DatabaseSync: DbSync };
    },
  };
});

describe("doctor-fts5", () => {
  afterEach(() => {
    mockState.scenario = "success";
    noteMock.mockClear();
  });

  it("probeFts5Availability returns a result object", () => {
    const result = probeFts5Availability();
    expect(typeof result.available).toBe("boolean");
    if (!result.available) {
      expect(typeof result.error).toBe("string");
    }
  });

  it("probeFts5Availability returns available true when FTS5 CREATE succeeds", () => {
    const result = probeFts5Availability();
    expect(result.available).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("probeFts5Availability returns available false and error string when db.exec throws FTS5 error", () => {
    mockState.scenario = "fts5_error";
    const result = probeFts5Availability();
    expect(result.available).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error).toBe("no such module: fts5");
  });

  it("probeFts5Availability returns available false and error string when node:sqlite is unavailable", () => {
    mockState.scenario = "module_not_found";
    const result = probeFts5Availability();
    expect(result.available).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error).toContain("node:sqlite unavailable");
    expect(result.error).toContain("Cannot find module 'node:sqlite'");
  });

  describe("noteFts5Availability", () => {
    it("does not call note when FTS5 is available (success scenario)", () => {
      mockState.scenario = "success";
      noteFts5Availability();
      expect(noteMock).not.toHaveBeenCalled();
    });

    it("calls note once when FTS5 probe fails (fts5_error scenario)", () => {
      mockState.scenario = "fts5_error";
      noteFts5Availability();
      expect(noteMock).toHaveBeenCalledTimes(1);
      expect(noteMock).toHaveBeenCalledWith(
        expect.stringMatching(/SQLite FTS5 extension is not available[\s\S]*no such module: fts5/),
        "Memory FTS5",
      );
    });

    it("calls note once when node:sqlite is unavailable (module_not_found scenario)", () => {
      mockState.scenario = "module_not_found";
      noteFts5Availability();
      expect(noteMock).toHaveBeenCalledTimes(1);
      expect(noteMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /SQLite FTS5 extension is not available[\s\S]*node:sqlite unavailable/,
        ),
        "Memory FTS5",
      );
    });
  });
});
