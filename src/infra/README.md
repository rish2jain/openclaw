# Infra

System observability primitives: in-process metrics collection and multi-format export. Provides counters, gauges, and histograms with JSON and Prometheus text output, backed by a fixed-size ring buffer for recent-sample retention.

## Key Exports

- `MetricsExporter` — collects and exports metrics in JSON or Prometheus format
- `RingBuffer<T>` — generic O(1) circular buffer for bounded sample storage

## Structure

### `metrics-export.ts`

Core metrics collection and export.

Metric types:

- `counter` — monotonically increasing value (e.g., messages sent)
- `gauge` — current point-in-time value (e.g., active sessions)
- `histogram` — distribution of observed values with configurable bucket boundaries

Export formats:

- `toJSON()` — returns a plain object suitable for logging or API responses
- `toPrometheus()` — returns a Prometheus text exposition string for scraping by Prometheus or compatible collectors

### `ring-buffer.ts`

A fixed-capacity circular buffer. When the buffer is full, the oldest entry is overwritten. Provides O(1) push and O(n) snapshot reads. Used internally by histograms and any component that needs a bounded window of recent events.

## Usage

```typescript
import { MetricsExporter } from "./infra/metrics-export";

const metrics = new MetricsExporter();
metrics.increment("messages.sent");
metrics.gauge("sessions.active", 12);
metrics.observe("reply.latency_ms", 340);

// JSON export
const snapshot = metrics.toJSON();

// Prometheus export
const promText = metrics.toPrometheus();
```
