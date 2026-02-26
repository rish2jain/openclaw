import { describe, expect, it } from "vitest";
import { listRocketChatAccountIds, resolveRocketChatAccount } from "./accounts.js";
import type { CoreConfig } from "./types.js";

describe("listRocketChatAccountIds", () => {
  it("returns empty for unconfigured", () => {
    const cfg: CoreConfig = {};
    expect(listRocketChatAccountIds(cfg)).toEqual([]);
  });

  it("returns default when serverUrl is set", () => {
    const cfg: CoreConfig = {
      channels: { rocketchat: { serverUrl: "https://chat.example.com" } },
    };
    expect(listRocketChatAccountIds(cfg)).toContain("default");
  });

  it("returns named accounts", () => {
    const cfg: CoreConfig = {
      channels: {
        rocketchat: {
          accounts: {
            work: { serverUrl: "https://work.rocket.chat" },
            personal: { serverUrl: "https://open.rocket.chat" },
          },
        },
      },
    };
    const ids = listRocketChatAccountIds(cfg);
    expect(ids).toContain("work");
    expect(ids).toContain("personal");
  });
});

describe("resolveRocketChatAccount", () => {
  it("resolves mode from webhookUrl when mode not set", () => {
    const cfg: CoreConfig = {
      channels: {
        rocketchat: {
          serverUrl: "https://chat.example.com",
          webhookUrl: "https://chat.example.com/hooks/tok123",
        },
      },
    };
    const account = resolveRocketChatAccount({ cfg, accountId: "default" });
    expect(account.mode).toBe("webhook");
  });

  it("resolves mode from authToken when mode not set", () => {
    const cfg: CoreConfig = {
      channels: {
        rocketchat: {
          serverUrl: "https://chat.example.com",
          authToken: "tok",
          userId: "uid",
        },
      },
    };
    const account = resolveRocketChatAccount({ cfg, accountId: "default" });
    expect(account.mode).toBe("api");
  });

  it("strips trailing slashes from serverUrl", () => {
    const cfg: CoreConfig = {
      channels: {
        rocketchat: { serverUrl: "https://chat.example.com///" },
      },
    };
    const account = resolveRocketChatAccount({ cfg, accountId: "default" });
    expect(account.serverUrl).toBe("https://chat.example.com");
  });
});
