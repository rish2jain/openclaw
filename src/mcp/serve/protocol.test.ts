import { PassThrough } from "node:stream";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseJsonRpcMessage,
  serializeJsonRpcMessage,
  createStdioTransport,
  createJsonRpcResponse,
  createJsonRpcErrorResponse,
} from "./protocol.js";
import type { JsonRpcMessage } from "./types.js";

describe("parseJsonRpcMessage", () => {
  it("parses a valid JSON-RPC 2.0 request", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    const result = parseJsonRpcMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.jsonrpc).toBe("2.0");
    expect((result as { method: string }).method).toBe("tools/list");
  });

  it("parses a valid JSON-RPC 2.0 notification (no id)", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    const result = parseJsonRpcMessage(raw);
    expect(result).not.toBeNull();
  });

  it("parses a valid JSON-RPC 2.0 response", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [] },
    });
    const result = parseJsonRpcMessage(raw);
    expect(result).not.toBeNull();
  });

  it("returns null for non-2.0 jsonrpc version", () => {
    const raw = JSON.stringify({ jsonrpc: "1.0", id: 1, method: "test" });
    expect(parseJsonRpcMessage(raw)).toBeNull();
  });

  it("returns null for missing jsonrpc field", () => {
    const raw = JSON.stringify({ id: 1, method: "test" });
    expect(parseJsonRpcMessage(raw)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseJsonRpcMessage("{bad json")).toBeNull();
    expect(parseJsonRpcMessage("")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseJsonRpcMessage('"hello"')).toBeNull();
    expect(parseJsonRpcMessage("42")).toBeNull();
  });
});

describe("serializeJsonRpcMessage", () => {
  it("serializes a message to JSON string", () => {
    const msg: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: { ok: true } };
    const serialized = serializeJsonRpcMessage(msg);
    const parsed = JSON.parse(serialized);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.result.ok).toBe(true);
  });
});

describe("createJsonRpcResponse", () => {
  it("creates a well-formed response", () => {
    const resp = createJsonRpcResponse(42, { tools: [] });
    expect(resp.jsonrpc).toBe("2.0");
    expect(resp.id).toBe(42);
    expect(resp.result).toEqual({ tools: [] });
    expect(resp.error).toBeUndefined();
  });

  it("works with string id", () => {
    const resp = createJsonRpcResponse("req-1", null);
    expect(resp.id).toBe("req-1");
    expect(resp.result).toBeNull();
  });
});

describe("createJsonRpcErrorResponse", () => {
  it("creates a well-formed error response", () => {
    const resp = createJsonRpcErrorResponse(1, -32600, "Invalid Request");
    expect(resp.jsonrpc).toBe("2.0");
    expect(resp.id).toBe(1);
    expect(resp.error).toBeDefined();
    expect(resp.error!.code).toBe(-32600);
    expect(resp.error!.message).toBe("Invalid Request");
    expect(resp.result).toBeUndefined();
  });

  it("includes optional data field", () => {
    const resp = createJsonRpcErrorResponse(1, -32602, "bad params", { field: "name" });
    expect(resp.error!.data).toEqual({ field: "name" });
  });
});

describe("createStdioTransport", () => {
  let input: PassThrough;
  let output: PassThrough;

  beforeEach(() => {
    input = new PassThrough();
    output = new PassThrough();
  });

  afterEach(() => {
    input.destroy();
    output.destroy();
  });

  it("receives and dispatches valid JSON-RPC messages", async () => {
    const received: JsonRpcMessage[] = [];
    const transport = createStdioTransport({
      onMessage: (msg) => received.push(msg),
      input,
      output,
    });

    transport.start();

    const msg = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
    });
    input.write(msg + "\n");

    // Allow readline to process
    await new Promise((r) => setTimeout(r, 20));

    expect(received).toHaveLength(1);
    expect((received[0] as { method: string }).method).toBe("ping");

    transport.close();
  });

  it("ignores empty lines", async () => {
    const received: JsonRpcMessage[] = [];
    const transport = createStdioTransport({
      onMessage: (msg) => received.push(msg),
      input,
      output,
    });

    transport.start();

    input.write("\n");
    input.write("   \n");

    await new Promise((r) => setTimeout(r, 20));

    expect(received).toHaveLength(0);

    transport.close();
  });

  it("ignores invalid JSON messages", async () => {
    const received: JsonRpcMessage[] = [];
    const transport = createStdioTransport({
      onMessage: (msg) => received.push(msg),
      input,
      output,
    });

    transport.start();

    input.write("not json\n");
    input.write('{"jsonrpc":"1.0"}\n'); // wrong version

    await new Promise((r) => setTimeout(r, 20));

    expect(received).toHaveLength(0);

    transport.close();
  });

  it("sends messages to output with newline", async () => {
    const transport = createStdioTransport({
      onMessage: () => {},
      input,
      output,
    });

    transport.start();

    const msg: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: {} };
    transport.send(msg);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      output.on("data", (chunk) => {
        chunks.push(chunk as Buffer);
        resolve();
      });
    });

    const written = Buffer.concat(chunks).toString();
    expect(written).toContain('"jsonrpc":"2.0"');
    expect(written.endsWith("\n")).toBe(true);

    transport.close();
  });
});
