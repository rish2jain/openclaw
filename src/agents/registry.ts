/**
 * Lightweight agent registry.
 *
 * Agents register their identity, tools, and skills at gateway startup.
 * The default agent's tool set is augmented with bridge tools from all
 * registered agents.
 */

import type { McpToolHandler } from "../mcp/types.js";

export type AgentDefinition = {
  id: string;
  name: string;
  emoji?: string;
  description: string;
  buildSystemPrompt: (ctx: unknown) => string;
  getTools: () => McpToolHandler[];
  getSkillDirs: () => string[];
  getBridgeTools?: () => McpToolHandler[];
  onActivate?: () => Promise<void>;
};

export type AgentRegistry = {
  register(def: AgentDefinition): void;
  get(id: string): AgentDefinition | undefined;
  list(): AgentDefinition[];
  getToolsForAgent(id: string): McpToolHandler[];
  getBridgeToolsForDefault(): McpToolHandler[];
};

export function createAgentRegistry(): AgentRegistry {
  const agents = new Map<string, AgentDefinition>();

  return {
    register(def) {
      if (agents.has(def.id)) {
        throw new Error(`Agent '${def.id}' is already registered.`);
      }
      agents.set(def.id, def);
    },

    get(id) {
      return agents.get(id);
    },

    list() {
      return Array.from(agents.values());
    },

    getToolsForAgent(id) {
      const agent = agents.get(id);
      return agent ? agent.getTools() : [];
    },

    getBridgeToolsForDefault() {
      const bridge: McpToolHandler[] = [];
      for (const agent of agents.values()) {
        if (agent.getBridgeTools) {
          bridge.push(...agent.getBridgeTools());
        }
      }
      return bridge;
    },
  };
}
