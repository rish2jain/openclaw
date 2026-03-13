import type { Command } from "commander";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";

export function registerMcpCli(program: Command) {
  const mcp = program
    .command("mcp")
    .description("Expose OpenClaw as an MCP (Model Context Protocol) server")
    .addHelpText(
      "after",
      () => `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/mcp", "docs.openclaw.ai/cli/mcp")}\n`,
    );

  mcp
    .command("serve")
    .description("Start the MCP server (stdio or SSE transport)")
    .option(
      "--transport <type>",
      "Transport mode: stdio (for editor integration) or sse (for web/remote)",
      "stdio",
    )
    .option("--port <port>", "SSE server port (default: 18790)", "18790")
    .option("--host <host>", "SSE server bind address (default: 127.0.0.1)", "127.0.0.1")
    .option("--url <url>", "Gateway WebSocket URL (defaults to gateway.remote.url when configured)")
    .option("--token <token>", "Gateway token (if required)")
    .option("--password <password>", "Gateway password (if required)")
    .option("-v, --verbose", "Verbose logging to stderr", false)
    .action(async (opts) => {
      const rawTransport = String(opts.transport);
      if (rawTransport !== "stdio" && rawTransport !== "sse") {
        process.stderr.write(
          `Error: --transport must be 'stdio' or 'sse', got '${rawTransport}'\n`,
        );
        process.exit(1);
      }
      const transport: "stdio" | "sse" = rawTransport;

      const { serveMcp } = await import("../mcp/serve/server.js");
      await serveMcp({
        transport,
        port: Number(opts.port),
        host: opts.host as string,
        gatewayUrl: opts.url as string | undefined,
        gatewayToken: opts.token as string | undefined,
        gatewayPassword: opts.password as string | undefined,
        verbose: opts.verbose as boolean,
      });
    });
}
