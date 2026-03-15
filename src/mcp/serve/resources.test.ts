import { describe, it, expect, vi } from "vitest";
import { getResourceTemplates, getAllResources, readResource } from "./resources.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

describe("getResourceTemplates", () => {
  it("returns channel and session templates", () => {
    const templates = getResourceTemplates();
    expect(templates).toHaveLength(2);

    const channelTemplate = templates.find((t) => t.uriTemplate.includes("channels"));
    expect(channelTemplate).toBeDefined();
    expect(channelTemplate!.uriTemplate).toBe("openclaw://channels/{channelName}");
    expect(channelTemplate!.mimeType).toBe("application/json");

    const sessionTemplate = templates.find((t) => t.uriTemplate.includes("sessions"));
    expect(sessionTemplate).toBeDefined();
    expect(sessionTemplate!.uriTemplate).toBe("openclaw://sessions/{sessionKey}");
  });
});

describe("getAllResources", () => {
  it("enumerates channel resources from gateway status", async () => {
    const gw = vi.fn().mockImplementation((method: string) => {
      if (method === "channels.status") {
        return Promise.resolve({
          telegram: { enabled: true },
          discord: { enabled: false },
        });
      }
      if (method === "sessions.list") {
        return Promise.resolve({ sessions: [] });
      }
      return Promise.resolve({});
    }) as unknown as GatewayRpc;

    const resources = await getAllResources(gw);

    const channelResources = resources.filter((r) => r.uri.startsWith("openclaw://channels/"));
    expect(channelResources).toHaveLength(2);
    expect(channelResources.map((r) => r.uri)).toContain("openclaw://channels/telegram");
    expect(channelResources.map((r) => r.uri)).toContain("openclaw://channels/discord");
  });

  it("skips keys starting with underscore or 'gateway'", async () => {
    const gw = vi.fn().mockImplementation((method: string) => {
      if (method === "channels.status") {
        return Promise.resolve({
          _metadata: {},
          gateway: { status: "ok" },
          telegram: { enabled: true },
        });
      }
      if (method === "sessions.list") {
        return Promise.resolve({ sessions: [] });
      }
      return Promise.resolve({});
    }) as unknown as GatewayRpc;

    const resources = await getAllResources(gw);

    const channelResources = resources.filter((r) => r.uri.startsWith("openclaw://channels/"));
    expect(channelResources).toHaveLength(1);
    expect(channelResources[0].uri).toBe("openclaw://channels/telegram");
  });

  it("enumerates session resources from gateway", async () => {
    const gw = vi.fn().mockImplementation((method: string) => {
      if (method === "channels.status") {
        return Promise.resolve({});
      }
      if (method === "sessions.list") {
        return Promise.resolve({
          sessions: [
            { sessionKey: "agent:main:main", label: "Main Session" },
            { key: "agent:helper:1", displayName: "Helper" },
          ],
        });
      }
      return Promise.resolve({});
    }) as unknown as GatewayRpc;

    const resources = await getAllResources(gw);

    const sessionResources = resources.filter((r) => r.uri.startsWith("openclaw://sessions/"));
    expect(sessionResources).toHaveLength(2);
    expect(sessionResources[0].name).toContain("Main Session");
    expect(sessionResources[1].name).toContain("Helper");
  });
});

describe("readResource", () => {
  it("reads a channel resource", async () => {
    const gw = vi.fn().mockResolvedValue({
      telegram: { enabled: true, connected: true },
      discord: { enabled: false },
    }) as unknown as GatewayRpc;

    const result = await readResource("openclaw://channels/telegram", gw);

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe("openclaw://channels/telegram");
    expect(result.contents[0].mimeType).toBe("application/json");
    expect(result.contents[0].text).toBeDefined();
    const parsed = JSON.parse(result.contents[0].text!);
    expect(parsed.enabled).toBe(true);
  });

  it("throws when channel is not found", async () => {
    const gw = vi.fn().mockResolvedValue({
      telegram: {},
    }) as unknown as GatewayRpc;

    await expect(readResource("openclaw://channels/slack", gw)).rejects.toThrow(
      "Channel not found: slack",
    );
  });

  it("reads a session resource", async () => {
    const gw = vi.fn().mockResolvedValue({
      messages: [{ role: "user", content: "hello" }],
    }) as unknown as GatewayRpc;

    const result = await readResource("openclaw://sessions/agent%3Amain%3Amain", gw);

    expect(gw).toHaveBeenCalledWith("sessions.preview", {
      sessionKey: "agent:main:main",
    });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe("application/json");
  });

  it("throws for invalid URI scheme", async () => {
    const gw = vi.fn() as unknown as GatewayRpc;

    await expect(readResource("http://example.com/foo", gw)).rejects.toThrow(
      "Invalid resource URI",
    );
  });

  it("throws for unknown resource type", async () => {
    const gw = vi.fn() as unknown as GatewayRpc;

    await expect(readResource("openclaw://unknown/foo", gw)).rejects.toThrow(
      "Invalid resource URI",
    );
  });
});
