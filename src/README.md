# src/ — Module Architecture

This document describes the module structure under `src/` for developers working in the codebase. Each section covers the module's responsibility, its internal layout, and the key types or entry points worth knowing.

---

## career/

Career intelligence platform. Approximately 40 files across six domain submodules and one shared persistence entry point.

**`persistence.ts`** — Singleton lazy-loaded context. Aggregates and persists all career state to `~/.openclaw/career/`. Import this to access the shared `CareerContext` rather than instantiating submodule stores directly.

### career/profile/

User profile management and enrichment.

| File                      | Responsibility                                   |
| ------------------------- | ------------------------------------------------ |
| `store.ts`                | CRUD store for the canonical user profile        |
| `enricher.ts`             | Fills gaps in the profile from external signals  |
| `ingest-github.ts`        | Pulls repos, languages, and activity from GitHub |
| `ingest-linkedin.ts`      | Parses LinkedIn export data                      |
| `ingest-resume.ts`        | Extracts structured data from resume text        |
| `infer-skill-category.ts` | Maps raw skill strings to canonical categories   |
| `types.ts`                | Shared profile types                             |

### career/jobs/

Job listing ingestion, scoring, and deduplication.

| File                      | Responsibility                                                             |
| ------------------------- | -------------------------------------------------------------------------- |
| `store.ts`                | Persistent store for job listings                                          |
| `scorer.ts`               | 4-factor weighted relevance scorer (role fit, seniority, location, skills) |
| `dedup.ts`                | Fingerprint-based deduplication across scrapers                            |
| `scraper.ts`              | Scraper orchestrator and result normalizer                                 |
| `scrapers/hn.ts`          | Hacker News "Who's Hiring" scraper                                         |
| `scrapers/linkedin.ts`    | LinkedIn job search scraper                                                |
| `scrapers/career-page.ts` | Generic company career page scraper                                        |
| `types.ts`                | Shared job listing types                                                   |

### career/network/

Professional network graph and relationship pathfinding.

| File            | Responsibility                              |
| --------------- | ------------------------------------------- |
| `tracker.ts`    | Network graph of persons and weighted edges |
| `scorer.ts`     | Connection strength scoring                 |
| `pathfinder.ts` | BFS path search up to 3 hops                |
| `importer.ts`   | Bulk import of contacts                     |
| `audit.ts`      | Graph integrity auditing                    |
| `types.ts`      | Shared network types                        |

### career/outreach/

Outreach message generation and follow-up scheduling.

| File               | Responsibility                          |
| ------------------ | --------------------------------------- |
| `pipeline.ts`      | End-to-end outreach orchestration       |
| `generator.ts`     | Personalized message generation         |
| `style-learner.ts` | Learns writing style from past messages |
| `followup.ts`      | Follow-up scheduling and tracking       |
| `types.ts`         | Shared outreach types                   |

### career/intel/

Company intelligence and hiring signal tracking.

| File                 | Responsibility                                               |
| -------------------- | ------------------------------------------------------------ |
| `company-tracker.ts` | Tracks funding rounds, headcount changes, and hiring signals |
| `types.ts`           | Shared intelligence types                                    |

### career/agent/

Career agent runtime and MCP tool surface.

| File               | Responsibility                                   |
| ------------------ | ------------------------------------------------ |
| `mode.ts`          | Mode manager (discovery vs. execution)           |
| `system-prompt.ts` | System prompt builder for the career agent       |
| `tools.ts`         | MCP tool definitions exposed by the career agent |

---

## channels/

Multi-channel message orchestration. Approximately 20 files across six submodules and a central orchestrator.

**`orchestrator.ts`** — Central inbound and outbound message pipeline. Inbound messages arrive from channels and are routed through adaptation, thread tracking, and identity linking before reaching the agent. Outbound messages pass through health checks and failover before delivery.

### channels/health/

Channel health monitoring with four levels: `healthy`, `degraded`, `unhealthy`, `offline`.

| File                 | Responsibility                             |
| -------------------- | ------------------------------------------ |
| `health-monitor.ts`  | Probes channels and maintains health state |
| `health-status.ts`   | Health level types and transition logic    |
| `health-reporter.ts` | Formats and emits health reports           |
| `index.ts`           | Public re-exports                          |

### channels/failover/

Automatic failover routing when a channel degrades.

| File                   | Responsibility                              |
| ---------------------- | ------------------------------------------- |
| `failover-router.ts`   | Selects alternative channels on degradation |
| `failover-notifier.ts` | Notifies subscribers of failover events     |
| `failover-config.ts`   | Failover policy configuration               |
| `index.ts`             | Public re-exports                           |

### channels/continuity/

Cross-channel thread and identity continuity.

| File                 | Responsibility                                       |
| -------------------- | ---------------------------------------------------- |
| `thread-registry.ts` | Maps logical threads across channel-specific IDs     |
| `identity-linker.ts` | Links user identities across channels                |
| `context-bridge.ts`  | Carries conversation context across channel switches |
| `index.ts`           | Public re-exports                                    |

### channels/adaptation/

Per-channel message format translation based on declared capabilities.

| File                 | Responsibility                                     |
| -------------------- | -------------------------------------------------- |
| `message-adapter.ts` | Translates messages to/from channel-native formats |
| `index.ts`           | Public re-exports                                  |

### channels/reliability/

Delivery reliability primitives.

| File                 | Responsibility                                         |
| -------------------- | ------------------------------------------------------ |
| `circuit-breaker.ts` | Prevents cascading failures when a channel is unstable |
| `delivery-retry.ts`  | Configurable retry with backoff                        |

### channels/persistence/

| File                     | Responsibility                         |
| ------------------------ | -------------------------------------- |
| `channel-state-store.ts` | Persists channel state across restarts |

---

## mcp/

MCP server implementation following the 2024-11-05 spec.

| File           | Responsibility                                                                  |
| -------------- | ------------------------------------------------------------------------------- |
| `types.ts`     | Full MCP spec types (requests, responses, capabilities)                         |
| `protocol.ts`  | Stdio and SSE transport implementations                                         |
| `server.ts`    | Server lifecycle: `initialize` → `tools/list` → `tools/call` → `resources/read` |
| `resources.ts` | Dynamic channel and session resource providers                                  |

### mcp/tools/

13+ tool handlers exposed over MCP. Tools cover two domains:

- **Gateway management** — `channel-status`, `list-sessions`, `query-session`, `send-message`, `manage-config`, `cron-manage`, `agent-manage`, `failover-status`, `health-dashboard`, `memory-query`
- **Career** — `career` (delegates to career agent tool definitions)

See `tools/index.ts` for the full registry.

---

## infra/

Low-level infrastructure utilities shared across modules.

| File                | Responsibility                                           |
| ------------------- | -------------------------------------------------------- |
| `metrics-export.ts` | Prometheus-compatible metrics: counter, gauge, histogram |
| `ring-buffer.ts`    | Fixed-capacity circular buffer for windowed sampling     |

---

## logging/

| File           | Responsibility                                                 |
| -------------- | -------------------------------------------------------------- |
| `subsystem.ts` | Console-wrapper logger that prefixes output with `[subsystem]` |

Import `createLogger(subsystem)` from this module rather than using `console` directly.

---

## cli/

Shared CLI utilities.

| File            | Responsibility                                     |
| --------------- | -------------------------------------------------- |
| `mcp-cli.ts`    | CLI command registration for the MCP server        |
| `validators.ts` | Reusable input validators for CLI argument parsing |

---

## commands/

Reserved for future command registration. Currently empty.

---

## memory/

Reserved for future memory subsystem. Currently empty.

---

## Key Patterns

**Dependency injection** — Modules accept explicit `Deps` types rather than importing singletons. This keeps units testable and avoids hidden coupling.

**Type-first design** — Each submodule owns a `types.ts` that defines its domain types. Cross-module imports should reference these types directly; avoid duplicating type definitions.

**Singleton lazy-loading** — `career/persistence.ts` is the single entry point for career state. It initializes on first access and caches the result, so callers do not need to manage lifecycle.

**Event-driven health** — The `channels/health/` and `channels/failover/` subsystems emit events on state transitions. Consumers subscribe to these events rather than polling.

**Capability-based adaptation** — Channels declare a set of supported features (e.g., rich text, file attachments, reactions). `MessageAdapter` uses these declarations to translate messages, so the orchestrator does not contain per-channel formatting logic.

---

## Data Flow

```
Inbound
  Channel
    -> Orchestrator
    -> MessageAdapter   (normalize to internal format)
    -> ThreadRegistry   (resolve logical thread)
    -> IdentityLinker   (resolve sender identity)
    -> ContextBridge    (attach prior context)
    -> Agent

Outbound
  Agent
    -> HealthMonitor    (check target channel)
    -> FailoverRouter   (select alternate if degraded)
    -> MessageAdapter   (translate to channel format)
    -> Channel
    -> DeliveryRetry    (retry on transient failure)

MCP
  Client
    -> Protocol         (stdio or SSE transport)
    -> Server           (lifecycle + routing)
    -> Tool Handler
    -> Gateway RPC  OR  CareerContext (via persistence.ts)
```
