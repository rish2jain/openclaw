import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock sync fs operations used by the actual persistence module
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockImplementation(() => {
    throw new Error("ENOENT");
  }),
  writeFileSync: vi.fn(),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("./profile/store.js", () => ({
  createProfileStore: vi.fn(() => ({
    fromJSON: vi.fn(),
    toJSON: vi.fn(() => ({})),
  })),
}));

vi.mock("./jobs/store.js", () => ({
  createJobStore: vi.fn(() => ({
    fromJSON: vi.fn(),
    toJSON: vi.fn(() => ({})),
  })),
}));

vi.mock("./network/types.js", () => ({
  createNetworkGraph: vi.fn(() => ({
    addPerson: vi.fn(),
    addEdge: vi.fn(),
    persons: new Map(),
    edges: [],
  })),
}));

vi.mock("./outreach/pipeline.js", () => ({
  createOutreachPipeline: vi.fn(() => ({
    fromJSON: vi.fn(),
    toJSON: vi.fn(() => []),
  })),
}));

vi.mock("./agent/mode.js", () => ({
  createModeManager: vi.fn(() => ({
    getMode: vi.fn(() => "discovery"),
    setMode: vi.fn(),
  })),
}));

// Reset the singleton between tests by clearing the module cache
beforeEach(async () => {
  vi.resetModules();
});

describe("getCareerContext", () => {
  it("returns a CareerContext with all expected stores", async () => {
    const { getCareerContext } = await import("./persistence.js");
    const ctx = await getCareerContext();

    expect(ctx).toHaveProperty("profileStore");
    expect(ctx).toHaveProperty("jobStore");
    expect(ctx).toHaveProperty("networkGraph");
    expect(ctx).toHaveProperty("outreachPipeline");
    expect(ctx).toHaveProperty("modeManager");
    expect(typeof ctx.save).toBe("function");
  });

  it("returns the same singleton on repeated calls", async () => {
    const { getCareerContext } = await import("./persistence.js");
    const first = await getCareerContext();
    const second = await getCareerContext();

    expect(first).toBe(second);
  });

  it("calls mkdirSync to ensure the career directory exists", async () => {
    const fs = await import("node:fs");
    const { getCareerContext } = await import("./persistence.js");

    await getCareerContext();

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining(".openclaw/career"), {
      recursive: true,
    });
  });

  it("handles missing JSON files gracefully", async () => {
    const { getCareerContext } = await import("./persistence.js");

    // existsSync returns false, so readJsonFile returns null
    // Should not throw, stores start empty
    const ctx = await getCareerContext();
    expect(ctx).toBeDefined();
  });

  it("save() writes all stores to disk", async () => {
    const fs = await import("node:fs");
    const { getCareerContext } = await import("./persistence.js");

    const ctx = await getCareerContext();
    await ctx.save();

    // writeFileSync should be called for profile, jobs, network, outreach
    expect(fs.writeFileSync).toHaveBeenCalledTimes(4);
    for (const call of (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[0]).toContain(".openclaw/career/");
      expect(call[2]).toBe("utf-8");
    }
  });

  it("hydrates stores when persisted data files exist", async () => {
    const fs = await import("node:fs");
    (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (String(path).includes("profile.json")) {
        return JSON.stringify({ name: "Test" });
      }
      if (String(path).includes("jobs.json")) {
        return JSON.stringify({ listings: [], searches: [] });
      }
      if (String(path).includes("network.json")) {
        return JSON.stringify({ persons: [{ id: "p1" }], edges: [] });
      }
      if (String(path).includes("outreach.json")) {
        return JSON.stringify([]);
      }
      throw new Error("ENOENT");
    });

    const { getCareerContext } = await import("./persistence.js");
    const ctx = await getCareerContext();

    // The network graph addPerson should have been called for the hydrated person
    expect(ctx.networkGraph.addPerson).toHaveBeenCalledWith({ id: "p1" });
  });
});
