import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "./memory-router.js";

describe("MemoryRouter", () => {
  let dbPath: string;
  let router: MemoryRouter;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-router-test-"));
    dbPath = path.join(tmpDir, "test.sqlite");
    router = new MemoryRouter({
      dbPath,
      agentId: "test-agent",
      sessionId: "test-session-1",
    });
  });

  afterEach(() => {
    router.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("session memory stores and retrieves", () => {
    router.session.store("working-on", "implementing graph memory");
    const entry = router.session.retrieve("working-on");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe("implementing graph memory");
  });

  it("session memory is isolated by session ID", () => {
    router.session.store("task", "my task");

    const router2 = new MemoryRouter({
      dbPath,
      agentId: "test-agent",
      sessionId: "test-session-2",
    });
    const entry = router2.session.retrieve("task");
    expect(entry).toBeNull();
    router2.close();
  });

  it("agent memory persists facts", () => {
    router.agent.storeFact("user:timezone", "PST", "user-stated");
    const entry = router.agent.retrieve("user:timezone");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe("PST");
    expect(entry!.metadata?.type).toBe("fact");
  });

  it("agent memory learns behaviors", () => {
    router.agent.learnBehavior("response-style", "User prefers concise answers", {
      confidence: 0.8,
    });
    const entry = router.agent.retrieve("response-style");
    expect(entry).not.toBeNull();
    expect(entry!.metadata?.type).toBe("learned_behavior");
    expect(entry!.metadata?.confidence).toBe(0.8);
  });

  it("shared memory is globally accessible", () => {
    router.shared.store("org:policy", "No PII in logs");
    const entry = router.shared.retrieve("org:policy");
    expect(entry).not.toBeNull();
    expect(entry!.value).toBe("No PII in logs");
  });

  it("cross-tier search returns results from all tiers", () => {
    router.session.store("note", "working on TypeScript migration");
    router.agent.storeFact("lang", "TypeScript is primary language");
    router.shared.store("policy:lang", "TypeScript strict mode required");

    const results = router.search("TypeScript");
    const tiers = new Set(results.map((r) => r.entry.tier));
    expect(tiers).toContain("session");
    expect(tiers).toContain("agent");
    expect(tiers).toContain("shared");
  });

  it("pruneAll removes expired entries across tiers", () => {
    const past = Date.now() - 10_000;
    router.session.store("expired", "old data", { expiresAt: past });
    router.agent.store("still-here", "persists");

    const pruned = router.pruneAll();
    expect(pruned.session).toBe(1);
    expect(pruned.agent).toBe(0);
    expect(pruned.shared).toBe(0);
  });

  it("auto-routes ephemeral hints to session tier", () => {
    const entry = router.store("scratch-data", "temp value", {
      hints: { ephemeral: true },
    });
    expect(entry.tier).toBe("session");
  });

  it("auto-routes shared hints to shared tier", () => {
    const entry = router.store("company-info", "OpenClaw Inc", {
      hints: { shared: true },
    });
    expect(entry.tier).toBe("shared");
  });

  it("auto-routes by key prefix convention", () => {
    const temp = router.store("temp:working-file", "foo.ts", {});
    expect(temp.tier).toBe("session");

    const global = router.store("global:model-version", "v2", {});
    expect(global.tier).toBe("shared");
  });
});
