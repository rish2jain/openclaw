/**
 * Loader for node:sqlite used by the FTS5 probe.
 * Isolated in this module so unit tests can mock it for deterministic scenarios.
 * @internal
 */
export function loadNodeSqlite(): typeof import("node:sqlite") {
  return require("node:sqlite") as typeof import("node:sqlite");
}
