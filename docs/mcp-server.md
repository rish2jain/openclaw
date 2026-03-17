# MCP Server

OpenClaw exposes its capabilities as an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server, allowing AI assistants like Claude to control the gateway, manage career intelligence, and access channel/session data.

## Starting the Server

```bash
# stdio transport (for editor integrations like VS Code, Cursor, Claude Desktop)
openclaw mcp serve

# SSE transport (for web/remote clients)
openclaw mcp serve --transport sse --port 18790 --host 127.0.0.1
```

**Options:**
| Flag | Default | Description |
|------|---------|-------------|
| `--transport` | `stdio` | `stdio` for editor integration, `sse` for HTTP clients |
| `--port` | `18790` | SSE server port |
| `--host` | `127.0.0.1` | SSE bind address |
| `--url` | (from config) | Gateway WebSocket URL |
| `--token` | — | Gateway auth token |
| `--password` | — | Gateway password |
| `-v, --verbose` | `false` | Verbose logging to stderr |

## Transports

### stdio

Reads newline-delimited JSON-RPC 2.0 from stdin, writes responses to stdout. Use this for local editor integrations.

### SSE (Server-Sent Events)

HTTP server with SSE for server-to-client messages and POST for client-to-server messages. Use this for web dashboards or remote clients.

## Tools

The MCP server exposes two categories of tools:

### Gateway Management Tools

These proxy to the OpenClaw gateway via RPC and require a running gateway:

| Tool               | Description                              |
| ------------------ | ---------------------------------------- |
| `send_message`     | Send a message via any connected channel |
| `channel_status`   | Get connected channel status             |
| `list_sessions`    | List active agent sessions               |
| `query_session`    | Query conversation history for a session |
| `manage_config`    | Read/write gateway configuration         |
| `cron_manage`      | Schedule and manage cron tasks           |
| `health_dashboard` | Channel health metrics dashboard         |
| `agent_manage`     | Manage agent lifecycle                   |
| `memory_query`     | Query agent memory                       |
| `failover_status`  | Current failover state and decisions     |

### Career Intelligence Tools

These operate on local career data (`~/.openclaw/career/`) and do not require a gateway:

| Tool                      | Description                     |
| ------------------------- | ------------------------------- |
| `career_profile_read`     | Read profile sections           |
| `career_profile_update`   | Update a profile field          |
| `career_preferences_set`  | Set search preferences          |
| `career_job_search`       | Search and score job listings   |
| `career_job_review`       | Review a specific listing       |
| `career_pipeline_summary` | Application pipeline statistics |
| `career_network_import`   | Import LinkedIn connections     |
| `career_intro_find`       | Find warm introduction paths    |
| `career_outreach_draft`   | Generate outreach messages      |
| `career_outreach_track`   | Track outreach pipeline         |

See [Career Tools Reference](career/tools-reference.md) for full parameter documentation.

## Resources

The server exposes dynamic resources via URI templates:

| URI Pattern                         | Description                              |
| ----------------------------------- | ---------------------------------------- |
| `openclaw://channels/{channelName}` | Channel configuration and runtime status |
| `openclaw://sessions/{sessionKey}`  | Session conversation history             |

## Editor Integration

### Claude Desktop

Add to your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"]
    }
  }
}
```

### VS Code / Cursor

Add to your MCP settings:

```json
{
  "openclaw": {
    "command": "openclaw",
    "args": ["mcp", "serve"],
    "transport": "stdio"
  }
}
```
