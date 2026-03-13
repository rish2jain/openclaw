import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteTieredMemoryStore } from "./tiered-store.js";

describe("SqliteTieredMemoryStore", () => {
  let dbPath: string;
  let store: SqliteTieredMemoryStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiered-store-test-"));
    dbPath = path.join(tmpDir, "test.sqlite");
    store = new SqliteTieredMemoryStore({ dbPath });
  });

  afterEach(() => {
    store.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (e.g. already removed)
    }
  });

  it("store and retrieve an entry", () => {
    const entry = store.store("agent", "user:name", "Alice");
    expect(entry.tier).toBe("agent");
    expect(entry.key).toBe("user:name");
    expect(entry.value).toBe("Alice");
    expect(entry.id).toBeTruthy();

    const retrieved = store.retrieve("agent", "user:name");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.value).toBe("Alice");
  });

  it("upserts on duplicate tier+key", () => {
    store.store("agent", "pref:theme", "dark");
    const updated = store.store("agent", "pref:theme", "light");
    expect(updated.value).toBe("light");

    const all = store.list("agent");
    const matching = all.filter((e) => e.key === "pref:theme");
    expect(matching).toHaveLength(1);
    expect(matching[0].value).toBe("light");
  });

  it("tiers are isolated", () => {
    store.store("session", "key1", "session-val");
    store.store("agent", "key1", "agent-val");
    store.store("shared", "key1", "shared-val");

    expect(store.retrieve("session", "key1")!.value).toBe("session-val");
    expect(store.retrieve("agent", "key1")!.value).toBe("agent-val");
    expect(store.retrieve("shared", "key1")!.value).toBe("shared-val");
  });

  it("delete removes an entry", () => {
    store.store("agent", "to-delete", "gone");
    expect(store.delete("agent", "to-delete")).toBe(true);
    expect(store.retrieve("agent", "to-delete")).toBeNull();
    expect(store.delete("agent", "to-delete")).toBe(false);
  });

  it("prune removes expired entries", () => {
    const past = Date.now() - 10_000;
    const future = Date.now() + 60_000;

    store.store("session", "expired", "old", { expiresAt: past });
    store.store("session", "fresh", "new", { expiresAt: future });

    const pruned = store.prune("session");
    expect(pruned).toBe(1);

    expect(store.retrieve("session", "expired")).toBeNull();
    expect(store.retrieve("session", "fresh")).not.toBeNull();
  });

  it("list returns entries ordered by updated_at desc", () => {
    store.store("agent", "a", "first");
    store.store("agent", "b", "second");
    store.store("agent", "c", "third");

    const list = store.list("agent");
    expect(list).toHaveLength(3);
    // Most recently updated first
    expect(list[0].key).toBe("c");
  });

  it("list respects limit and offset", () => {
    for (let i = 0; i < 10; i++) {
      store.store("shared", `item-${i}`, `value-${i}`);
    }

    const page1 = store.list("shared", { limit: 3, offset: 0 });
    expect(page1).toHaveLength(3);

    const page2 = store.list("shared", { limit: 3, offset: 3 });
    expect(page2).toHaveLength(3);

    // No overlap
    const keys1 = new Set(page1.map((e) => e.key));
    const keys2 = new Set(page2.map((e) => e.key));
    for (const k of keys2) {
      expect(keys1.has(k)).toBe(false);
    }
  });

  it("search finds entries by value content", () => {
    store.store("agent", "fact:language", "TypeScript is the primary language");
    store.store("agent", "fact:db", "SQLite is used for storage");

    const results = store.search("TypeScript");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].entry.key).toBe("fact:language");
  });

  it("search filters by tier", () => {
    store.store("session", "note", "temporary note about TypeScript");
    store.store("agent", "fact", "TypeScript fact");

    const sessionOnly = store.search("TypeScript", { tiers: ["session"] });
    expect(sessionOnly.every((r) => r.entry.tier === "session")).toBe(true);
  });

  it("metadata is stored and retrieved", () => {
    store.store("agent", "with-meta", "value", {
      metadata: { source: "test", score: 0.9 },
    });
    const entry = store.retrieve("agent", "with-meta");
    expect(entry!.metadata).toEqual({ source: "test", score: 0.9 });
  });

  it("throws after close", () => {
    store.close();
    expect(() => store.store("agent", "k", "v")).toThrow("closed");
  });
});
