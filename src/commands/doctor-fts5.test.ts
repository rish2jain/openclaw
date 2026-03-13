import { describe, expect, it } from "vitest";
import { probeFts5Availability } from "./doctor-fts5.js";

describe("doctor-fts5", () => {
  it("probeFts5Availability returns a result object", () => {
    const result = probeFts5Availability();
    expect(typeof result.available).toBe("boolean");
    // On most dev machines with Node 22+, FTS5 should be available
    if (!result.available) {
      expect(typeof result.error).toBe("string");
    }
  });
});
