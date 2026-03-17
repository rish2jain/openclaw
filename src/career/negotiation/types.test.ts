import { describe, it, expect } from "vitest";
import { normalizeWeights, DEFAULT_WEIGHTS } from "./types.js";

describe("normalizeWeights", () => {
  it("returns defaults when given empty object", () => {
    const result = normalizeWeights({});
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it("normalizes custom weights to sum to 1.0", () => {
    const result = normalizeWeights({ totalComp: 0.5, stability: 0.5 });
    const sum = Object.values(result).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it("returns defaults when all weights are zero", () => {
    const result = normalizeWeights({
      totalComp: 0,
      equityUpside: 0,
      workLifeBalance: 0,
      growthPotential: 0,
      cultureFit: 0,
      stability: 0,
      location: 0,
    });
    expect(result).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("DEFAULT_WEIGHTS", () => {
  it("sums to 1.0", () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0);
  });

  it("has all 7 dimension keys", () => {
    const keys = Object.keys(DEFAULT_WEIGHTS);
    expect(keys).toHaveLength(7);
    expect(keys).toContain("totalComp");
    expect(keys).toContain("equityUpside");
    expect(keys).toContain("workLifeBalance");
    expect(keys).toContain("growthPotential");
    expect(keys).toContain("cultureFit");
    expect(keys).toContain("stability");
    expect(keys).toContain("location");
  });
});
