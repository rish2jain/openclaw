# OpenClaw Forks & Community Enhancements Analysis

_Researched: 2026-02-26 | Last updated: 2026-02-26 (all Tier 1 complete) | Base repo: 231k ⭐, 44k forks_

---

## Implementation Status

All planned implementations are complete and merged into `main` (fork: `rish2jain/openclaw`).

### Community Issue PRs

| PR                                                        | Branch                                    | Issue                                    | Status            | Merged     |
| --------------------------------------------------------- | ----------------------------------------- | ---------------------------------------- | ----------------- | ---------- |
| [#27425](https://github.com/openclaw/openclaw/pull/27425) | `fix/gemini-cli-model-catalog-22559`      | #22559 — Gemini 3.1 missing from catalog | ✅ Merged to main | 2026-02-26 |
| [#26728](https://github.com/openclaw/openclaw/pull/26728) | `fix/gateway-bind-tailscale-auto`         | —                                        | ✅ Merged to main | 2026-02-26 |
| [#26729](https://github.com/openclaw/openclaw/pull/26729) | `fix/session-maintenance-enforce-default` | —                                        | ✅ Merged to main | 2026-02-26 |
| [#26732](https://github.com/openclaw/openclaw/pull/26732) | `feat/outbound-rate-limit`                | —                                        | ✅ Merged to main | 2026-02-26 |
| [#27429](https://github.com/openclaw/openclaw/pull/27429) | `feat/dingtalk-channel-26534`             | #26534 — DingTalk channel                | ✅ Merged to main | 2026-02-26 |
| [#27436](https://github.com/openclaw/openclaw/pull/27436) | `feat/rocketchat-channel-7520`            | #7520 — Rocket.Chat integration          | ✅ Merged to main | 2026-02-26 |
| [#27443](https://github.com/openclaw/openclaw/pull/27443) | `feat/rbac-multi-user-permissions`        | #8081 — Multi-user RBAC                  | ✅ Merged to main | 2026-02-26 |
| [#17874](https://github.com/openclaw/openclaw/pull/17874) | `feature/lancedb-custom-embeddings`       | — LanceDB custom embeddings              | ✅ Merged to main | 2026-02-26 |

### Upstream PRs Pulled and Integrated

| Issue                                                    | Status            | Method                         |
| -------------------------------------------------------- | ----------------- | ------------------------------ |
| #6095 — Modular guardrails / prompt injection protection | ✅ Merged to main | Surgical checkout of new files |
| #19298 — Brave LLM Context API (web_search)              | ✅ Merged to main | Cherry-pick of commits         |
| #21530 — Native MCP client support                       | ✅ Merged to main | Surgical checkout of new files |

### Third-Party Forks Integrated

| Fork                           | What was integrated                                                                         | Status            | Committed  |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ----------------- | ---------- |
| `DenchHQ/ironclaw`             | AI SDK engine (Vercel AI SDK v6), engine router, DuckDB workspace seed                      | ✅ Merged to main | 2026-02-26 |
| `ComposioHQ/composio-openclaw` | Composio Tool Router plugin (1000+ integrations), bird/clawdhub/local-places skills         | ✅ Merged to main | 2026-02-26 |
| `sunkencity999/localclaw`      | 3-tier model routing classifier, startup health check, Ollama warmup, model strategy wizard | ✅ Merged to main | 2026-02-26 |

---

## Implementation Details

### #22559 — Gemini 3.1 missing from `google-gemini-cli` catalog

**Files changed:** `src/agents/models-config.providers.ts`, `extensions/google-gemini-cli-auth/index.ts`, `src/commands/google-gemini-model-default.ts`, `src/config/defaults.ts`

- Added `buildGoogleGeminiCliProvider()` with explicit Gemini 3.0 and 3.1 Pro/Flash model catalog
- Integrated into `resolveImplicitProviders()` — catalog is written to `models.json` when a `google-gemini-cli` auth profile exists
- Default model updated to `gemini-3.1-pro-preview` across auth extension, command defaults, and aliases
- Added backward-compat aliases: `gemini-3`, `gemini-3-flash`

### #6095 — Modular guardrails / prompt injection protection

Surgical checkout of new extension directories only (avoided merge conflicts with diverged core files):

- `extensions/command-safety-guard/` — blocks dangerous command patterns before execution
- `extensions/gpt-oss-safeguard/` — OpenAI-based content policy guard
- `extensions/grayswan-cygnal-guardrail/` — GraySwan Security's Cygnal threat model
- `extensions/security-audit/` — post-execution audit logging
- `src/plugins/guardrails-utils.ts` — shared utility functions for all guardrail extensions
- `docs/gateway/guardrails.md` — usage documentation

### #19298 — Brave LLM Context API (`web_search` mode)

Cherry-picked commits into `src/agents/tools/web-search.ts`:

- New `mode: "llm-context"` for Brave Search — returns pre-extracted, relevance-scored web content optimized for LLM context windows
- Config fields: `brave.mode`, `brave.llmContextApiKey`
- Updated `src/config/types.tools.ts`, `src/config/zod-schema.agent-runtime.ts`, `src/config/schema.labels.ts`

### #21530 — Native MCP client support

Surgical checkout of the complete `src/mcp/` module (8 source + 9 test files):

- `src/mcp/client-base.ts`, `client-stdio.ts`, `client-sse.ts` — transport implementations
- `src/mcp/manager.ts` — session lifecycle management
- `src/mcp/tool-bridge.ts`, `resource-bridge.ts` — MCP ↔ openclaw tool/resource adapters
- `docs/mcp.md` — configuration and usage documentation

### #26534 — DingTalk channel extension (`extensions/dingtalk/`)

Full plugin including:

- HMAC-SHA256 webhook signature verification and signing (`src/sign.ts`)
- Outbound messaging via webhook or session webhook reply (`src/send.ts`)
- Inbound messages via registered HTTP webhook path (`src/monitor.ts`)
- DM allowlist policy (`src/policy.ts`), server health probe (`src/probe.ts`)
- Interactive onboarding wizard integrated with `openclaw onboard` (`src/onboarding.ts`)
- Multi-account support with per-account config resolution (`src/accounts.ts`)
- 3 unit test files (accounts, policy, sign)

### #7520 — Rocket.Chat channel extension (`extensions/rocketchat/`)

Full plugin including:

- Dual integration modes: Incoming Webhook (simple) and REST API `chat.postMessage` (full DM support)
- Token verification on inbound outgoing webhooks (`src/monitor.ts`)
- Message chunking for Rocket.Chat's message length limits (`src/send.ts`)
- Server reachability probe via `/api/info` (`src/probe.ts`)
- DM allowlist policy (`src/policy.ts`)
- Interactive onboarding wizard guiding through server URL, mode selection, credentials (`src/onboarding.ts`)
- 3 unit test files (accounts, policy, send)

### #8081 — Multi-user RBAC permission management (`src/rbac/`)

New module with full command routing integration:

**Permission matrix:**

| Permission              | admin | user | guest |
| ----------------------- | ----- | ---- | ----- |
| `ai.chat`               | ✅    | ✅   | ✅    |
| `tools.all`             | ✅    | ✅   | ❌    |
| `config.read.sensitive` | ✅    | ❌   | ❌    |
| `config.write`          | ✅    | ❌   | ❌    |
| `commands.admin`        | ✅    | ❌   | ❌    |

**Config example:**

```yaml
gateway:
  access:
    adminUsers:
      - telegram:12345678
    roles:
      slack:U0123ABCDEF: user
      discord:999888777: guest
    defaultRole: guest
```

**Integration points:**

- `CommandContext.role` — resolved on every incoming message via `resolveUserRoleFromConfig`
- `rejectNonAdminCommand` gate in `command-gates.ts` — blocks admin-only commands for non-admins
- `/config set`/`unset` — admin-only; non-admins get `⛔ requires admin access`
- `/config show` — sensitive paths redacted for non-admins with `*(redacted — admin only)*` annotation
- 24 unit tests, 91 passing in affected test suites

### DenchHQ/ironclaw — AI SDK Engine + DuckDB CRM Workspace

Surgical integration of ironclaw's differentiating modules (all new files, no modification to existing core):

**`src/agents/aisdk/`** — Vercel AI SDK v6 engine:

- `types.ts`: `ProviderMode`, `AiSdkConfig`, `ResolvedModel`, message/tool types
- `provider.ts`: Resolves models by `provider/model-id` format; supports Anthropic, OpenAI, Google, Groq, Mistral, xAI, Amazon Bedrock, Azure, OpenRouter, and OpenAI-compatible endpoints (direct or via Vercel AI Gateway)
- `run.ts`: `runAiSdkAgent()` — streams text with tool calls; converts events to openclaw's `PiAgentEvent` format
- `event-adapter.ts`: Maps AI SDK stream parts to openclaw stream events
- `tools.ts`: Converts openclaw tool definitions to AI SDK `CoreTool` format

**`src/agents/engine-router.ts`** — Routes runs to `aisdk` (default) or `pi-agent` based on `agents.engine` config key.

**`src/agents/workspace-seed.ts`** — Defines pre-built DuckDB schema for CRM tables: `people`, `company`, `deals`, `activities`.

**`src/agents/tools/self-update-tool.ts`** — `self_update` tool; delegates to `update.run` gateway action — safe for non-owner senders.

**`assets/seed/`** — Pre-built `workspace.duckdb` and `schema.sql` for bootstrapping CRM workspaces.

**`skills/`** — Three new agent skills: `dench/` (CRM automation workflows), `food-order/`, `software-engineering/`.

**Dependencies added:** `ai@^6`, all `@ai-sdk/*` providers, `@openrouter/ai-sdk-provider`.

**Config key added:** `agents.engine: "aisdk" | "pi-agent"` in `src/config/types.agents.ts`.

### ComposioHQ/composio-openclaw — Composio Tool Router Plugin

Surgical checkout of `extensions/composio/` from the fork, updated for OpenClaw naming conventions and current `@composio/core@0.5.5` SDK API.

**`extensions/composio/`** — 6 agent tools registered as a plugin:

- `composio_search_tools` — semantic search across 1000+ Composio integrations by use-case description
- `composio_execute_tool` — execute a single tool by slug (e.g. `GMAIL_SEND_EMAIL`)
- `composio_multi_execute` — batch-execute up to 50 tools in parallel
- `composio_manage_connections` — check/create OAuth connections for toolkits; returns auth URL for unconnected toolkits
- `composio_workbench` — run Python code in a remote Jupyter sandbox (for bulk operations or data processing)
- `composio_bash` — run shell commands in the remote sandbox

**CLI extension:** `openclaw composio list|connect|disconnect` commands for managing toolkit connections.

**`before_agent_start` hook:** Injects Composio usage instructions into every agent session system prompt automatically.

**Skills added:** `skills/bird/` (X/Twitter CLI), `skills/clawdhub/` (skill marketplace CLI), `skills/local-places/` (Google Places Python server).

**Config:** `COMPOSIO_API_KEY` env var or `plugins.composio.apiKey` in gateway config.

**SDK API fixes applied:** `client.client.tools.execute` → `client.tools.execute`; `connectedAccounts.list({userId})` → `list({userIds})`; `connectedAccounts.delete({...})` → `delete(id)`.

### sunkencity999/localclaw — 3-Tier Model Routing + Startup Health Check

Surgical checkout of new files from LocalClaw. No merge of its heavily diverged agent-runner (would cause conflicts); instead, isolated integration via existing extension points.

**`src/auto-reply/reply/smart-routing.ts`** — Heuristic message complexity classifier (no LLM call):

- `classifyMessageComplexity(message)` — classifies as `"simple"` / `"moderate"` / `"complex"` using keyword lists and regex patterns
- `resolveSmartRoute(...)` — routes `"simple"` messages to a configurable fast model (e.g. `ollama/llama3.2:1b`)
- `resolveOrchestratorRoute(...)` — routes `"complex"` messages up to a powerful API model
- `resolveOrchestratorFallbacksForRun(...)` — injects cross-tier fallbacks so timeouts escalate automatically

**Wired into `src/auto-reply/reply/get-reply-directives.ts`** — applied after all `/model` directive overrides, so user-set models always win.

**`src/config/types.agent-defaults.ts`** — `AgentRoutingConfig` and `AgentOrchestratorConfig` types added to `AgentDefaultsConfig`.

**`src/gateway/server-health-check.ts`** — startup check for local providers (Ollama, LM Studio, vLLM): server reachability + model availability + context window reporting.

**`src/gateway/ollama-warmup.ts`** — pre-loads the configured Ollama model into memory with `keep_alive=24h`; auto-updates `num_ctx` to ≥ 32768 if default is too small for agent tool schemas.

**`src/wizard/onboarding.model-strategy.ts`** — three-tier strategy presets for onboarding: `balanced`, `local-only`, `all-api`. Includes Ollama auto-install and model pull flows.

**Config example:**

```yaml
agents:
  defaults:
    routing:
      enabled: true
      fastModel: ollama/llama3.2:1b
    orchestrator:
      enabled: true
      model: anthropic/claude-sonnet-4
      strategy: auto
```

### #2317 — SearXNG web_search provider

Added `"searxng"` to `src/agents/tools/web-search.ts` as a first-class search provider alongside Brave, Perplexity, and Grok.

- `SearxngConfig` type with `baseUrl` field
- `runSearxngSearch()` — calls `/search?q=...&format=json` against a self-hosted SearXNG instance
- `resolveSearxngConfig()`, `resolveSearxngBaseUrl()` — config resolution with `SEARXNG_BASE_URL` env fallback
- No API key required (self-hosted); provider is skipped from the missing-key guard
- Cache key includes `baseUrl` + `query` + `count`

**Config example:**

```yaml
tools:
  web:
    search:
      provider: searxng
      searxng:
        baseUrl: http://localhost:8888
```

### #9157 — Workspace token optimization (first-message-only bootstrap injection)

Modified `src/agents/pi-embedded-runner/run/attempt.ts` to skip `resolveBootstrapContextForRun()` on all turns except the first message in a session.

- Detects first message by checking if `params.sessionFile` exists before the call
- On turns 2+, `bootstrapFiles` and `contextFiles` are empty arrays — agent uses cached context from turn 1
- Agent can still call `read_file` to re-check workspace files if needed
- Expected savings: ~93.5% fewer tokens injected over a conversation (~$1.51 per 100-message session at Claude Sonnet pricing)

---

## Executive Summary

OpenClaw (231k stars, 44k forks) has spawned a rich ecosystem. This document identifies the **top forks by stars**, the **most-upvoted community feature requests**, and gives a **decision framework** for which enhancements are worth integrating into your local fork.

---

## Top Forks — What Each Adds

### 1. `jiulingyun/openclaw-cn` — 2,010 ⭐

**Chinese localization + network optimization**

- Feishu (Lark) channel built-in (pre-integration)
- Routing/proxy optimizations for mainland China network conditions
- Auto-synced from upstream
- **Verdict:** Relevant only if you target Chinese users/Feishu. Feishu extension (`extensions/feishu`) already exists in upstream.

---

### 2. `DenchHQ/ironclaw` — 483 ⭐

**AI CRM on top of OpenClaw**

- **DuckDB workspace** — chat with your database via natural language
- **Chrome profile scraping** — reuses your existing browser auth sessions (cookies, LinkedIn login, etc.)
- **Lead enrichment pipeline** — find leads → enrich → send personalized outreach
- **Recharts analytics dashboards** — pipeline funnels, outreach charts rendered inline
- **Cron-based automation** — follow-up sequences, weekly reports
- Published on npm as `ironclaw`, runs on port 3100
- Built on Vercel AI SDK v6 as orchestration layer
- **Verdict: ✅ INTEGRATED.** AI SDK engine module, engine router, DuckDB workspace seed, self-update tool, and CRM skills merged into main. Full Chrome-profile scraping and analytics dashboards remain ironclaw-specific.

---

### 3. `QVerisAI/QVerisBot` — 163 ⭐

**Enterprise-hardened personal AI**

- Mostly upstream with tighter enterprise deployment defaults
- **Verdict:** Not differentiated enough to warrant integration. Monitor for specific patches.

---

### 4. `AtomicBot-ai/atomicbot` — 97 ⭐

**Fast/simplified deployment path**

- Essentially upstream with a simplified onboarding narrative
- **Verdict:** No unique code to integrate.

---

### 5. `sunkencity999/localclaw` — 68 ⭐

**Local-first assistant with 3-tier smart model routing**

Key innovations:

- **Three-tier model classifier** — keyword/pattern heuristic routes each message to the right tier:

  | Tier                | Models               | Examples                       | Tools? |
  | ------------------- | -------------------- | ------------------------------ | ------ |
  | Fast (tiny 3B)      | `llama3.2`           | "hi", "thanks"                 | No     |
  | Local (primary 30B) | `glm-4.7-flash-fast` | "check my email", "list files" | Yes    |
  | API (orchestrator)  | `gpt-5.2-codex`      | "fix the auth bug", "build X"  | Yes    |

- **Per-message routing, not sticky** — resets after each message
- **Startup health check** — validates model server, checks context window, warns on misconfiguration
- **TUI status bar** showing all three active model tiers
- **Model strategy presets** — Balanced / Local-only / All-API (Enterprise)
- **LCARS-inspired UI** (Star Trek computer display aesthetic)
- **Isolated state** at `~/.localclaw/` — coexists with main openclaw install
- **Verdict: ✅ INTEGRATED.** 3-tier routing classifier, startup health check, Ollama warmup, and model strategy wizard all ported. See implementation details above.

---

### 6. `CrayBotAGI/OpenCray` — 66 ⭐

**Chinese ecosystem integration**

- DingTalk, QQ, WeChat channels
- Chinese LLM integrations (Qwen, Baidu, etc.)
- **Verdict:** DingTalk channel now implemented (PR #27429, merged). QQ/WeChat remain out of scope.

---

### 7. `OpenBMB/EdgeClaw` — 59 ⭐ (Tsinghua THUNLP + Renmin University)

**Edge-Cloud Collaborative AI with Privacy Guardrails**

This is the most academically sophisticated fork. Key innovation:

- **GuardAgent Protocol** — `Hooker → Detector → Action` pipeline for every tool call
- **Three-tier security model:**
  - **S1 (Passthrough)** — public data, goes to cloud model as-is
  - **S2 (Desensitization)** — PII/sensitive data is redacted before cloud, restored after
  - **S3 (Local-only)** — strictly private data, processed only by local model (MiniCPM4.1)
- **Intelligent edge-cloud routing** — "public data to the cloud, private data stays local"
- Implemented as `extensions/guardclaw` plugin
- Uses `ollama/openbmb/minicpm4.1` as the local guard model
- **No business logic changes required** — transparent to the main agent runtime
- Demo video: <https://youtu.be/xggfxybLVHw>

- **Verdict: HIGH VALUE for privacy-sensitive users.** The GuardAgent extension is a drop-in plugin. The S1/S2/S3 framework is elegant. The upstream guardrails PR (#6095) has been integrated into main — EdgeClaw's deeper privacy-tier routing remains a future integration candidate.

---

### 8. `friuns2/openclaw-android-assistant` — 23 ⭐

**OpenClaw + Codex CLI native Android APK**

- Self-contained APK with embedded Linux environment (no root, no Termux)
- Bundles both OpenClaw and OpenAI Codex CLI
- Shared OAuth between both agents
- Background foreground service
- Multi-thread sessions with independent working directories
- **Verdict:** Mobile-specific, not applicable to server/desktop fork unless you're building an Android version.

---

### 9. `jomafilms/openclaw-multitenant` — 16 ⭐

**Multi-tenant platform layer**

- Container-level isolation per tenant
- Encrypted vaults
- Team sharing features
- **Verdict:** RBAC layer now implemented (PR #27443, merged). Container-level isolation remains future work if needed.

---

### 10. `Crittora/openclaw` — 12 ⭐

**Cryptographic boot-time policy verification**

- Boot-time verification gate using `tools.crittora` policy artifact
- Fail-closed startup — if verification fails, nothing starts
- Replaces mutable config trust with cryptographically signed policy
- Reduces ambient authority, makes startup auditable and tamper-evident
- Docker-based deployment
- **Verdict:** MEDIUM VALUE for security-critical deployments. Overkill for personal use, valuable for team/production deployments.

---

### 11. `ComposioHQ/composio-openclaw` — 6 ⭐

**Composio Tool Router plugin**

- `extensions/composio` — Composio-managed OAuth for 1000+ external tools
- Supports Gmail, GitHub, Slack, Notion, Linear, Jira, HubSpot, Google Drive, and more
- Remote Python workbench + bash sandbox for bulk operations
- `openclaw composio list|connect|disconnect` CLI commands
- **Verdict: ✅ INTEGRATED.** Full plugin merged into main. Configure with `COMPOSIO_API_KEY`.

---

## Most-Upvoted Community Feature Requests

From the upstream GitHub issues (sorted by 👍):

| 👍  | Issue  | Title                               | Status                                                                 |
| --- | ------ | ----------------------------------- | ---------------------------------------------------------------------- |
| 55  | #75    | Linux/Windows Desktop Apps          | Open — no PR                                                           |
| 48  | #5799  | Stabilisation Mode                  | Open — no PR                                                           |
| 37  | #6095  | Modular guardrails extensions       | ✅ **Integrated** — surgical checkout from PR #6095                    |
| 28  | #14992 | Brave Search LLM Context API        | Open — no PR (separate from #19298)                                    |
| 21  | #19298 | Brave LLM Context API mode          | ✅ **Integrated** — cherry-picked from PR #19298                       |
| 16  | #4686  | WhatsApp relink bug                 | Open — no PR                                                           |
| 14  | #22559 | Antigravity Gemini 3 missing        | ✅ **Implemented** — PR #27425, merged                                 |
| 12  | #8081  | Multi-user RBAC                     | ✅ **Implemented** — PR #27443, merged                                 |
| 12  | #7520  | Rocket.Chat integration             | ✅ **Implemented** — PR #27436, merged                                 |
| 12  | #7309  | DeepSeek API first-class            | Open — no PR                                                           |
| 12  | #2317  | SearXNG search provider             | ✅ **Integrated** — added as `provider: "searxng"` option              |
| 10  | #21290 | OpenTelemetry diagnostics           | `extensions/diagnostics-otel` exists in upstream                       |
| 10  | #11399 | Extensible web_search via plugins   | Open — no PR                                                           |
| 9   | #9157  | Workspace token waste (93.5%)       | ✅ **Integrated** — first-message-only injection in pi-embedded-runner |
| 9   | #6872  | xAI (Grok) native tools             | Open — no PR                                                           |
| 9   | #12082 | Plugin lifecycle interception hooks | Open — no PR                                                           |
| 6   | #21530 | Native MCP client support           | ✅ **Integrated** — surgical checkout from PR #21530                   |
| 6   | #26534 | DingTalk channel                    | ✅ **Implemented** — PR #27429, merged                                 |

---

## Decision Framework: What to Integrate

### Tier 1 — Integrate Now (High impact, low risk)

| Enhancement                      | Source       | Effort     | Benefit                                              | Status                          |
| -------------------------------- | ------------ | ---------- | ---------------------------------------------------- | ------------------------------- |
| **Gemini 3.1 model catalog**     | Issue #22559 | Low        | Gemini 3.1 Pro/Flash visible under google-gemini-cli | ✅ Done (PR #27425)             |
| **DingTalk channel**             | Issue #26534 | Medium     | Chinese enterprise messaging                         | ✅ Done (PR #27429)             |
| **Rocket.Chat channel**          | Issue #7520  | Medium     | Self-hosted team chat                                | ✅ Done (PR #27436)             |
| **Multi-user RBAC**              | Issue #8081  | Medium     | Admin/user/guest roles, config redaction             | ✅ Done (PR #27443)             |
| **Modular guardrails**           | Issue #6095  | Medium     | Prompt injection protection, agentic threat guard    | ✅ Done (surgical checkout)     |
| **Brave LLM Context API**        | Issue #19298 | Low        | Pre-extracted web content for LLM context windows    | ✅ Done (cherry-pick)           |
| **Native MCP client**            | Issue #21530 | Medium     | Model Context Protocol agent-model comms             | ✅ Done (surgical checkout)     |
| **AI SDK engine (Vercel)**       | ironclaw     | Medium     | Vercel AI SDK v6 as drop-in LLM backend              | ✅ Done (DenchHQ/ironclaw)      |
| **Composio Tool Router**         | composio     | Medium     | 1000+ managed service OAuth in 6 tools               | ✅ Done (ComposioHQ fork)       |
| **3-tier smart model routing**   | LocalClaw    | Medium     | Major cost reduction, sub-second simple replies      | ✅ Done (LocalClaw port)        |
| **Startup health check**         | LocalClaw    | Low        | Better DX, no silent failures                        | ✅ Done (LocalClaw port)        |
| **SearXNG search provider**      | Issue #2317  | Low-Medium | Privacy-respecting search, very requested            | ✅ Done (`provider: "searxng"`) |
| **Workspace token optimization** | Issue #9157  | Medium     | 93.5% waste elimination                              | ✅ Done (first-message-only)    |

### Tier 2 — Integrate If Relevant to Your Use Case

| Enhancement                             | Source               | Effort | Benefit                    | When                              |
| --------------------------------------- | -------------------- | ------ | -------------------------- | --------------------------------- |
| **GuardAgent privacy tiers (S1/S2/S3)** | EdgeClaw             | High   | Fine-grained data routing  | Privacy-critical deployments      |
| **Multi-tenant container isolation**    | openclaw-multitenant | High   | Team/SaaS deployment       | Beyond RBAC — container isolation |
| **DeepSeek first-class support**        | Issue #7309          | Low    | Cost-efficient alternative | Budget-conscious                  |
| **xAI/Grok native tools**               | Issue #6872          | Medium | x_search, code_exec        | xAI users                         |
| **Plugin lifecycle interception**       | Issue #12082         | Medium | Pre/post-tool hook control | Plugin authors                    |

### Tier 3 — Monitor, Don't Integrate Yet

| Enhancement                | Source       | Reason to Wait                                    |
| -------------------------- | ------------ | ------------------------------------------------- |
| Linux/Windows desktop app  | Issue #75    | Massive scope (Electron/Tauri), upstream tracking |
| Crittora boot verification | Crittora     | Docker-only, complex ops overhead                 |
| OpenTelemetry diagnostics  | Issue #21290 | `extensions/diagnostics-otel` exists in upstream  |

### Skip

| Enhancement                             | Reason                                           |
| --------------------------------------- | ------------------------------------------------ |
| Chinese ecosystem channels (QQ, WeChat) | Out of scope unless targeting China              |
| Android APK packaging                   | Platform-specific, not applicable to server fork |

---

## Top Integration Recommendation

**Completed (all sessions):** All 13 Tier 1 features are merged into `main` (fork: `rish2jain/openclaw`), plus 4 bonus fixes:

| Category              | Items                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| Community issue PRs   | #22559, #26534, #7520, #8081                                                   |
| Bonus fixes/additions | gateway-bind tailscale auto, session-maintenance, outbound rate-limit, LanceDB |
| Upstream PRs          | #6095 (guardrails), #19298 (Brave LLM Context), #21530 (Native MCP)            |
| Fork integrations     | ironclaw (AI SDK engine), Composio (Tool Router), LocalClaw (routing + health) |
| Issue-driven features | #2317 (SearXNG), #9157 (workspace token optimization)                          |

**Tier 1 is fully complete. Recommended next targets (Tier 2):**

1. **GuardAgent S1/S2/S3 privacy tiers** (EdgeClaw) — the most architecturally novel feature in the ecosystem. Routes sensitive data only to on-prem local models; zero visible change for public-only deployments. High effort, very high value for privacy-sensitive or regulated environments.
2. **DeepSeek first-class support** (#7309) — low effort, cost-efficient alternative for budget-conscious deployments.
3. **Crittora boot-time policy verification** — cryptographically signed policy gate; valuable for team/enterprise production deployments.
4. **Plugin lifecycle interception** (#12082) — pre/post-tool hooks for plugin authors, opens up a new class of audit/compliance integrations.

---

## Sources

- GitHub forks API: `repos/openclaw/openclaw/forks?sort=stargazers`
- GitHub issues API: `repos/openclaw/openclaw/issues?sort=reactions`
- Fork READMEs: DenchHQ/ironclaw, sunkencity999/localclaw, OpenBMB/EdgeClaw, jomafilms/openclaw-multitenant, friuns2/openclaw-android-assistant, Crittora/openclaw, ComposioHQ/composio-openclaw
