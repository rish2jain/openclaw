# Full App Enhancement Suite Design

**Date:** 2026-03-12
**Scope:** Entire OpenClaw application — stability, observability, extensibility

## Overview

Three complementary enhancement tracks applied across the full application:

- **Track A** — Stability & Integration: wire existing subsystems, add persistence, fix validation
- **Track B** — Observability & Reliability: metrics export, tracing, circuit breakers, retries
- **Track C** — Extensibility & DX: dynamic capabilities, shared abstractions, new tools

## Track A: Stability & Integration

### A1. Channel Orchestrator

**New file:** `src/channels/orchestrator.ts`

Thin coordinator wiring health monitor, failover router, context bridge, message adapter, identity linker, and thread registry into the actual message send/receive path.

**Inbound flow:**

1. `MessageAdapter.adapt()` — normalize formatting for agent
2. `ThreadRegistry.register()` — track conversation thread
3. `IdentityLinker.resolve()` — resolve cross-channel identity
4. Forward to agent runtime

**Outbound flow:**

1. `FailoverRouter.evaluate()` — check channel health, decide target
2. If failover: `ContextBridge.bridge()` + `FailoverNotifier.notify()`
3. `MessageAdapter.adapt(targetChannel)` — format for target
4. Channel driver send
5. `HealthMonitor.recordDelivery()` — track success/failure/latency

No business logic in orchestrator — just sequencing calls to existing subsystems.

### A2. SQLite Persistence for Channel State

**New file:** `src/channels/persistence/channel-state-store.ts`

Reuses existing SQLite infrastructure from tiered memory.

**Tables:**

- `identity_groups` — group ID, primary name, link method, timestamps
- `identity_links` — channel, user ID, group ID, display name, username, e164
- `threads` — canonical ID, label, session key, timestamps
- `thread_references` — canonical ID, channel, account ID, thread ID, peer ID
- `failover_state` — user key, account ID, source channel, target channel, started at
- `bridge_messages` — thread canonical ID, role, content, timestamp, source channel

**Pattern:** Write-through cache (in-memory Map for hot path, SQLite for durability). Lazy load on first access. Schema versioning via `schema_version` table.

### A3. MCP Tool Validation Fixes

**Modified files:** all `src/mcp/serve/tools/*.ts` + new `src/mcp/serve/tools/arg-utils.ts`

**Shared arg utilities:**

```typescript
parseStringArg(args, key, required?): string | undefined
parseNumberArg(args, key, opts?: { min?, max?, default? }): number | undefined
parseBooleanArg(args, key): boolean | undefined
parseEnumArg<T>(args, key, values: T[]): T | undefined
```

**Per-tool fixes:**

- `manage_config`: Add type coercion (string "true"→boolean, "42"→number) matching docs
- `channel_status`: Return unfiltered result on no filter match (not empty `{}`)
- `query_session`: Bounds check limit (1-200)
- `cron_manage`: Validate cron schedule format before gateway call
- `send_message`: Validate channel param against known channels if provided

### A4. Config Schema Cleanup

**Modified file:** `src/config/zod-schema.ts`

- Deprecate `browser.ssrfPolicy.allowPrivateNetwork` → use `dangerouslyAllowPrivateNetwork`
- Deprecate `browser.ssrfPolicy.allowedHostnames` → use `hostnameAllowlist`
- Add `_readonly` metadata to fields that shouldn't change post-start: `gateway.mode`, `gateway.port`, `gateway.bind`
- On `config.set`/`config.patch`: warn (not block) if readonly fields modified

## Track B: Observability & Reliability

### B1. Structured Health Event Logging

**Modified files:** `src/channels/health/health-monitor.ts`, `src/channels/failover/failover-router.ts`

Add structured log entries for:

- Health level transitions (channel, from→to level, metrics snapshot)
- Failover decisions (user, source→target channel, reason, identity method)
- Failback events (user, channel, duration on backup)
- Delivery failures with error categorization (timeout, auth, rate_limit, network, unknown)

Uses existing `createSubsystemLogger()` with JSON-serializable payloads.

### B2. Metrics Export Interface

**New file:** `src/infra/metrics-export.ts`

Lightweight metrics collector that aggregates from health monitor, failover router, and delivery pipeline. Exposes via:

- `getMetricsSnapshot()` — JSON object for MCP tool / CLI consumption
- `getPrometheusText()` — Prometheus exposition format for scraping

**Metrics:**

- `openclaw_channel_health_level` (gauge, labels: channel, account)
- `openclaw_channel_delivery_total` (counter, labels: channel, status)
- `openclaw_channel_delivery_latency_ms` (histogram, labels: channel)
- `openclaw_failover_total` (counter, labels: source, target, reason)
- `openclaw_failover_duration_seconds` (histogram, labels: source, target)
- `openclaw_memory_entries_total` (gauge, labels: tier)
- `openclaw_agent_requests_total` (counter, labels: agent, model)

### B3. Circuit Breaker for Channel Delivery

**New file:** `src/channels/reliability/circuit-breaker.ts`

Per-channel circuit breaker with three states:

- **Closed** (normal) → opens after N consecutive failures (default 5)
- **Open** (blocking) → rejects sends immediately, tries half-open after cooldown
- **Half-Open** (probing) → allows one test send, closes on success, reopens on failure

Cooldown uses exponential backoff: 10s → 20s → 40s → ... → max 5 minutes.

Integrates with health monitor (circuit breaker state feeds health level evaluation).

### B4. Delivery Retry with Backoff

**New file:** `src/channels/reliability/delivery-retry.ts`

Retry logic for transient delivery failures:

- Max 3 attempts per message
- Backoff: 1s → 3s → 9s
- Retry on: timeout, network error, rate_limit (with Retry-After header respect)
- No retry on: auth error, permission denied, invalid content
- Feeds results to health monitor

### B5. Failover SLA Tracking

**Modified file:** `src/channels/failover/failover-router.ts`

Track per-failover:

- Duration on backup channel
- Number of messages routed via backup
- Failback success/failure
- Total failovers per user per time window

Expose via metrics export and new MCP tool.

## Track C: Extensibility & Developer Experience

### C1. Dynamic Channel Capability Registration

**Modified file:** `src/channels/adaptation/message-adapter.ts`

Replace hardcoded capability defaults with a registration API:

```typescript
// Channels/plugins register at startup
adapter.registerCapabilities("telegram", { maxMessageLength: 4096, markdown: true, ... })

// Extensions can register too
adapter.registerCapabilities("msteams", { maxMessageLength: 28000, markdown: true, ... })
```

Keep current defaults as fallback for unregistered channels. Add `getRegisteredChannels()` for discovery.

### C2. Per-Plugin Config Schema Validation

**Modified files:** `src/config/zod-schema.ts`, `src/config/validation.ts`

Plugins can register their own config schema:

```typescript
// Plugin registers schema at load time
registerPluginConfigSchema(
  "composio",
  z.object({
    apiKey: SecretInputSchema,
    workspace: z.string().optional(),
  }),
);
```

On `config.set`/`config.patch`, validate `plugins.entries[name].config` against registered schema. Unregistered plugins still accept `Record<string, unknown>`.

### C3. Shared Abstractions

**New files in `src/utils/`:**

- `ring-buffer.ts` — Generic ring buffer (reusable by context bridge, health monitor)
- `time-window.ts` — Time-windowed sample collection with percentile computation
- `key-builder.ts` — Canonical key generation: `buildKey(channel, userId)`, `buildThreadKey(channel, peerId)`
- `multi-index.ts` — Multi-index Map with secondary index support (reusable by thread registry, identity linker)

### C4. New MCP Tools

**New files in `src/mcp/serve/tools/`:**

- `health-dashboard.ts` — Expose channel health metrics, failover state, delivery stats
- `agent-manage.ts` — List/create/delete agents, view agent config
- `memory-query.ts` — Search tiered memory, query entity graph, view memory stats
- `failover-status.ts` — View active failovers, failover history, SLA metrics

Each follows existing tool factory pattern with proper arg validation using new `arg-utils.ts`.

### C5. CLI Validation Consolidation

**New file:** `src/cli/validators.ts`

Shared CLI option validators:

```typescript
validatePort(value: string): number  // 1-65535
validateHost(value: string): string  // IPv4/IPv6/hostname
validateTransport(value: string): "stdio" | "sse"
validateDuration(value: string): number  // ms
```

Replace inline validation in `mcp-cli.ts` and other CLI files.

## Implementation Order

1. **Shared abstractions** (C3) — foundation for everything else
2. **Arg utilities + tool fixes** (A3) — quick wins, unblocks tool work
3. **Persistence layer** (A2) — enables durable state
4. **Health event logging** (B1) — low effort, high value
5. **Circuit breaker + retry** (B3, B4) — reliability foundation
6. **Channel orchestrator** (A1) — wires everything together
7. **Metrics export** (B2) — observability
8. **Dynamic capabilities** (C1) — extensibility
9. **New MCP tools** (C4) — expose new features
10. **Config cleanup** (A4) + plugin schemas (C2) + CLI validators (C5) — polish
11. **Failover SLA** (B5) — depends on orchestrator + metrics

## Testing Strategy

- Unit tests for all new files (colocated `*.test.ts`)
- Integration test for orchestrator (mock channel driver, verify full flow)
- Persistence tests with in-memory SQLite
- Circuit breaker state machine tests
- Retry logic tests with mock failures
- MCP tool tests with validated args

## Files Created/Modified Summary

**New files (15):**

- `src/channels/orchestrator.ts`
- `src/channels/persistence/channel-state-store.ts`
- `src/channels/reliability/circuit-breaker.ts`
- `src/channels/reliability/delivery-retry.ts`
- `src/infra/metrics-export.ts`
- `src/mcp/serve/tools/arg-utils.ts`
- `src/mcp/serve/tools/health-dashboard.ts`
- `src/mcp/serve/tools/agent-manage.ts`
- `src/mcp/serve/tools/memory-query.ts`
- `src/mcp/serve/tools/failover-status.ts`
- `src/cli/validators.ts`
- `src/utils/ring-buffer.ts`
- `src/utils/time-window.ts`
- `src/utils/key-builder.ts`
- `src/utils/multi-index.ts`

**Modified files (12):**

- `src/channels/adaptation/message-adapter.ts`
- `src/channels/health/health-monitor.ts`
- `src/channels/failover/failover-router.ts`
- `src/channels/failover/failover-config.ts`
- `src/channels/continuity/identity-linker.ts`
- `src/channels/continuity/thread-registry.ts`
- `src/config/zod-schema.ts`
- `src/config/validation.ts`
- `src/mcp/serve/tools/index.ts`
- `src/mcp/serve/tools/manage-config.ts`
- `src/mcp/serve/tools/channel-status.ts`
- `src/mcp/serve/tools/query-session.ts`
