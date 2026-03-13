import { afterEach, describe, expect, it, vi } from "vitest";
import { probeFts5Availability } from "./doctor-fts5.js";

type SqliteMockScenario = "success" | "fts5_error" | "module_not_found";
const mockState = vi.hoisted(() => ({
  scenario: "success" as SqliteMockScenario,
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
});
