import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdaptableMessage } from "./adaptation/message-adapter.js";
import {
  createChannelOrchestrator,
  type ChannelOrchestratorDeps,
  type InboundMessageParams,
  type OutboundMessageParams,
} from "./orchestrator.js";

function createMockDeps(): ChannelOrchestratorDeps {
  return {
    healthMonitor: {
      recordDelivery: vi.fn(),
      getMetrics: vi.fn(),
      stop: vi.fn(),
    },
    failoverRouter: {
      evaluateFailover: vi.fn().mockReturnValue({
        triggered: false,
        originalChannel: "telegram",
        reason: "channel is operational",
      }),
    },
    messageAdapter: {
      adaptMessage: vi.fn().mockImplementation((msg: AdaptableMessage, _channel: string) => ({
        text: msg.text,
        format: "plain" as const,
        attachments: [],
      })),
    },
    contextBridge: {
      recordMessage: vi.fn(),
      buildBridgeContext: vi.fn(),
      formatContextForAgent: vi.fn(),
      formatSwitchNotice: vi.fn(),
    },
    identityLinker: {
      findGroup: vi.fn().mockReturnValue(undefined),
      linkIdentities: vi.fn(),
      getLinkedIdentities: vi.fn().mockReturnValue([]),
    },
    threadRegistry: {
      registerThread: vi.fn().mockReturnValue({
        canonicalId: "canon-thread-1",
        sessionKey: "agent:main:main",
      }),
    },
  } as unknown as ChannelOrchestratorDeps;
}

describe("ChannelOrchestrator", () => {
  let deps: ChannelOrchestratorDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  describe("handleInbound", () => {
    const baseParams: InboundMessageParams = {
      channel: "telegram",
      accountId: "default",
      threadId: "thread-1",
      peerId: "user-123",
      peerKind: "direct",
      sessionKey: "agent:main:main",
      message: { text: "hello" } as AdaptableMessage,
    };

    it("adapts the message via messageAdapter", () => {
      const orchestrator = createChannelOrchestrator(deps);

      const result = orchestrator.handleInbound(baseParams);

      expect(deps.messageAdapter.adaptMessage).toHaveBeenCalledWith(baseParams.message, "telegram");
      expect(result.adaptedMessage).toBeDefined();
      expect(result.adaptedMessage.textChunks[0]).toBe("hello");
    });

    it("registers the thread in threadRegistry", () => {
      const orchestrator = createChannelOrchestrator(deps);

      const result = orchestrator.handleInbound(baseParams);

      expect(deps.threadRegistry.registerThread).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionKey: "agent:main:main",
          channel: "telegram",
          threadId: "thread-1",
          peerId: "user-123",
        }),
      );
      expect(result.canonicalThreadId).toBe("canon-thread-1");
    });

    it("records message in contextBridge", () => {
      const orchestrator = createChannelOrchestrator(deps);

      orchestrator.handleInbound(baseParams);

      expect(deps.contextBridge.recordMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadCanonicalId: "canon-thread-1",
          channel: "telegram",
          role: "user",
          content: "hello",
        }),
      );
    });

    it("resolves identity group via identityLinker", () => {
      (deps.identityLinker.findGroup as ReturnType<typeof vi.fn>).mockReturnValue({
        groupId: "group-abc",
      });
      const orchestrator = createChannelOrchestrator(deps);

      const result = orchestrator.handleInbound(baseParams);

      expect(deps.identityLinker.findGroup).toHaveBeenCalledWith("telegram", "user-123");
      expect(result.identityGroupId).toBe("group-abc");
    });

    it("returns undefined identityGroupId when no group found", () => {
      const orchestrator = createChannelOrchestrator(deps);

      const result = orchestrator.handleInbound(baseParams);

      expect(result.identityGroupId).toBeUndefined();
    });
  });

  describe("prepareOutbound", () => {
    const baseParams: OutboundMessageParams = {
      channel: "telegram",
      accountId: "default",
      userKey: "user-1",
      message: { text: "reply" } as AdaptableMessage,
      threadCanonicalId: "canon-thread-1",
    };

    it("uses original channel when no failover triggered", () => {
      const orchestrator = createChannelOrchestrator(deps);

      const result = orchestrator.prepareOutbound(baseParams);

      expect(deps.failoverRouter.evaluateFailover).toHaveBeenCalledWith({
        channel: "telegram",
        accountId: "default",
        userKey: "user-1",
      });
      expect(result.targetChannel).toBe("telegram");
      expect(result.failoverDecision.triggered).toBe(false);
      expect(result.bridgeContext).toBeUndefined();
      expect(result.switchNotice).toBeUndefined();
    });

    it("routes to failover channel when triggered", () => {
      (deps.failoverRouter.evaluateFailover as ReturnType<typeof vi.fn>).mockReturnValue({
        triggered: true,
        originalChannel: "telegram",
        targetChannel: "discord",
        reason: "channel unhealthy",
      });
      (deps.contextBridge.buildBridgeContext as ReturnType<typeof vi.fn>).mockReturnValue({
        sourceChannel: "telegram",
        targetChannel: "discord",
      });
      (deps.contextBridge.formatContextForAgent as ReturnType<typeof vi.fn>).mockReturnValue(
        "Context: switching from telegram to discord",
      );
      (deps.contextBridge.formatSwitchNotice as ReturnType<typeof vi.fn>).mockReturnValue(
        "Switched to discord",
      );

      const orchestrator = createChannelOrchestrator(deps);

      const result = orchestrator.prepareOutbound(baseParams);

      expect(result.targetChannel).toBe("discord");
      expect(result.failoverDecision.triggered).toBe(true);
      expect(result.bridgeContext).toContain("telegram");
      expect(result.switchNotice).toContain("discord");
    });

    it("adapts message for target channel", () => {
      const orchestrator = createChannelOrchestrator(deps);

      orchestrator.prepareOutbound(baseParams);

      expect(deps.messageAdapter.adaptMessage).toHaveBeenCalledWith(baseParams.message, "telegram");
    });

    it("records outbound message in contextBridge when thread ID is present", () => {
      const orchestrator = createChannelOrchestrator(deps);

      orchestrator.prepareOutbound(baseParams);

      expect(deps.contextBridge.recordMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadCanonicalId: "canon-thread-1",
          role: "assistant",
          content: "reply",
        }),
      );
    });

    it("does not record in contextBridge when threadCanonicalId is absent", () => {
      const orchestrator = createChannelOrchestrator(deps);

      orchestrator.prepareOutbound({
        ...baseParams,
        threadCanonicalId: undefined,
      });

      expect(deps.contextBridge.recordMessage).not.toHaveBeenCalled();
    });
  });

  describe("recordDelivery", () => {
    it("delegates to healthMonitor.recordDelivery", () => {
      const orchestrator = createChannelOrchestrator(deps);

      orchestrator.recordDelivery({
        channel: "telegram",
        accountId: "default",
        success: true,
        latencyMs: 150,
      });

      expect(deps.healthMonitor.recordDelivery).toHaveBeenCalledWith({
        channel: "telegram",
        accountId: "default",
        success: true,
        latencyMs: 150,
        error: undefined,
      });
    });

    it("passes error information for failed deliveries", () => {
      const orchestrator = createChannelOrchestrator(deps);

      orchestrator.recordDelivery({
        channel: "telegram",
        accountId: "default",
        success: false,
        latencyMs: 5000,
        error: "timeout",
      });

      expect(deps.healthMonitor.recordDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "timeout",
        }),
      );
    });
  });
});
