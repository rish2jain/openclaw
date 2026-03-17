import { vi } from "vitest";
import type { GatewayRpc } from "../types.js";

/** Shared gateway mock for MCP tool tests. */
export function mockGateway(
  result: Record<string, unknown> = {},
): GatewayRpc & { mockResolvedValue: unknown; mock: { calls: unknown[][] } } {
  return vi.fn().mockResolvedValue(result) as GatewayRpc & {
    mockResolvedValue: unknown;
    mock: { calls: unknown[][] };
  };
}
