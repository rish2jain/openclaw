import { vi } from "vitest";

/** Shared gateway mock for MCP tool tests. */
export function mockGateway(result: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(result);
}
