# Channel Reliability

The channel reliability layer ensures messages reach users even when individual channels fail. It coordinates health monitoring, automatic failover, cross-channel continuity, and message format adaptation.

## Architecture

The channel orchestrator (`src/channels/orchestrator.ts`) wires all subsystems into a unified inbound/outbound message flow:

```
Inbound message → Health check → Thread registry → Identity linking → Deliver
Outbound message → Health check → Failover decision → Adaptation → Deliver
                                      ↓ (if unhealthy)
                              Context bridge → Fallback channel → Adaptation → Deliver
```

## Health Monitoring

**Source:** `src/channels/health/`

Each channel account is continuously evaluated and assigned a health level:

| Level       | Meaning                 | Triggers                                |
| ----------- | ----------------------- | --------------------------------------- |
| `healthy`   | Operating normally      | Low error rate, low latency, connected  |
| `degraded`  | Functional but impaired | Elevated latency or intermittent errors |
| `unhealthy` | Failing frequently      | High error rate or consecutive failures |
| `offline`   | Not connected           | Disconnected or unreachable             |

**Tracked metrics per channel:**

- Average and p95 delivery latency (ms)
- Error rate (0-1) over a rolling sample window
- Consecutive health check failures
- Uptime percentage (rolling window)
- Connection status

Health level transitions emit `channel-health-change` events consumed by the failover router.

## Failover Routing

**Source:** `src/channels/failover/`

When a channel's health drops below threshold, the failover router redirects messages to the next available channel.

**Default fallback order:** Telegram, Discord, Slack, WhatsApp, Signal, iMessage

**Grace periods prevent thrashing:**

- Failover grace: channel must be unhealthy for 60 seconds before triggering failover
- Failback grace: channel must be healthy for 5 minutes before failing back

**Per-user preferences:**

- Override the default fallback order
- Enable/disable automatic failover
- Enable/disable failover notifications
- Enable/disable automatic failback when primary recovers

## Circuit Breaker

**Source:** `src/channels/reliability/circuit-breaker.ts`

Per-channel circuit breaker prevents hammering a failing channel.

**States:**

- **Closed** (normal) — requests pass through
- **Open** (blocking) — requests rejected immediately
- **Half-open** (probing) — one test request allowed

**Transitions:**

- Closed -> Open: after 5 consecutive failures (configurable)
- Open -> Half-open: after cooldown period (default 10 seconds)
- Half-open -> Closed: successful probe
- Half-open -> Open: failed probe (cooldown doubles, up to 5 minutes max)

## Delivery Retry

**Source:** `src/channels/reliability/delivery-retry.ts`

Transient delivery failures are retried with exponential backoff.

**Retried errors:** timeout, network error, rate limit
**Not retried:** auth error, permission denied, invalid content

**Defaults:** 3 attempts, 1 second base delay, 3x backoff multiplier

## Cross-Channel Continuity

**Source:** `src/channels/continuity/`

Three subsystems maintain conversation context across channel switches:

### Thread Registry

Maps conversations across channels. When a user's message arrives on a new channel after failover, the registry links it to the existing conversation thread.

### Identity Linker

Tracks a user's identity across channels (e.g., the same person on Telegram and Discord). Identity groups link multiple channel-specific identities together.

### Context Bridge

Transfers conversation state when messages are rerouted. Includes a summary of recent context so the user doesn't lose continuity.

## Message Adaptation

**Source:** `src/channels/adaptation/message-adapter.ts`

Each channel has different formatting capabilities. The adapter transforms messages to fit the target channel.

**Per-channel capabilities tracked:**

- Message length limit (e.g., Telegram 4096 chars)
- Format support: Markdown, HTML, code blocks
- Media: inline images, file attachments, supported MIME types
- Interactivity: buttons (with max count), reactions, threaded replies

**Adaptation operations:**

- Chunking long messages to fit length limits
- Stripping unsupported formatting (e.g., buttons on channels without button support)
- Converting between Markdown and HTML as needed
- Filtering unsupported media types

## Persistence

**Source:** `src/channels/persistence/channel-state-store.ts`

Currently in-memory only. Stores identity groups, thread registry state, failover state, and context bridge messages. State does not survive process restarts. SQLite-backed persistence is planned.

## Observability

The metrics exporter (`src/infra/metrics-export.ts`) tracks channel reliability:

| Metric                        | Type      | Description                       |
| ----------------------------- | --------- | --------------------------------- |
| `channel_health_level`        | gauge     | Current health level per channel  |
| `channel_delivery_total`      | counter   | Total delivery attempts           |
| `channel_delivery_latency_ms` | histogram | Delivery latency with p50/p95/p99 |
| `failover_total`              | counter   | Number of failover events         |
| `circuit_breaker_state`       | gauge     | Circuit breaker state per channel |
