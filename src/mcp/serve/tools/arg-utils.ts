/**
 * Shared argument parsing utilities for MCP tools.
 * Provides type-safe extraction and coercion from `Record<string, unknown>`.
 */

export function parseStringArg(
  args: Record<string, unknown>,
  key: string,
  required?: boolean,
): string | undefined {
  const val = args[key];
  if (val === undefined || val === null) {
    if (required) {
      throw new ArgError(`'${key}' is required`);
    }
    return undefined;
  }
  if (typeof val !== "string") {
    throw new ArgError(`'${key}' must be a string`);
  }
  return val;
}

export function parseNumberArg(
  args: Record<string, unknown>,
  key: string,
  opts?: { min?: number; max?: number; default?: number },
): number | undefined {
  const val = args[key];
  if (val === undefined || val === null) {
    return opts?.default;
  }
  const num = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(num)) {
    throw new ArgError(`'${key}' must be a number`);
  }
  if (opts?.min !== undefined && num < opts.min) {
    throw new ArgError(`'${key}' must be >= ${opts.min}`);
  }
  if (opts?.max !== undefined && num > opts.max) {
    throw new ArgError(`'${key}' must be <= ${opts.max}`);
  }
  return num;
}

export function parseBooleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const val = args[key];
  if (val === undefined || val === null) {
    return undefined;
  }
  if (typeof val === "boolean") {
    return val;
  }
  if (typeof val === "string") {
    if (val === "true" || val === "1" || val === "yes") {
      return true;
    }
    if (val === "false" || val === "0" || val === "no") {
      return false;
    }
  }
  throw new ArgError(`'${key}' must be a boolean`);
}

export function parseEnumArg<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
  required?: boolean,
): T | undefined {
  const val = parseStringArg(args, key, required);
  if (val === undefined) {
    return undefined;
  }
  if (!values.includes(val as T)) {
    throw new ArgError(`'${key}' must be one of: ${values.join(", ")}`);
  }
  return val as T;
}

/** Coerce a string value to its likely JS type (for config.set). */
export function coerceConfigValue(val: unknown): unknown {
  if (typeof val !== "string") {
    return val;
  }
  if (val === "true") {
    return true;
  }
  if (val === "false") {
    return false;
  }
  if (val === "null") {
    return null;
  }
  const num = Number(val);
  if (!Number.isNaN(num) && val.trim() !== "") {
    return num;
  }
  return val;
}

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgError";
  }
}

export function argErrorResult(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
