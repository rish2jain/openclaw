# Repository Guidelines

## Project Structure & Module Organization

OpenClaw is a `pnpm` monorepo. Core gateway, MCP, channel orchestration, and shared SDK code live in `src/`. Messaging integrations are separate workspace packages in `extensions/*` (for example `extensions/telegram` and `extensions/discord`). Additional packages live in `packages/*`, the web UI is in `ui/`, native apps are in `apps/`, and documentation lives in `docs/`. Tests are usually colocated with source as `*.test.ts`.

## Build, Test, and Development Commands

Run all commands from the repository root.

- `pnpm install` installs all workspace dependencies.
- `pnpm dev` starts the main development flow; `pnpm gateway:dev` runs the gateway without channels.
- `pnpm build` builds the TypeScript packages, plugin SDK, and CLI metadata.
- `pnpm tsgo` runs TypeScript checking only.
- `pnpm test` runs the main parallel test suite.
- `pnpm test:fast` runs unit tests with `vitest.unit.config.ts`.
- `pnpm test:channels`, `pnpm test:gateway`, `pnpm test:extensions`, and `pnpm test:e2e` target specific layers.
- `pnpm lint` runs fast oxlint checks; `pnpm check` runs the full validation pipeline.

## Coding Style & Naming Conventions

Write TypeScript with 2-space indentation and keep imports compatible with NodeNext; this repo uses explicit `.ts` import extensions. Prefer small, typed modules and factory-style helpers such as `createHealthMonitor()`. Use `camelCase` for variables/functions, `PascalCase` for types/classes, and descriptive file names like `model-selection.ts` or `career-tools.test.ts`. Format with `pnpm format:fix`; lint with `pnpm lint` or `pnpm check`.

## Testing Guidelines

Vitest is the primary test framework. Keep tests next to the code they cover and name them `*.test.ts`. Use the narrowest config that matches your change: unit, gateway, channels, extensions, or E2E. Run `vitest run --config vitest.unit.config.ts src/path/to/file.test.ts` for a single file. Add or update tests whenever behavior, routing, or plugin contracts change.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commits such as `fix: ...`, `test: ...`, `chore: ...`, and scoped forms like `fix(telegram): ...`. Keep commit subjects imperative and concise. PRs should explain the user-visible impact, list validation performed, link related issues, and include screenshots only for UI changes.

## Security & Architecture Notes

Respect the custom boundary lints in `pnpm check`, especially around channel abstractions and plugin SDK imports. For new features, keep gateway logic in `src/gateway/`, MCP tools in `src/mcp/tools/`, and channel-specific behavior inside the appropriate extension package.

## Module map (where to change what)

- **Commands:** `src/commands/` (implementations); `src/cli/program/` (registry, subCLIs). Add or wire commands via the command registry.
- **Memory:** `src/memory/` — tiered store (`tiered/`), search manager, chunking, graph. Public API in `index.ts`.
- **MCP:** `src/mcp/` — `serve/` for server/transport; `tools/` for tool handlers (send_message, channel_status, list_sessions, query_session, manage_config, cron_manage, health_dashboard, agent_manage, memory_query, failover_status, career). Add tools in `tools/` and register in `tools/index.ts`.
- **Testing topology:** `pnpm test:fast` = unit (narrow core); `pnpm test:gateway` = gateway; `pnpm test:channels` = channel extensions; `pnpm test:extensions` = other extensions; `pnpm test:e2e` = e2e; `pnpm test:live` = live (real creds). Default `pnpm test` runs unit only; see `docs/help/testing.md` for full topology.
- **Control UI:** `ui/` (Lit 3, Vite 8). Use legacy decorators (`@state()`, `@property()`); see CONTRIBUTING.md.
- **Extensions:** `extensions/*` — channel adapters (telegram, discord, slack, etc.) and other integrations. Test channel extensions with `pnpm test:channels`, others with `pnpm test:extensions`.

## Learned User Preferences

- Verify each finding against the current code first; apply changes only when the finding is confirmed.

## Learned Workspace Facts

- Use pnpm for install, build, and test; npm can fail (e.g. "Cannot read properties of null (reading 'matches')") in pnpm-managed monorepos.
