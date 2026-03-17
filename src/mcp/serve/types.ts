/**
 * MCP (Model Context Protocol) JSON-RPC types.
 *
 * Implements the MCP specification for tool/resource servers
 * using JSON-RPC 2.0 over stdio and SSE transports.
 */

export const MCP_PROTOCOL_VERSION = "2024-11-05";

// -- JSON-RPC 2.0 base types --

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
};

export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// -- MCP error codes --

export const McpErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// -- MCP capability types --

export type McpServerCapabilities = {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, never>;
};

export type McpClientCapabilities = {
  roots?: { listChanged?: boolean };
  sampling?: Record<string, never>;
};

// -- MCP initialize types --

export type McpInitializeParams = {
  protocolVersion: string;
  capabilities: McpClientCapabilities;
  clientInfo: { name: string; version: string };
};

export type McpInitializeResult = {
  protocolVersion: string;
  capabilities: McpServerCapabilities;
  serverInfo: { name: string; version: string };
};

// -- MCP tool types --

export type McpToolDefinition = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, McpToolPropertySchema>;
    required?: string[];
  };
};

export type McpToolPropertySchema = {
  type: string | string[];
  description?: string;
  enum?: string[];
  items?: McpToolPropertySchema;
  default?: unknown;
};

export type McpToolCallParams = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type McpToolCallResult = {
  content: McpContentItem[];
  isError?: boolean;
};

export type McpContentItem = McpTextContent | McpResourceContent;

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpResourceContent = {
  type: "resource";
  /** Top-level text is absent on resource items; use resource.text instead. */
  text?: undefined;
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
};

// -- MCP resource types --

export type McpResourceDefinition = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
};

export type McpResourceTemplateDefinition = {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
};

export type McpReadResourceParams = {
  uri: string;
};

export type McpReadResourceResult = {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
  }>;
};

// -- Gateway RPC (shared by tools and resources) --

export type GatewayRpc = <T = Record<string, unknown>>(
  method: string,
  params?: unknown,
) => Promise<T>;

// -- Tool handler contract --

export type McpToolHandler = {
  definition: McpToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<McpToolCallResult>;
};
