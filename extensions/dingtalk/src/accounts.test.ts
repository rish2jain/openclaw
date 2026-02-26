import { describe, expect, it } from "vitest";
import {
  buildDingTalkWebhookUrl,
  listDingTalkAccountIds,
  resolveDingTalkAccount,
} from "./accounts.js";
import type { CoreConfig } from "./types.js";

describe("buildDingTalkWebhookUrl", () => {
  it("builds a valid webhook URL from an access token", () => {
    const url = buildDingTalkWebhookUrl("my-token");
    expect(url).toBe("https://oapi.dingtalk.com/robot/send?access_token=my-token");
  });

  it("URL-encodes the access token", () => {
    const url = buildDingTalkWebhookUrl("token with spaces");
    expect(url).toContain("token%20with%20spaces");
  });
});

describe("listDingTalkAccountIds", () => {
  it("returns empty for unconfigured", () => {
    const cfg: CoreConfig = {};
    expect(listDingTalkAccountIds(cfg)).toEqual([]);
  });

  it("returns default when accessToken is set", () => {
    const cfg: CoreConfig = {
      channels: { dingtalk: { accessToken: "tok" } },
    };
    expect(listDingTalkAccountIds(cfg)).toContain("default");
  });

  it("returns named accounts", () => {
    const cfg: CoreConfig = {
      channels: { dingtalk: { accounts: { work: { accessToken: "tok" } } } },
    };
    expect(listDingTalkAccountIds(cfg)).toContain("work");
  });
});

describe("resolveDingTalkAccount", () => {
  it("resolves the default account", () => {
    const cfg: CoreConfig = {
      channels: {
        dingtalk: { accessToken: "my-token", secret: "my-secret" },
      },
    };
    const account = resolveDingTalkAccount({ cfg, accountId: "default" });
    expect(account.webhookUrl).toContain("my-token");
    expect(account.config.secret).toBe("my-secret");
  });

  it("uses a custom webhookUrl when provided", () => {
    const cfg: CoreConfig = {
      channels: {
        dingtalk: {
          accessToken: "tok",
          webhookUrl: "https://custom.example.com/webhook",
        },
      },
    };
    const account = resolveDingTalkAccount({ cfg, accountId: "default" });
    expect(account.webhookUrl).toBe("https://custom.example.com/webhook");
  });
});
