/**
 * MCP tool registry.
 *
 * Aggregates all tool handlers and returns them as an array.
 */
import type { McpToolHandler } from "../types.js";
import { createChannelStatusTool } from "./channel-status.js";
import { createCronManageTool } from "./cron-manage.js";
import { createListSessionsTool } from "./list-sessions.js";
import { createManageConfigTool } from "./manage-config.js";
import { createQuerySessionTool } from "./query-session.js";
import { createSendMessageTool } from "./send-message.js";

type GatewayRpc = <T = Record<string, unknown>>(method: string, params?: unknown) => Promise<T>;

export function getAllTools(callGateway: GatewayRpc): McpToolHandler[] {
  return [
    createSendMessageTool(callGateway),
    createChannelStatusTool(callGateway),
    createListSessionsTool(callGateway),
    createQuerySessionTool(callGateway),
    createManageConfigTool(callGateway),
    createCronManageTool(callGateway),
  ];
}
