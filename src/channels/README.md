# Channels

Multi-channel message orchestration layer providing health monitoring, automatic failover, thread continuity across channels, and reliable delivery with circuit-breaking.

## Key Exports

- `ChannelOrchestrator` — top-level coordinator for all channel lifecycle operations
- Health types: `ChannelHealth`, `HealthStatus`, `HealthReport`
- Failover types: `FailoverRoute`, `FailoverPolicy`, `FailoverNotification`
- Continuity types: `ThreadRegistry`, `IdentityLink`, `ContextBridge`

## Structure

### `health/`

Monitors the operational status of each registered channel.

- `monitor.ts` — polls channels at configurable intervals and records latency/error rates
- `status.ts` — computes an aggregate health status (`healthy`, `degraded`, `down`) per channel
- `reporter.ts` — formats health summaries for logging and control-channel delivery

### `failover/`

Routes traffic away from unhealthy channels.

- `router.ts` — selects an alternate channel based on failover policy when the primary degrades
- `notifier.ts` — sends a delivery-failure or channel-switch notification to the user
- `config.ts` — types and defaults for failover priority lists and thresholds

### `continuity/`

Preserves conversation context when a user switches channels.

- `thread-registry.ts` — maps thread IDs across channels to a canonical conversation ID
- `identity-linker.ts` — links user identities (phone, Discord UID, etc.) across channels
- `context-bridge.ts` — transfers recent message context to a newly active channel

### `adaptation/`

- `message-adapter.ts` — transforms a channel-agnostic message into the format required by a specific channel (markdown, plain text, card blocks, etc.)

### `reliability/`

Delivery guarantees and fault tolerance.

- `circuit-breaker.ts` — opens on repeated failures and half-opens after a backoff period
- `delivery-retry.ts` — retries failed sends with exponential back-off and jitter

### `persistence/`

- `channel-state-store.ts` — persists per-channel state (health history, open circuits, thread mappings) between restarts

### `orchestrator.ts`

Entry point that wires health, failover, continuity, and reliability together into a single `ChannelOrchestrator` instance.

## Usage

```typescript
import { ChannelOrchestrator } from "./channels/orchestrator";

const orchestrator = new ChannelOrchestrator(channels, config);
await orchestrator.start();
await orchestrator.send(message); // routes to best available channel
```
