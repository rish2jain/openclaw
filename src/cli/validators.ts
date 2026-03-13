/**
 * Shared CLI option validators.
 *
 * Centralizes validation logic for common CLI option types
 * so each command doesn't reimplement its own.
 */

export function validatePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port '${value}': must be an integer between 1 and 65535`);
  }
  return port;
}

export function validateHost(value: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error("Host cannot be empty");
  }
  // Accept IPv4, IPv6, or hostname.
  const trimmed = value.trim();
  // Basic sanity: no spaces, reasonable length.
  if (trimmed.includes(" ") || trimmed.length > 253) {
    throw new Error(`Invalid host '${value}'`);
  }
  return trimmed;
}

export function validateTransport(value: string): "stdio" | "sse" {
  if (value !== "stdio" && value !== "sse") {
    throw new Error(`Invalid transport '${value}': must be 'stdio' or 'sse'`);
  }
  return value;
}

export function validateDuration(value: string): number {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i);
  if (!match) {
    throw new Error(`Invalid duration '${value}': use format like '30s', '5m', '1h', '100ms'`);
  }
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Math.round(num * (multipliers[unit] ?? 1));
}

export function validatePositiveInteger(value: string, name: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new Error(`Invalid ${name} '${value}': must be a positive integer`);
  }
  return num;
}

export function validateEnum<T extends string>(
  value: string,
  validValues: readonly T[],
  name: string,
): T {
  if (!validValues.includes(value as T)) {
    throw new Error(`Invalid ${name} '${value}': must be one of ${validValues.join(", ")}`);
  }
  return value as T;
}
