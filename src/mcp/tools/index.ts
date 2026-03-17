/**
 * MCP tool registry.
 *
 * Aggregates all tool handlers and returns them as an array.
 */
import type { McpToolHandler } from "../types.js";
import { createAgentManageTool } from "./agent-manage.js";
import { createCareerTools } from "./career.js";
import { createChannelStatusTool } from "./channel-status.js";
import { createCronManageTool } from "./cron-manage.js";
import { createFailoverStatusTool } from "./failover-status.js";
import { createHealthDashboardTool } from "./health-dashboard.js";
import { createListSessionsTool } from "./list-sessions.js";
import { createManageConfigTool } from "./manage-config.js";
import { createMemoryQueryTool } from "./memory-query.js";
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
    createHealthDashboardTool(callGateway),
    createAgentManageTool(callGateway),
    createMemoryQueryTool(callGateway),
    createFailoverStatusTool(callGateway),
    ...createCareerTools(),
  ];
}
