# Logging

Thin structured logging wrapper that scopes log output to a named subsystem. Prefixes every line with `[subsystem]` for easy filtering in terminal output and log aggregators.

## Key Exports

- `createSubsystemLogger(subsystem: string)` — returns a `SubsystemLogger` bound to the given subsystem name
- `SubsystemLogger` — type describing the four-level logger interface

## Structure

Single-module implementation. There are no subfolders.

`SubsystemLogger` exposes four methods mirroring standard log levels:

| Method                 | Level | Typical use                          |
| ---------------------- | ----- | ------------------------------------ |
| `.debug(msg, ...args)` | DEBUG | Verbose diagnostic output            |
| `.info(msg, ...args)`  | INFO  | Normal operational events            |
| `.warn(msg, ...args)`  | WARN  | Recoverable issues or degraded state |
| `.error(msg, ...args)` | ERROR | Failures requiring attention         |

All methods delegate to the corresponding `console` method with `[subsystem]` prepended to the message.

## Usage

```typescript
import { createSubsystemLogger } from "./logging";

const log = createSubsystemLogger("channels");

log.info("channel connected", { id: "discord" });
log.warn("retrying delivery", { attempt: 2 });
log.error("send failed", err);
```

Output:

```
[channels] channel connected { id: 'discord' }
[channels] retrying delivery { attempt: 2 }
[channels] send failed Error: ...
```
