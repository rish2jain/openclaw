import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createChannelStateStore: vi.fn(),
}));

vi.mock("../channels/persistence/channel-state-store.js", () => ({
  createChannelStateStore: mocks.createChannelStateStore,
}));

import { initChannelOrchestratorSubsystems } from "./server-startup-channels-orchestrator.js";

describe("server-startup-channels-orchestrator", () => {
  afterEach(() => {
    mocks.createChannelStateStore.mockReset();
    vi.restoreAllMocks();
  });

  it("falls back to in-memory orchestrator state when persistence init fails", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "openclaw-channel-state-"));
    mocks.createChannelStateStore.mockImplementation(() => {
      throw new Error("unable to open database file");
    });

    try {
      const subsystems = initChannelOrchestratorSubsystems({
        stateDir,
        isChannelConnected: () => true,
      });

      expect(mocks.createChannelStateStore).toHaveBeenCalledWith({
        dbPath: join(stateDir, "channels", "state.sqlite"),
      });

      const inbound = subsystems.channelOrchestrator.handleInbound({
        channel: "telegram",
        accountId: "default",
        threadId: "thread-1",
        peerId: "user-1",
        peerKind: "direct",
        sessionKey: "session-1",
        message: { text: "hello" },
      });

      expect(inbound.canonicalThreadId).toBeTruthy();
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("falls back to in-memory state when channels dir is not writable", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "openclaw-channel-state-"));
    const channelsDir = join(stateDir, "channels");
    mkdirSync(channelsDir, { recursive: true });
    chmodSync(channelsDir, 0o500);

    try {
      const subsystems = initChannelOrchestratorSubsystems({
        stateDir,
        isChannelConnected: () => true,
      });

      expect(mocks.createChannelStateStore).not.toHaveBeenCalled();

      const inbound = subsystems.channelOrchestrator.handleInbound({
        channel: "telegram",
        accountId: "default",
        threadId: "thread-1",
        peerId: "user-1",
        peerKind: "direct",
        sessionKey: "session-1",
        message: { text: "hello" },
      });

      expect(inbound.canonicalThreadId).toBeTruthy();
    } finally {
      chmodSync(channelsDir, 0o700);
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("retries channel state store open before succeeding", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "openclaw-channel-state-"));
    const store = {
      initialize: vi.fn(),
      loadAll: vi.fn(() => ({
        identityGroups: [],
        identityLinks: [],
        threads: [],
        threadReferences: [],
        failoverState: [],
        bridgeMessages: [],
      })),
      saveAll: vi.fn(),
    };
    mocks.createChannelStateStore
      .mockImplementationOnce(() => {
        throw new Error("database busy");
      })
      .mockImplementationOnce(() => {
        throw new Error("database busy");
      })
      .mockReturnValue(store);

    try {
      initChannelOrchestratorSubsystems({
        stateDir,
        isChannelConnected: () => true,
      });

      expect(mocks.createChannelStateStore).toHaveBeenCalledTimes(3);
      expect(store.initialize).toHaveBeenCalledTimes(1);
      expect(store.loadAll).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
