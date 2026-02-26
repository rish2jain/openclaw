/**
 * Resource Bridge — discovers and injects MCP resources into agent context.
 *
 * Handles:
 * - Resource discovery via listResources()
 * - Resource reading with text/binary support
 * - Untrusted content wrapping for all resource content
 * - Config-driven filtering (resourceFilter)
 * - Context block building for prompt injection
 */

import { logWarn } from "../logger.js";
import { wrapExternalContent } from "../security/external-content.js";
import type { McpClientBase } from "./client-base.js";

export type McpResourceInfo = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
};

/**
 * Discover available resources from an MCP client.
 * Respects config.resources (enabled/disabled) and config.resourceFilter.
 */
export async function discoverResources(client: McpClientBase): Promise<McpResourceInfo[]> {
  if (client.config.resources === false) {
    return [];
  }

  const result = await client.listResources();
  let resources = result.resources;

  const filter = client.config.resourceFilter;
  if (filter && filter.length > 0) {
    const filterSet = new Set(filter);
    resources = resources.filter((r) => filterSet.has(r.uri));
  }

  return resources.map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType,
  }));
}

/**
 * Read a single resource and wrap its content as untrusted.
 * Returns null on failure (logs warning, does not throw).
 */
export async function readResource(
  client: McpClientBase,
  serverName: string,
  resource: Pick<McpResourceInfo, "uri" | "name">,
): Promise<string | null> {
  try {
    const result = await client.readResource({ uri: resource.uri });
    const parts: string[] = [];

    for (const content of result.contents ?? []) {
      if (content.text != null) {
        parts.push(content.text);
      } else if (content.blob != null) {
        parts.push(`[Binary resource: ${content.mimeType ?? "unknown"}, ${resource.uri}]`);
      }
    }

    const rawText = parts.join("\n");

    return wrapExternalContent(rawText, {
      source: "mcp_server",
      sender: serverName,
      includeWarning: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn(`Failed to read MCP resource '${resource.uri}' from '${serverName}': ${message}`);
    return null;
  }
}

/**
 * Build a complete resource context block for prompt injection.
 * Discovers all resources, reads them, and formats as a single string.
 * Returns empty string if no resources are available.
 */
export async function buildResourceContext(
  client: McpClientBase,
  serverName: string,
): Promise<string> {
  const resources = await discoverResources(client);
  if (resources.length === 0) {
    return "";
  }

  const sections: string[] = [];
  for (const resource of resources) {
    const content = await readResource(client, serverName, resource);
    if (content != null) {
      sections.push(`### ${resource.name} (${resource.uri})\n${content}`);
    }
  }

  if (sections.length === 0) {
    return "";
  }

  return `## MCP Resources from ${serverName}\n\n${sections.join("\n\n")}`;
}
