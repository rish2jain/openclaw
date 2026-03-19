---
name: openclaw-repo-enhancements-review
description: Strategic end-to-end enhancement plan for the OpenClaw repository based on multi-model review.
---

# Plan

This plan synthesizes six completed multi-model repo reviews across the OpenClaw monorepo; three agents did not finish within the wait window, so the plan below is based on the completed set. The strongest common themes were architectural deduplication, boundary hardening, test coverage in high-risk paths, and simplification of the largest subsystems before adding more features.

## Requirements

- Review the repo as a whole, not just one package.
- Prioritize enhancements that reduce risk, improve maintainability, and unblock future work.
- Focus on recommendations grounded in the current codebase shape and docs.
- Sequence work into near-term, mid-term, and longer-term horizons.

## Scope

- In: `src/`, `extensions/*`, `ui/`, `apps/*`, `docs/`, `scripts/`, CI/test topology, architecture boundaries, and developer workflows.
- Out: feature implementation, speculative redesigns without clear codebase signals, and low-signal cosmetic cleanup.

## Files and entry points

- `src/mcp/tools/index.ts` — canonical tool registry; `src/mcp/serve/tools/` has parallel implementations (consolidation target)
- `src/mcp/protocol.ts`, `src/mcp/serve/protocol.ts` — duplicate transport layers
- `src/mcp/server.ts`, `src/mcp/serve/server.ts` — duplicate server lifecycle
- `src/mcp/resources.ts`, `src/mcp/serve/resources.ts` — duplicate resource providers
- `src/plugin-sdk/index.ts`
- `src/gateway/server-http.ts`
- `src/gateway/server-methods/chat.ts`
- `src/gateway/server-startup-channels-orchestrator.ts`
- `src/auto-reply/reply/`
- `src/career/persistence.ts`
- `src/channels/persistence/channel-state-store.ts`
- `src/config/io.ts`
- `src/plugins/loader.ts`
- `src/commands/`, `src/cli/program/` — CLI commands and registration
- `src/memory/` — tiered store, search, chunking, graph
- `package.json`
- `.github/workflows/ci.yml`
- `docs/concepts/architecture.md` — repo layout, component map
- `docs/channels/reliability.md`
- `docs/help/testing.md` — test topology
- `CONTRIBUTING.md` — module map, extension guidance

## Data model / API changes

- Consolidate duplicated MCP transport/tool layers so there is one canonical server/tool stack.
- Narrow the plugin SDK root export surface and move consumers toward granular subpath imports.
- Introduce clearer gateway public interfaces instead of broad internal imports and oversized context objects.
- Move career persistence toward a structured store if the module continues to expand.
- Expose more runtime observability surfaces for channel health, failover, and gateway request flows.

## Synthesis of agent findings

- Common recommendation: remove duplication in MCP and plugin SDK surfaces first.
- Common recommendation: refactor the largest gateway and auto-reply hotspots before they accumulate more logic.
- Common recommendation: strengthen tests in security, RBAC, reliability, and message-routing paths.
- Common recommendation: tighten architectural boundaries already implied by custom lint rules.
- Common recommendation: improve documentation and CI ergonomics so contributors understand the intended structure.

## Action items

[ ] Consolidate MCP implementations by auditing `src/mcp/*` against `src/mcp/serve/*`, choosing one canonical transport/tool stack, and deleting or folding the duplicate layer after parity checks.

[ ] Reduce plugin SDK coupling by splitting `src/plugin-sdk/index.ts` into smaller domain exports, tightening subpath import usage, and aligning the public surface with the repo’s own anti-monolithic lint rule.

[ ] Fix architecture boundary leaks in gateway-to-extension integration, especially places where gateway code appears to special-case extension behavior instead of routing through plugin abstractions.

[ ] Refactor gateway complexity hotspots by breaking up oversized files such as `src/gateway/server-methods/chat.ts`, `server-http.ts`, and other large request-handling units into domain-oriented modules with narrower context types.

[ ] Simplify the auto-reply pipeline by grouping `src/auto-reply/reply/` into clearer command, directive, ACP, queue, and delivery layers, then making the core orchestration path easier to test end-to-end.

[ ] Expand high-risk test coverage first in security, RBAC, channel reliability, gateway hot paths, and under-tested extension/security-adjacent packages; use the existing suite split, but add clearer contract-style coverage for core flows.

[x] Improve persistence consistency (partial): (1) Implemented SQLite path for channel-state-store when `dbPath` is provided; added tests for save/load/reopen. (2) Documented career as single-user JSON in `src/career/README.md`. Remaining: wire `dbPath` from gateway config if desired; decide career migration to SQLite when scaling beyond single-user.

[ ] Unify observability by deciding between the current logging patterns, threading correlation context through gateway, agent, MCP, and channel flows, and exposing channel/failover metrics in a first-class way.

[ ] Streamline build and CI ergonomics by decomposing the long `package.json` script chains, documenting custom lint scripts and test-suite intent, and adding missing safety checks to the default PR pipeline where appropriate.

[ ] Triage repository sprawl by identifying abandoned or experimental extensions, standardizing extension packaging structure, and documenting which integrations are production-ready versus provisional.

[x] Close documentation drift by updating architecture docs and contributor docs to match the current source tree, especially around commands, memory, MCP, testing topology, control UI, and extension development guidance. (Done: `docs/concepts/architecture.md`, `CONTRIBUTING.md`, `src/README.md`, `AGENTS.md`, `CLAUDE.md`)

## Recommended sequence

### Near-term

- MCP consolidation audit and decision (canonical layer: `src/mcp/tools/` + `src/mcp/server.ts` vs `src/mcp/serve/*`).
- Plugin SDK surface reduction plan.
- Boundary leak fixes in gateway/extension integration.
- Targeted tests for security, RBAC, circuit breaker, and gateway hot routes.
- Documentation for custom lints, suite selection, and contributor workflow.

**Done:** Architecture and contributor docs updated; module map, testing topology, and extension guidance now reflect current source tree.

Rationale: these are high-leverage, lower-regret changes that reduce duplication and risk before broader refactors.

### Mid-term

- Gateway mega-file breakup and context narrowing.
- Auto-reply subsystem restructuring with contract tests.
- Persistence model standardization for channel and career state.
- Extension packaging and health audit across the extension catalog.
- Logging/metrics unification across gateway, channels, and MCP.

Rationale: these changes pay off once boundaries are clearer and the team has stronger regression protection.

### Longer-term

- Build graph/task-runner improvements and CI optimization.
- Broader config-system simplification.
- Shared extension base abstractions where repetition is proven.
- Deeper docs overhaul and operability guides.
- Optional first-class tracing/OTEL if operational complexity continues to grow.

Rationale: these are valuable, but they are safer after the structural and test foundations are improved.

## Testing and validation

- Run `pnpm tsgo`, `pnpm lint`, and `pnpm check` after each structural phase.
- Use `pnpm test:fast` for core refactors, then the narrow suite that matches the surface: `pnpm test:gateway`, `pnpm test:channels`, `pnpm test:extensions`, `pnpm test:e2e`.
- Add characterization tests before deleting duplicate MCP code or restructuring gateway/auto-reply internals.
- For extension-boundary work, verify both lint rules and integration behavior.
- For persistence changes, validate migration behavior and restart durability explicitly.

## Risks and edge cases

- MCP consolidation may break consumers if both stacks have drifted semantically.
- Plugin SDK shrinkage can create downstream breakage for extensions relying on broad root imports.
- Gateway and auto-reply refactors are likely merge-conflict magnets because they touch central files.
- Persistence standardization can introduce migration and compatibility risk for existing local data.
- Some findings are inference-based from code structure and docs, so they should be confirmed with a short implementation spike before large deletions.

## Persistence landscape (findings)

Current mix of JSON vs SQLite across subsystems:

| Subsystem               | Backend                                | Location                                                | Notes                                                                                                                |
| ----------------------- | -------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Career**              | JSON                                   | `~/.openclaw/career/*.json`                             | profile.json, jobs.json, network.json, outreach.json, intel.json, interactions.json. Atomic writes via tmp + rename. |
| **Channel state**       | SQLite (when `dbPath` set) / in-memory | `channel-state-store.ts`                                | SQLite path implemented; pass `dbPath` to persist. In-memory when omitted. Tests in `channel-state-store.test.ts`.   |
| **Memory (agent)**      | SQLite                                 | `~/.openclaw/memory/{agentId}.sqlite`                   | Tiered store, vector search (sqlite-vec), QMD index.                                                                 |
| **Config / sessions**   | JSON                                   | `~/.openclaw/openclaw.json`, `sessions.json`, `*.jsonl` | Config, sessions metadata, transcripts; plugin catalogs; cron run logs.                                              |
| **Credentials / OAuth** | JSON                                   | `auth-profiles.json`, `oauth.json`                      | Credential storage.                                                                                                  |

### Recommendations for persistence consistency

1. **Channel state** — Done. SQLite path implemented; when `dbPath` is provided, state persists to disk. Tests added for save/load/reopen. Remaining: wire `dbPath` from gateway config (e.g. `~/.openclaw/channels/state.sqlite`) if durable channel state is desired at runtime.

2. **Career** — JSON documented as single-user-only in `src/career/README.md`. If career grows (multi-agent, sharing, or heavy querying), consider SQLite for jobs/network/outreach. No immediate change required.

3. **Standardization rule** — Prefer SQLite when: (a) state is multi-entity with relationships, (b) concurrent writes or atomic updates matter, or (c) restart durability is required for correctness. Prefer JSON when: (a) single-file, human-editable config, or (b) append-only logs (JSONL).

4. **Migration** — Any move from JSON to SQLite for career or channel state must preserve existing data; add a one-time migration step and document rollback.

## Open questions

- Which MCP path is intended to be canonical going forward: top-level `src/mcp/*` (protocol, server, resources, tools) or `src/mcp/serve/*`? Both layers exist and serve overlapping roles.
- Are currently low-signal extensions meant to be maintained, experimental, or deprecated?
- Is the intended security model still strictly single-trust-boundary, or is the repo trending toward multi-tenant use cases that require stronger auth and data isolation?
