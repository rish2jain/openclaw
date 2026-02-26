# OpenClaw Forks & Community Enhancements Analysis

_Researched: 2026-02-26 | Updated: 2026-02-26 | Base repo: 231k ⭐, 44k forks_

---

## Implementation Status

All planned implementations are complete and merged into `main` (fork: `rish2jain/openclaw`).

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

### Skipped (existing PRs already open upstream)

| Issue                                                    | Reason                  |
| -------------------------------------------------------- | ----------------------- |
| #6095 — Modular guardrails / prompt injection protection | Open PR already existed |
| #19298 — Brave LLM Context API (web_search)              | Open PR already existed |
| #21530 — Native MCP client support                       | Open PR already existed |

---

## Implementation Details

### #22559 — Gemini 3.1 missing from `google-gemini-cli` catalog

**Files changed:** `src/agents/models-config.providers.ts`, `extensions/google-gemini-cli-auth/index.ts`, `src/commands/google-gemini-model-default.ts`, `src/config/defaults.ts`

- Added `buildGoogleGeminiCliProvider()` with explicit Gemini 3.0 and 3.1 Pro/Flash model catalog
- Integrated into `resolveImplicitProviders()` — catalog is written to `models.json` when a `google-gemini-cli` auth profile exists
- Default model updated to `gemini-3.1-pro-preview` across auth extension, command defaults, and aliases
- Added backward-compat aliases: `gemini-3`, `gemini-3-flash`

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
- **Verdict: HIGH VALUE if you want structured data + web scraping.** The DuckDB workspace and Chrome-profile browser are genuinely novel. Could be added as a plugin.

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
- **Verdict: HIGH VALUE.** The 3-tier routing classifier is directly applicable to upstream. Smart cost-saving with no UX degradation. The health check is also worth porting.

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

- **Verdict: HIGH VALUE for privacy-sensitive users.** The GuardAgent extension is a drop-in plugin. The S1/S2/S3 framework is elegant. Upvoted issue #6095 (37 👍) has an open upstream PR — monitor for merge.

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

- `extensions/composio` — Composio-managed auth for external tools
- Supports Gmail, GitHub, Slack, Notion, and 250+ other services
- `openclaw composio list` and `openclaw composio connect` CLI commands
- **Verdict:** MEDIUM VALUE if you rely on many external tool integrations. Composio handles OAuth so you don't build it yourself.

---

## Most-Upvoted Community Feature Requests

From the upstream GitHub issues (sorted by 👍):

| 👍  | Issue  | Title                               | Status                                 |
| --- | ------ | ----------------------------------- | -------------------------------------- |
| 55  | #75    | Linux/Windows Desktop Apps          | Open — no PR                           |
| 48  | #5799  | Stabilisation Mode                  | Open — no PR                           |
| 37  | #6095  | Modular guardrails extensions       | Open PR exists upstream                |
| 28  | #14992 | Brave Search LLM Context API        | Open — no PR                           |
| 21  | #19298 | Brave LLM Context API mode          | Open PR exists upstream                |
| 16  | #4686  | WhatsApp relink bug                 | Open — no PR                           |
| 14  | #22559 | Antigravity Gemini 3 missing        | ✅ **Implemented** — PR #27425, merged |
| 12  | #8081  | Multi-user RBAC                     | ✅ **Implemented** — PR #27443, merged |
| 12  | #7520  | Rocket.Chat integration             | ✅ **Implemented** — PR #27436, merged |
| 12  | #7309  | DeepSeek API first-class            | Open — no PR                           |
| 12  | #2317  | SearXNG search provider             | Open — no PR                           |
| 10  | #21290 | OpenTelemetry diagnostics           | `extensions/diagnostics-otel` exists   |
| 10  | #11399 | Extensible web_search via plugins   | Open — no PR                           |
| 9   | #9157  | Workspace token waste (93.5%)       | Open — no PR                           |
| 9   | #6872  | xAI (Grok) native tools             | Open — no PR                           |
| 9   | #12082 | Plugin lifecycle interception hooks | Open — no PR                           |
| 6   | #21530 | Native MCP client support           | Open PR exists upstream                |
| 6   | #26534 | DingTalk channel                    | ✅ **Implemented** — PR #27429, merged |

---

## Decision Framework: What to Integrate

### Tier 1 — Integrate Now (High impact, low risk)

| Enhancement                      | Source       | Effort     | Benefit                                              | Status              |
| -------------------------------- | ------------ | ---------- | ---------------------------------------------------- | ------------------- |
| **Gemini 3.1 model catalog**     | Issue #22559 | Low        | Gemini 3.1 Pro/Flash visible under google-gemini-cli | ✅ Done (PR #27425) |
| **DingTalk channel**             | Issue #26534 | Medium     | Chinese enterprise messaging                         | ✅ Done (PR #27429) |
| **Rocket.Chat channel**          | Issue #7520  | Medium     | Self-hosted team chat                                | ✅ Done (PR #27436) |
| **Multi-user RBAC**              | Issue #8081  | Medium     | Admin/user/guest roles, config redaction             | ✅ Done (PR #27443) |
| **3-tier smart model routing**   | LocalClaw    | Medium     | Major cost reduction, sub-second simple replies      | Pending             |
| **Startup health check**         | LocalClaw    | Low        | Better DX, no silent failures                        | Pending             |
| **SearXNG search provider**      | Issue #2317  | Low-Medium | Privacy-respecting search, very requested            | Pending             |
| **Brave Search LLM Context API** | Issue #14992 | Low        | Drop-in search alternative, 28 👍                    | Pending             |
| **Workspace token optimization** | Issue #9157  | Medium     | 93.5% waste elimination                              | Pending             |

### Tier 2 — Integrate If Relevant to Your Use Case

| Enhancement                          | Source               | Effort | Benefit                    | When                              |
| ------------------------------------ | -------------------- | ------ | -------------------------- | --------------------------------- |
| **GuardAgent privacy tiers**         | EdgeClaw             | High   | S1/S2/S3 data routing      | Privacy-critical deployments      |
| **DuckDB workspace**                 | Ironclaw             | High   | Chat with structured data  | CRM/data-heavy workflows          |
| **Composio tool router**             | composio-openclaw    | Medium | 250+ managed service auth  | Many external integrations        |
| **Multi-tenant container isolation** | openclaw-multitenant | High   | Team/SaaS deployment       | Beyond RBAC — container isolation |
| **DeepSeek first-class support**     | Issue #7309          | Low    | Cost-efficient alternative | Budget-conscious                  |
| **xAI/Grok native tools**            | Issue #6872          | Medium | x_search, code_exec        | xAI users                         |

### Tier 3 — Monitor, Don't Integrate Yet

| Enhancement                   | Source        | Reason to Wait                                    |
| ----------------------------- | ------------- | ------------------------------------------------- |
| Linux/Windows desktop app     | Issue #75     | Massive scope (Electron/Tauri), upstream tracking |
| Crittora boot verification    | Crittora fork | Docker-only, complex ops overhead                 |
| Native MCP client             | Issue #21530  | Open PR upstream — wait for merge                 |
| Modular guardrails (EdgeClaw) | Issue #6095   | Open PR upstream — wait for merge                 |
| OpenTelemetry diagnostics     | Issue #21290  | `extensions/diagnostics-otel` exists in this repo |

### Skip

| Enhancement                             | Reason                                           |
| --------------------------------------- | ------------------------------------------------ |
| Chinese ecosystem channels (QQ, WeChat) | Out of scope unless targeting China              |
| Android APK packaging                   | Platform-specific, not applicable to server fork |

---

## Top Integration Recommendation

**Next highest-leverage item:** port the **LocalClaw 3-tier model routing classifier**. It is:

- A clean heuristic (no LLM call overhead)
- Per-message, not sticky (degrades gracefully)
- Applicable immediately to any OpenClaw install
- The single highest-leverage cost optimization available

**Runner-up:** **add SearXNG + Brave as `web_search` providers** — the most multiply-requested feature (three separate issues totaling ~29 👍) and straightforwardly implementable as a plugin following the existing `extensions/` pattern.

---

## Sources

- GitHub forks API: `repos/openclaw/openclaw/forks?sort=stargazers`
- GitHub issues API: `repos/openclaw/openclaw/issues?sort=reactions`
- Fork READMEs: DenchHQ/ironclaw, sunkencity999/localclaw, OpenBMB/EdgeClaw, jomafilms/openclaw-multitenant, friuns2/openclaw-android-assistant, Crittora/openclaw, ComposioHQ/composio-openclaw
