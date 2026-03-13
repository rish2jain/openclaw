/**
 * Doctor check for FTS5 (Full-Text Search) extension availability.
 *
 * FTS5 is required for hybrid keyword+vector search in the memory system.
 * On Debian/Ubuntu and some minimal Node distributions, the SQLite FTS5
 * extension may not be compiled in.  When missing, memory search falls
 * back to vector-only or LIKE-based search with degraded quality.
 *
 * This check probes the node:sqlite runtime for FTS5 support and emits
 * an actionable diagnostic when it is unavailable.
 */

import { formatCliCommand } from "../cli/command-format.js";
import { note } from "../terminal/note.js";

/**
 * Probe whether the current Node runtime's built-in SQLite supports FTS5.
 * Returns `true` when FTS5 is available, `false` otherwise.
 */
export function probeFts5Availability(): { available: boolean; error?: string } {
  try {
    const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`CREATE VIRTUAL TABLE _fts5_probe USING fts5(content)`);
      db.exec(`DROP TABLE _fts5_probe`);
      return { available: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { available: false, error: message };
    } finally {
      db.close();
    }
  } catch (err) {
    // node:sqlite itself is unavailable
    const message = err instanceof Error ? err.message : String(err);
    return { available: false, error: `node:sqlite unavailable: ${message}` };
  }
}

/**
 * Emit a doctor note when FTS5 is not available.
 *
 * Called as part of the `openclaw doctor` command to surface the issue
 * and provide remediation guidance.
 */
export function noteFts5Availability(): void {
  const { available, error } = probeFts5Availability();
  if (available) {
    return;
  }

  const lines = [
    "SQLite FTS5 extension is not available in this Node runtime.",
    "Memory search will use vector-only or LIKE-based fallback, which may",
    "produce lower-quality results for keyword queries.",
  ];

  if (error) {
    lines.push("", `Probe error: ${error}`);
  }

  lines.push(
    "",
    "This is common on Debian/Ubuntu systems where the Node.js SQLite module",
    "is compiled without FTS5 support.",
    "",
    "Remediation (pick one):",
    "- Upgrade to Node.js 22+ from the official NodeSource repository",
    "- Install the libsqlite3-dev package with FTS5 enabled and rebuild Node",
    "- Use nvm/fnm to install an official Node.js build which includes FTS5",
    "",
    `Verify: ${formatCliCommand("openclaw memory status --deep")}`,
  );

  note(lines.join("\n"), "Memory FTS5");
}
