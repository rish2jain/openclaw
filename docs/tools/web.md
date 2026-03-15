---
summary: "Web search + fetch tools (Brave, Perplexity, Grok, SearXNG, xAI native search + code exec)"
read_when:
  - You want to enable web_search or web_fetch
  - You need Brave Search API key setup
  - You want to use Perplexity Sonar for web search
  - You want to use Grok web search via xAI
  - You want to search X/Twitter posts or execute Python via xAI native tools
  - You want a self-hosted search engine (SearXNG)
title: "Web Tools"
---

# Web tools

OpenClaw ships lightweight web and search tools:

- `web_search` — Search the web via Brave, Perplexity Sonar, Grok, or SearXNG.
- `web_fetch` — HTTP fetch + readable extraction (HTML → markdown/text).
- `xai_search` — Search X (Twitter) posts via xAI's native `x_search` tool.
- `xai_code_exec` — Execute Python code in xAI's remote sandbox via `code_exec_python`.

`web_search` and `web_fetch` are **not** browser automation. For JS-heavy sites or logins, use the
[Browser tool](/tools/browser).

## web_search

Search the web using your configured provider.

### How it works

- Calls your chosen provider and returns results.
  - **Brave** (default): structured results (title, URL, snippet).
  - **Perplexity**: AI-synthesized answers with citations from real-time web search.
  - **Grok**: xAI-powered web search using `OPENAI_RESPONSE_FORMAT` compatible completions.
  - **SearXNG**: self-hosted meta-search engine (privacy-friendly, no API key needed).
- Results are cached by query for 15 minutes (configurable).

### Choosing a search provider

| Provider            | Pros                                         | Cons                                      | Key / Config                                       |
| ------------------- | -------------------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| **Brave** (default) | Fast, structured results, free tier          | Traditional results (no AI synthesis)     | `BRAVE_API_KEY`                                    |
| **Perplexity**      | AI-synthesized answers, citations, real-time | Requires Perplexity or OpenRouter account | `OPENROUTER_API_KEY` or `PERPLEXITY_API_KEY`       |
| **Grok**            | xAI-powered synthesis, X/web context         | Requires xAI API key                      | `XAI_API_KEY` or `tools.web.search.grok.apiKey`    |
| **SearXNG**         | Self-hosted, privacy-preserving, no API key  | Requires running a SearXNG instance       | `SEARXNG_BASE_URL` or `tools.web.search.searxng.*` |

See [Brave Search](/brave-search) and [Perplexity Sonar](/perplexity) for provider-specific details.

### Auto-detection

If no `provider` is set, OpenClaw picks the first provider with a working key/URL:

1. **Brave** — `BRAVE_API_KEY` or `tools.web.search.apiKey`
2. **Perplexity** — `PERPLEXITY_API_KEY` / `OPENROUTER_API_KEY` or `tools.web.search.perplexity.apiKey`
3. **Grok** — `XAI_API_KEY` or `tools.web.search.grok.apiKey`
4. **SearXNG** — `SEARXNG_BASE_URL` or `tools.web.search.searxng.baseUrl`

If no keys or URLs are found, it falls back to Brave (you'll get a missing-key error prompting
you to configure one).

Runtime SecretRef behavior:

- Web tool SecretRefs are resolved atomically at gateway startup/reload.
- In auto-detect mode, OpenClaw resolves only the selected provider key. Non-selected provider SecretRefs stay inactive until selected.
- If the selected provider SecretRef is unresolved and no provider env fallback exists, startup/reload fails fast.

## Setting up web search

Use `openclaw configure --section web` to set up your API key and choose a provider.

### Brave Search

1. Create a Brave Search API account at [brave.com/search/api](https://brave.com/search/api/)
2. In the dashboard, choose the **Search** plan and generate an API key.
3. Run `openclaw configure --section web` to store the key in config, or set `BRAVE_API_KEY` in your environment.

Each Brave plan includes **\$5/month in free credit** (renewing). The Search
plan costs \$5 per 1,000 requests, so the credit covers 1,000 queries/month. Set
your usage limit in the Brave dashboard to avoid unexpected charges. See the
[Brave API portal](https://brave.com/search/api/) for current plans and
pricing.

### Perplexity Search

1. Create a Perplexity account at [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
2. Generate an API key in the dashboard
3. Run `openclaw configure --section web` to store the key in config, or set `PERPLEXITY_API_KEY` in your environment.

For legacy Sonar/OpenRouter compatibility, set `OPENROUTER_API_KEY` instead, or configure `tools.web.search.perplexity.apiKey` with an `sk-or-...` key. Setting `tools.web.search.perplexity.baseUrl` or `model` also opts Perplexity back into the chat-completions compatibility path.

See [Perplexity Search API Docs](https://docs.perplexity.ai/guides/search-quickstart) for more details.

### Where to store the key

**Via config:** run `openclaw configure --section web`. It stores the key under the provider-specific config path:

- Brave: `tools.web.search.apiKey`
- Gemini: `tools.web.search.gemini.apiKey`
- Grok: `tools.web.search.grok.apiKey`
- Kimi: `tools.web.search.kimi.apiKey`
- Perplexity: `tools.web.search.perplexity.apiKey`

All of these fields also support SecretRef objects.

**Via environment:** set provider env vars in the Gateway process environment:

- Brave: `BRAVE_API_KEY`
- Gemini: `GEMINI_API_KEY`
- Grok: `XAI_API_KEY`
- Kimi: `KIMI_API_KEY` or `MOONSHOT_API_KEY`
- Perplexity: `PERPLEXITY_API_KEY` or `OPENROUTER_API_KEY`

For a gateway install, put these in `~/.openclaw/.env` (or your service environment). See [Env vars](/help/faq#how-does-openclaw-load-environment-variables).

### Config examples

**Brave Search:**

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "brave", // "brave" | "perplexity" | "grok" | "searxng"
        apiKey: "YOUR_BRAVE_API_KEY", // optional if BRAVE_API_KEY is set // pragma: allowlist secret
      },
    },
  },
}
```

**Brave LLM Context mode:**

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "brave",
        apiKey: "YOUR_BRAVE_API_KEY", // optional if BRAVE_API_KEY is set // pragma: allowlist secret
        brave: {
          mode: "llm-context",
        },
      },
    },
  },
}
```

### web_search requirements

- `tools.web.search.enabled` must not be `false` (default: enabled)
- API key for your chosen provider (see table above)

`llm-context` (Brave) returns extracted page chunks for grounding instead of standard Brave snippets.
In this mode, `country` and `language` / `search_lang` still work, but `ui_lang`,
`freshness`, `date_after`, and `date_before` are rejected.

**Perplexity Search:**

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "perplexity",
        perplexity: {
          apiKey: "pplx-...", // optional if PERPLEXITY_API_KEY is set
        },
      },
    },
  },
}
```

**Perplexity via OpenRouter / Sonar compatibility:**

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "perplexity",
        perplexity: {
          apiKey: "<openrouter-api-key>", // optional if OPENROUTER_API_KEY is set
          baseUrl: "https://openrouter.ai/api/v1",
          model: "perplexity/sonar-pro",
        },
      },
    },
  },
}
```

## Using Gemini (Google Search grounding)

Gemini models support built-in [Google Search grounding](https://ai.google.dev/gemini-api/docs/grounding),
which returns AI-synthesized answers backed by live Google Search results with citations.

### Getting a Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key
3. Set `GEMINI_API_KEY` in the Gateway environment, or configure `tools.web.search.gemini.apiKey`

### Setting up Gemini search

```json5
{
  tools: {
    web: {
      search: {
        provider: "gemini",
        gemini: {
          // API key (optional if GEMINI_API_KEY is set)
          apiKey: "AIza...",
          // Model (defaults to "gemini-2.5-flash")
          model: "gemini-2.5-flash",
        },
      },
    },
  },
}
```

**Environment alternative:** set `GEMINI_API_KEY` in the Gateway environment.
For a gateway install, put it in `~/.openclaw/.env`.

### Notes

- Citation URLs from Gemini grounding are automatically resolved from Google's
  redirect URLs to direct URLs.
- Redirect resolution uses the SSRF guard path (HEAD + redirect checks + http/https validation) before returning the final citation URL.
- Redirect resolution uses strict SSRF defaults, so redirects to private/internal targets are blocked.
- The default model (`gemini-2.5-flash`) is fast and cost-effective.
  Any Gemini model that supports grounding can be used.

### web_search config

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        apiKey: "BRAVE_API_KEY_HERE", // optional if BRAVE_API_KEY is set
        maxResults: 5,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
      },
    },
  },
}
```

### web_search tool parameters

- `query` (required)
- `count` (1–10; default from config)
- `country` (optional): 2-letter country code for region-specific results (e.g., `"DE"`, `"US"`, `"ALL"`)
- `search_lang` / `language` (optional): ISO language code for search results (e.g., `"de"`, `"en"`, `"fr"`)
- `ui_lang` (optional): ISO language code for UI elements (Brave only)
- `freshness` (optional): filter by discovery time (`day`, `week`, `month`, `year`; Brave also supports `pd`, `pw`, `pm`, `py`, or date range)
- `date_after` / `date_before` (optional): filter results by date (YYYY-MM-DD)
- `domain_filter` (Perplexity only): domain allowlist/denylist array
- `max_tokens` / `max_tokens_per_page` (Perplexity only): content budget

Perplexity's OpenRouter / Sonar compatibility path supports only `query` and `freshness`.

**Examples:**

```javascript
// German-specific search
await web_search({ query: "TV online schauen", count: 10, country: "DE", search_lang: "de" });

// Recent results (past week)
await web_search({ query: "TMBG interview", freshness: "pw" });

// Alternative (language param)
await web_search({
  query: "TV online schauen",
  country: "DE",
  language: "de",
});

// Date range search
await web_search({
  query: "AI developments",
  date_after: "2024-01-01",
  date_before: "2024-06-30",
});

// Domain filtering (Perplexity only)
await web_search({
  query: "climate research",
  domain_filter: ["nature.com", "science.org", ".edu"],
});

// Exclude domains (Perplexity only)
await web_search({
  query: "product reviews",
  domain_filter: ["-reddit.com", "-pinterest.com"],
});

// More content extraction (Perplexity only)
await web_search({
  query: "detailed AI research",
  max_tokens: 50000,
  max_tokens_per_page: 4096,
});
```

When Brave `llm-context` mode is enabled, `ui_lang`, `freshness`, `date_after`, and
`date_before` are not supported. Use Brave `web` mode for those filters.

## web_fetch

Fetch a URL and extract readable content.

### web_fetch requirements

- `tools.web.fetch.enabled` must not be `false` (default: enabled)
- Optional Firecrawl fallback: set `tools.web.fetch.firecrawl.apiKey` or `FIRECRAWL_API_KEY`.
- `tools.web.fetch.firecrawl.apiKey` supports SecretRef objects.

### web_fetch config

```json5
{
  tools: {
    web: {
      fetch: {
        enabled: true,
        maxChars: 50000,
        maxCharsCap: 50000,
        maxResponseBytes: 2000000,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
        maxRedirects: 3,
        readability: true,
        firecrawl: {
          enabled: true,
          apiKey: "FIRECRAWL_API_KEY_HERE", // optional if FIRECRAWL_API_KEY is set
          baseUrl: "https://api.firecrawl.dev",
          onlyMainContent: true,
          maxAgeMs: 86400000, // 1 day
          timeoutSeconds: 60,
        },
      },
    },
  },
}
```

### web_fetch tool parameters

- `url` (required, http/https only)
- `extractMode` (`markdown` | `text`)
- `maxChars` (truncate long pages)

Notes:

- `web_fetch` uses Readability (main-content extraction) first, then Firecrawl (if configured).
- Firecrawl requests use bot-circumvention mode and cache results by default.
- Firecrawl SecretRefs are resolved only when Firecrawl is active (`tools.web.fetch.enabled !== false` and `tools.web.fetch.firecrawl.enabled !== false`).
- If Firecrawl is active and its SecretRef is unresolved with no `FIRECRAWL_API_KEY` fallback, startup/reload fails fast.
- Sends a Chrome-like User-Agent and `Accept-Language` by default; override `userAgent` if needed.
- Blocks private/internal hostnames and re-checks redirects (limit with `maxRedirects`).
- `maxChars` is clamped to `tools.web.fetch.maxCharsCap`.
- Response body is capped to `maxResponseBytes` before parsing; oversized responses are truncated.
- See [Firecrawl](/tools/firecrawl) for key setup and service details.
- Responses are cached (default 15 minutes).
- If you use tool profiles/allowlists, add `web_search`/`web_fetch` or `group:web`.
- If the API key is missing, `web_search` returns a short setup hint with a docs link.

---

## xai_search

Search X (Twitter) posts using xAI's native `x_search` tool. This is a separate tool from
`web_search` — it targets posts on X/Twitter, not general web results.

### xai_search requirements

- `XAI_API_KEY` env var, or `tools.xai.apiKey` in config
- `tools.xai.search.enabled` must not be `false` (default: enabled when key is present)

### xai_search config

```json5
{
  tools: {
    xai: {
      apiKey: "xai-...", // optional if XAI_API_KEY is set
      model: "grok-4", // default
      search: {
        enabled: true,
      },
    },
  },
}
```

### xai_search tool parameters

- `query` (required): search query or topic
- `count` (optional, default 10): number of posts to return

### xai_search example

```javascript
await xai_search({ query: "OpenAI GPT-5 launch", count: 10 });
```

Results include post text, author handles, and dates. Content is marked as external/untrusted
in the agent context.

---

## xai_code_exec

Execute Python code in xAI's remote sandbox using the native `code_exec_python` tool.
Useful for data analysis, calculations, and scripted tasks that need a live Python runtime.

### xai_code_exec requirements

- `XAI_API_KEY` env var, or `tools.xai.apiKey` in config
- `tools.xai.codeExec.enabled` must not be `false` (default: enabled when key is present)

### xai_code_exec config

```json5
{
  tools: {
    xai: {
      apiKey: "xai-...", // optional if XAI_API_KEY is set
      model: "grok-4", // default
      codeExec: {
        enabled: true,
      },
    },
  },
}
```

### xai_code_exec tool parameters

- `task` (required): description of what to compute or accomplish
- `hint` (optional): extra context or code to start from

### xai_code_exec example

```javascript
await xai_code_exec({
  task: "Calculate the Fibonacci sequence up to 1000 and return the values as JSON",
});
```

The tool returns stdout output and/or structured results from the sandbox. Execution is
stateless — each call is an isolated run.

---

## General notes

- If you use tool profiles/allowlists, add `xai_search`/`xai_code_exec` to the allow list or use `group:plugins`.
- `XAI_API_KEY` is shared by the `grok` web search provider, `xai_search`, and `xai_code_exec` — one key enables all three.
- All results from external sources are security-marked as untrusted content in the agent context.
