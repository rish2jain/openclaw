import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

export function registerA2aCli(program: Command) {
  const a2a = program
    .command("a2a")
    .description("Agent2Agent (A2A) protocol tools for agent interoperability");

  // ── openclaw a2a serve ───────────────────────────────────────────────

  a2a
    .command("serve")
    .description("Start the A2A protocol server on the gateway")
    .option("--port <port>", "HTTP port for the A2A server", "41248")
    .option("--host <host>", "Bind address", "127.0.0.1")
    .option("--base-url <url>", "Public base URL for the Agent Card")
    .option("--name <name>", "Agent name in the Agent Card")
    .option("--description <desc>", "Agent description in the Agent Card")
    .option("--gateway-url <url>", "Gateway WebSocket URL")
    .option("--gateway-token <token>", "Gateway auth token")
    .option("--no-streaming", "Disable SSE streaming support")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/a2a", "docs.openclaw.ai/cli/a2a")}\n` +
        `\nAgent Card is served at ${theme.command("/.well-known/agent.json")}\n` +
        `JSON-RPC endpoint at ${theme.command("/a2a")}\n`,
    )
    .action(async (opts) => {
      try {
        const { startA2AServer } = await import("../a2a/server/standalone.js");
        await startA2AServer({
          port: Number.parseInt(opts.port as string, 10),
          host: opts.host as string,
          baseUrl: opts.baseUrl as string | undefined,
          agentName: opts.name as string | undefined,
          agentDescription: opts.description as string | undefined,
          gatewayUrl: opts.gatewayUrl as string | undefined,
          gatewayToken: opts.gatewayToken as string | undefined,
          streaming: opts.streaming !== false,
        });
      } catch (err) {
        defaultRuntime.error(
          `A2A server error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  // ── openclaw a2a discover <url> ────────────────────────────────────

  a2a
    .command("discover <url>")
    .description("Discover an external agent's capabilities via its Agent Card")
    .option("--timeout <ms>", "Request timeout in milliseconds", "10000")
    .option("--json", "Output raw Agent Card JSON")
    .action(async (url: string, opts) => {
      try {
        const { discoverAgent } = await import("../a2a/client/discovery.js");
        const result = await discoverAgent(url, {
          timeoutMs: Number.parseInt(opts.timeout as string, 10),
        });

        if (!result.ok) {
          defaultRuntime.error(`Discovery failed: ${result.error}`);
          process.exitCode = 1;
          return;
        }

        const card = result.card;

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(card, null, 2));
          return;
        }

        defaultRuntime.log("");
        defaultRuntime.log(`${theme.heading("Agent:")} ${card.name}`);
        defaultRuntime.log(`${theme.heading("Version:")} ${card.version}`);
        defaultRuntime.log(`${theme.heading("Description:")} ${card.description}`);

        if (card.provider) {
          defaultRuntime.log(
            `${theme.heading("Provider:")} ${card.provider.name}${card.provider.url ? ` (${card.provider.url})` : ""}`,
          );
        }

        if (card.capabilities) {
          const caps = [];
          if (card.capabilities.streaming) {
            caps.push("streaming");
          }
          if (card.capabilities.pushNotifications) {
            caps.push("push-notifications");
          }
          if (card.capabilities.extendedAgentCard) {
            caps.push("extended-card");
          }
          if (caps.length > 0) {
            defaultRuntime.log(`${theme.heading("Capabilities:")} ${caps.join(", ")}`);
          }
        }

        if (card.skills?.length) {
          defaultRuntime.log(theme.heading("Skills:"));
          for (const skill of card.skills) {
            defaultRuntime.log(`  - ${skill.name}: ${skill.description}`);
            if (skill.tags?.length) {
              defaultRuntime.log(`    ${theme.muted(`Tags: ${skill.tags.join(", ")}`)}`);
            }
            if (skill.examples?.length) {
              for (const example of skill.examples) {
                defaultRuntime.log(`    ${theme.muted(`> ${example}`)}`);
              }
            }
          }
        }

        if (card.interfaces?.length) {
          defaultRuntime.log(theme.heading("Endpoints:"));
          for (const iface of card.interfaces) {
            defaultRuntime.log(
              `  - ${iface.url} (${iface.protocolBinding} v${iface.protocolVersion})`,
            );
          }
        }

        defaultRuntime.log("");
      } catch (err) {
        defaultRuntime.error(
          `Discovery error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });

  // ── openclaw a2a send <agent-url> <message> ────────────────────────

  a2a
    .command("send <agent-url> <message>")
    .description("Send a task to an external A2A agent")
    .option("--stream", "Use streaming (SSE) mode")
    .option("--timeout <ms>", "Request timeout in milliseconds", "60000")
    .option("--discovery-timeout <ms>", "Agent Card discovery timeout in milliseconds", "10000")
    .option("--json", "Output raw JSON response")
    .option("--header <header...>", "Additional headers (key:value)")
    .action(async (agentUrl: string, message: string, opts) => {
      try {
        const { A2AClient } = await import("../a2a/client/a2a-client.js");

        const headers: Record<string, string> = {};
        if (opts.header) {
          for (const h of opts.header as string[]) {
            const idx = h.indexOf(":");
            if (idx > 0) {
              headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
            }
          }
        }

        const discoveryTimeoutMs = Number.parseInt(opts.discoveryTimeout as string, 10) || 10_000;
        const client = new A2AClient({
          baseUrl: agentUrl,
          headers,
          discoveryTimeoutMs,
        });

        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          Number.parseInt(opts.timeout as string, 10),
        );

        if (opts.stream) {
          const stream = await client.sendStreamingMessage(
            { role: "user", parts: [{ type: "text", text: message }] },
            undefined,
            controller.signal,
          );
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              process.stdout.write(value);
            }
          } finally {
            clearTimeout(timeout);
            reader.releaseLock();
          }
        } else {
          const result = await client.sendText(message, undefined, controller.signal);

          clearTimeout(timeout);

          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }

          if (result.task) {
            const task = result.task;
            defaultRuntime.log(`${theme.heading("Task ID:")} ${task.id}`);
            defaultRuntime.log(`${theme.heading("Status:")} ${task.status.state}`);
            if (task.status.message?.parts) {
              for (const part of task.status.message.parts) {
                if (part.type === "text") {
                  defaultRuntime.log("");
                  defaultRuntime.log(part.text);
                }
              }
            }
            // Show text from history (agent replies)
            if (task.history?.length) {
              const agentMessages = task.history.filter((m) => m.role === "agent");
              for (const msg of agentMessages) {
                for (const part of msg.parts) {
                  if (part.type === "text" && part.text) {
                    defaultRuntime.log("");
                    defaultRuntime.log(part.text);
                  }
                }
              }
            }
          } else if (result.message) {
            for (const part of result.message.parts) {
              if (part.type === "text") {
                defaultRuntime.log(part.text);
              }
            }
          }
        }
      } catch (err) {
        defaultRuntime.error(`Send error: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
