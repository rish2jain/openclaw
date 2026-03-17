import { describe, it, expect } from "vitest";
import {
  parseStringArg,
  parseNumberArg,
  parseBooleanArg,
  parseEnumArg,
  coerceConfigValue,
  ArgError,
  argErrorResult,
} from "./arg-utils.js";

describe("parseStringArg", () => {
  it("returns the string value when present", () => {
    expect(parseStringArg({ name: "hello" }, "name")).toBe("hello");
  });

  it("returns undefined for missing key when not required", () => {
    expect(parseStringArg({}, "name")).toBeUndefined();
  });

  it("returns undefined for null value when not required", () => {
    expect(parseStringArg({ name: null }, "name")).toBeUndefined();
  });

  it("throws ArgError for missing key when required", () => {
    expect(() => parseStringArg({}, "name", true)).toThrow(ArgError);
    expect(() => parseStringArg({}, "name", true)).toThrow("'name' is required");
  });

  it("throws ArgError for null value when required", () => {
    expect(() => parseStringArg({ name: null }, "name", true)).toThrow(ArgError);
  });

  it("throws ArgError when value is not a string", () => {
    expect(() => parseStringArg({ name: 42 }, "name")).toThrow("'name' must be a string");
    expect(() => parseStringArg({ name: true }, "name")).toThrow(ArgError);
    expect(() => parseStringArg({ name: [] }, "name")).toThrow(ArgError);
  });

  it("returns empty string as a valid string value", () => {
    expect(parseStringArg({ name: "" }, "name")).toBe("");
  });
});

describe("parseNumberArg", () => {
  it("returns the number value when present", () => {
    expect(parseNumberArg({ count: 5 }, "count")).toBe(5);
  });

  it("coerces a string to a number", () => {
    expect(parseNumberArg({ count: "42" }, "count")).toBe(42);
  });

  it("returns default when value is undefined", () => {
    expect(parseNumberArg({}, "count", { default: 10 })).toBe(10);
  });

  it("returns undefined when value is undefined and no default", () => {
    expect(parseNumberArg({}, "count")).toBeUndefined();
  });

  it("returns default when value is null", () => {
    expect(parseNumberArg({ count: null }, "count", { default: 10 })).toBe(10);
  });

  it("throws ArgError for NaN values", () => {
    expect(() => parseNumberArg({ count: "abc" }, "count")).toThrow("'count' must be a number");
  });

  it("throws ArgError when value is below min", () => {
    expect(() => parseNumberArg({ count: 0 }, "count", { min: 1 })).toThrow("'count' must be >= 1");
  });

  it("throws ArgError when value is above max", () => {
    expect(() => parseNumberArg({ count: 200 }, "count", { max: 100 })).toThrow(
      "'count' must be <= 100",
    );
  });

  it("accepts value at min boundary", () => {
    expect(parseNumberArg({ count: 1 }, "count", { min: 1 })).toBe(1);
  });

  it("accepts value at max boundary", () => {
    expect(parseNumberArg({ count: 100 }, "count", { max: 100 })).toBe(100);
  });

  it("handles negative numbers", () => {
    expect(parseNumberArg({ count: -5 }, "count")).toBe(-5);
  });

  it("handles zero", () => {
    expect(parseNumberArg({ count: 0 }, "count")).toBe(0);
  });

  it("handles floating point numbers", () => {
    expect(parseNumberArg({ count: 3.14 }, "count")).toBeCloseTo(3.14);
  });
});

describe("parseBooleanArg", () => {
  it("returns undefined for missing key", () => {
    expect(parseBooleanArg({}, "flag")).toBeUndefined();
  });

  it("returns undefined for null value", () => {
    expect(parseBooleanArg({ flag: null }, "flag")).toBeUndefined();
  });

  it("returns boolean values directly", () => {
    expect(parseBooleanArg({ flag: true }, "flag")).toBe(true);
    expect(parseBooleanArg({ flag: false }, "flag")).toBe(false);
  });

  it("coerces truthy string values", () => {
    expect(parseBooleanArg({ flag: "true" }, "flag")).toBe(true);
    expect(parseBooleanArg({ flag: "1" }, "flag")).toBe(true);
    expect(parseBooleanArg({ flag: "yes" }, "flag")).toBe(true);
  });

  it("coerces falsy string values", () => {
    expect(parseBooleanArg({ flag: "false" }, "flag")).toBe(false);
    expect(parseBooleanArg({ flag: "0" }, "flag")).toBe(false);
    expect(parseBooleanArg({ flag: "no" }, "flag")).toBe(false);
  });

  it("throws ArgError for unrecognized string values", () => {
    expect(() => parseBooleanArg({ flag: "maybe" }, "flag")).toThrow("'flag' must be a boolean");
  });

  it("throws ArgError for non-boolean non-string values", () => {
    expect(() => parseBooleanArg({ flag: 42 }, "flag")).toThrow(ArgError);
    expect(() => parseBooleanArg({ flag: [] }, "flag")).toThrow(ArgError);
  });
});

describe("parseEnumArg", () => {
  const values = ["a", "b", "c"] as const;

  it("returns the value when it matches an enum member", () => {
    expect(parseEnumArg({ key: "a" }, "key", values)).toBe("a");
    expect(parseEnumArg({ key: "c" }, "key", values)).toBe("c");
  });

  it("returns undefined for missing key when not required", () => {
    expect(parseEnumArg({}, "key", values)).toBeUndefined();
  });

  it("throws ArgError for missing key when required", () => {
    expect(() => parseEnumArg({}, "key", values, true)).toThrow(ArgError);
  });

  it("throws ArgError when value is not in the enum", () => {
    expect(() => parseEnumArg({ key: "d" }, "key", values)).toThrow(
      "'key' must be one of: a, b, c",
    );
  });

  it("throws ArgError for non-string values", () => {
    expect(() => parseEnumArg({ key: 42 }, "key", values)).toThrow(ArgError);
  });
});

describe("coerceConfigValue", () => {
  it("returns non-string values unchanged", () => {
    expect(coerceConfigValue(42)).toBe(42);
    expect(coerceConfigValue(true)).toBe(true);
    expect(coerceConfigValue(null)).toBeNull();
  });

  it("coerces 'true' to boolean true", () => {
    expect(coerceConfigValue("true")).toBe(true);
  });

  it("coerces 'false' to boolean false", () => {
    expect(coerceConfigValue("false")).toBe(false);
  });

  it("coerces 'null' to null", () => {
    expect(coerceConfigValue("null")).toBeNull();
  });

  it("coerces numeric strings to numbers", () => {
    expect(coerceConfigValue("42")).toBe(42);
    expect(coerceConfigValue("3.14")).toBeCloseTo(3.14);
    expect(coerceConfigValue("0")).toBe(0);
    expect(coerceConfigValue("-10")).toBe(-10);
  });

  it("returns plain strings unchanged", () => {
    expect(coerceConfigValue("hello")).toBe("hello");
    expect(coerceConfigValue("some text")).toBe("some text");
  });

  it("does not coerce empty or whitespace-only strings to numbers", () => {
    expect(coerceConfigValue("")).toBe("");
    expect(coerceConfigValue("   ")).toBe("   ");
  });
});

describe("ArgError", () => {
  it("has name 'ArgError'", () => {
    const err = new ArgError("test");
    expect(err.name).toBe("ArgError");
    expect(err.message).toBe("test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("argErrorResult", () => {
  it("formats an Error into an MCP error result", () => {
    const result = argErrorResult(new Error("bad input"));
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
    expect(result.content[0]?.text).toBe("Error: bad input");
  });

  it("formats a non-Error value into an MCP error result", () => {
    const result = argErrorResult("something went wrong");
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Error: something went wrong");
  });

  it("formats an ArgError correctly", () => {
    const result = argErrorResult(new ArgError("missing field"));
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Error: missing field");
  });
});
