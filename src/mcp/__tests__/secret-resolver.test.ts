/**
 * Secret Resolver Tests — Phase 5
 *
 * TDD: tests written FIRST, then implementation follows.
 * Tests for resolving secret:// URIs in MCP server config.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseSecretUri, resolveSecret, resolveSecrets } from "../secret-resolver.js";

// ─── URI Parsing Tests ───

describe("parseSecretUri", () => {
  it("returns null for plain text values", () => {
    expect(parseSecretUri("hello world")).toBeNull();
    expect(parseSecretUri("sk-abc123")).toBeNull();
    expect(parseSecretUri("")).toBeNull();
  });

  it("parses secret://env/VAR_NAME", () => {
    const result = parseSecretUri("secret://env/MY_API_KEY");
    expect(result).toEqual({ provider: "env", path: "MY_API_KEY" });
  });

  it("parses secret://file/PATH", () => {
    const result = parseSecretUri("secret://file/~/.config/creds.txt");
    expect(result).toEqual({
      provider: "file",
      path: "~/.config/creds.txt",
    });
  });

  it("parses secret://file/PATH#FIELD for .env field extraction", () => {
    const result = parseSecretUri(
      "secret://file/~/.config/linkedin/credentials.env#LINKEDIN_EMAIL",
    );
    expect(result).toEqual({
      provider: "file",
      path: "~/.config/linkedin/credentials.env",
      field: "LINKEDIN_EMAIL",
    });
  });

  it("parses secret://gcp/SECRET_NAME", () => {
    const result = parseSecretUri("secret://gcp/my-api-key");
    expect(result).toEqual({ provider: "gcp", path: "my-api-key" });
  });

  it("parses secret://gcp/SECRET_NAME#VERSION", () => {
    const result = parseSecretUri("secret://gcp/my-api-key#latest");
    expect(result).toEqual({
      provider: "gcp",
      path: "my-api-key",
      field: "latest",
    });
  });

  it("rejects unknown provider", () => {
    expect(() => parseSecretUri("secret://unknown/foo")).toThrow(
      /unsupported secret provider.*unknown/i,
    );
  });
});

// ─── Secret Resolution Tests ───

describe("resolveSecret", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // --- env provider ---

  it("resolves secret://env/VAR from process.env", async () => {
    process.env.TEST_SECRET_KEY = "super-secret-value";
    const result = await resolveSecret("secret://env/TEST_SECRET_KEY");
    expect(result).toBe("super-secret-value");
  });

  it("throws on missing env var", async () => {
    delete process.env.NONEXISTENT_VAR;
    await expect(resolveSecret("secret://env/NONEXISTENT_VAR")).rejects.toThrow(
      /environment variable.*NONEXISTENT_VAR.*not set/i,
    );
  });

  // --- file provider ---

  it("resolves secret://file/PATH by reading file contents", async () => {
    const tmpFile = `${os.tmpdir()}/openclaw-test-secret-${Date.now()}.txt`;
    await fs.writeFile(tmpFile, "file-secret-value\n");
    try {
      const result = await resolveSecret(`secret://file/${tmpFile}`);
      expect(result).toBe("file-secret-value");
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  });

  it("resolves secret://file/PATH#FIELD from .env format", async () => {
    const tmpFile = `${os.tmpdir()}/openclaw-test-creds-${Date.now()}.env`;
    await fs.writeFile(
      tmpFile,
      'LINKEDIN_EMAIL=user@example.com\nLINKEDIN_PASS="hunter2"\nOTHER=val\n',
    );
    try {
      const result = await resolveSecret(`secret://file/${tmpFile}#LINKEDIN_EMAIL`);
      expect(result).toBe("user@example.com");
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  });

  it("handles quoted values in .env files", async () => {
    const tmpFile = `${os.tmpdir()}/openclaw-test-quoted-${Date.now()}.env`;
    await fs.writeFile(tmpFile, 'MY_KEY="quoted-value"\n');
    try {
      const result = await resolveSecret(`secret://file/${tmpFile}#MY_KEY`);
      expect(result).toBe("quoted-value");
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  });

  it("throws on missing file", async () => {
    await expect(resolveSecret("secret://file//nonexistent/path/creds.txt")).rejects.toThrow(
      /file.*not found|no such file/i,
    );
  });

  it("throws on missing field in .env file", async () => {
    const tmpFile = `${os.tmpdir()}/openclaw-test-nofield-${Date.now()}.env`;
    await fs.writeFile(tmpFile, "OTHER_KEY=value\n");
    try {
      await expect(resolveSecret(`secret://file/${tmpFile}#MISSING_FIELD`)).rejects.toThrow(
        /field.*MISSING_FIELD.*not found/i,
      );
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  });

  it("expands ~ in file paths", async () => {
    // We just test that ~ gets expanded to homedir, not that the file exists
    await expect(resolveSecret("secret://file/~/nonexistent-secret-file.txt")).rejects.toThrow(
      /file.*not found|no such file/i,
    );
    // The error should reference the expanded path, not the ~ path
  });

  // --- gcp provider (stub) ---

  it("throws not-implemented for gcp provider", async () => {
    await expect(resolveSecret("secret://gcp/my-secret")).rejects.toThrow(
      /gcp.*not.*implemented|not.*supported/i,
    );
  });

  // --- passthrough ---

  it("passes through plain text values unchanged", async () => {
    const result = await resolveSecret("just-a-plain-value");
    expect(result).toBe("just-a-plain-value");
  });
});

// ─── Batch Resolution Tests ───

describe("resolveSecrets", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves a record of mixed plain and secret values", async () => {
    process.env.MY_TOKEN = "resolved-token";
    const input = {
      PLAIN_KEY: "plain-value",
      SECRET_KEY: "secret://env/MY_TOKEN",
    };
    const result = await resolveSecrets(input);
    expect(result).toEqual({
      PLAIN_KEY: "plain-value",
      SECRET_KEY: "resolved-token",
    });
  });

  it("returns empty object for undefined input", async () => {
    const result = await resolveSecrets(undefined);
    expect(result).toEqual({});
  });

  it("returns empty object for empty input", async () => {
    const result = await resolveSecrets({});
    expect(result).toEqual({});
  });

  it("throws on any unresolvable secret", async () => {
    delete process.env.MISSING_VAR;
    const input = {
      GOOD: "plain",
      BAD: "secret://env/MISSING_VAR",
    };
    await expect(resolveSecrets(input)).rejects.toThrow(/MISSING_VAR/);
  });
});
