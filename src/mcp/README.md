# MCP Server

Exposes OpenClaw capabilities to external AI assistants and developer tooling via the Model Context Protocol (spec version 2024-11-05). Supports both stdio and SSE transports.

## Key Exports

- `serveMcp()` — starts the MCP server on the configured transport
- `McpToolHandler` — interface for implementing a single MCP tool
- MCP spec types: `McpTool`, `McpResource`, `McpRequest`, `McpResponse`, `McpError`

## Structure

### `types.ts`

TypeScript types aligned with the MCP 2024-11-05 specification: tool definitions, resource descriptors, request/response envelopes, and error codes.

### `protocol.ts`

Transport implementation.

- stdio transport — reads JSON-RPC from stdin, writes to stdout; used by Claude Desktop and most CLI hosts
- SSE transport — HTTP server-sent events for browser-based and remote hosts

### `server.ts`

Server lifecycle management: capability negotiation, tool and resource registration, request dispatch, and graceful shutdown.

### `resources.ts`

Exposes read-only resources to MCP clients.

- `channel://` — lists active channels and their health status
- `session://` — exposes current session metadata and recent message summaries

### `tools/`

Individual tool handler modules. Each file exports one `McpToolHandler` implementation.

Currently registered tools include handlers for:

- Sending messages across channels
- Querying session history
- Managing agent configuration
- Triggering cron jobs
- Reading and writing config values
- Channel health queries
- File and memory operations
- Exec approval management

13 or more handlers are registered at server startup via `server.ts`.

## Usage

```typescript
import { serveMcp } from "./mcp/server";

// Start on stdio (default for Claude Desktop integration)
await serveMcp({ transport: "stdio" });

// Start on SSE for remote access
await serveMcp({ transport: "sse", port: 3100 });
```
