import { readFile, mkdtemp, writeFile, rm, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { containsRedactionMarker, createLineRedactor, createRedactor, loadRedactionRules, REDACTION_MARKER, snapshotSecrets } from "../src/redaction.js";
import { TOOL_MODES } from "../src/server.js";

describe("response redaction", () => {
  it("masks split log tokens, multiline PEM and oversized lines", () => {
    const secret = "opaque-log-secret-123456";
    const filter = createLineRedactor(createRedactor([secret]));
    const input = Buffer.from(`${secret}\n-----BEGIN PRIVATE KEY-----\nprivate body\n-----END PRIVATE KEY-----\n${"x".repeat(70000)}${secret}\nlast`);
    const output: Buffer[] = [];
    for (let index = 0; index < input.length; index += 11) output.push(filter(input.subarray(index, index + 11)));
    output.push(filter(Buffer.alloc(0), true));
    const text = Buffer.concat(output).toString("utf8");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("private body");
    expect(text.endsWith("\nlast")).toBe(true);
    expect(text.length).toBeLessThan(200);
    expect(filter.getSuppressedLongLines()).toBe(1);
  });
  it("loads bounded literal/key rules without exposing invalid file content", async () => {
    const root = await mkdtemp(join(tmpdir(), "workforge-rules-"));
    try {
      const path = join(root, "rules.json");
      await writeFile(path, JSON.stringify({ version: 1, literals: ["literal.*[secret]"], keyNames: ["deploy_phrase"] }));
      const rules = loadRedactionRules(path, ["existing-secret"]);
      const redact = createRedactor(rules.knownSecrets, { extraKeyNames: rules.extraKeyNames });
      expect(redact('deploy_phrase="private value" literal.*[secret]').value).toBe(`deploy_phrase=${REDACTION_MARKER} ${REDACTION_MARKER}`);
      expect(redact("literalABsecret").redactionCount).toBe(0);
      await expect(async () => loadRedactionRules("relative.json", [])).rejects.toThrow("WORKFORGE_MCP_REDACTION_RULES");
      const alias = join(root, "linked.json"); await link(path, alias);
      expect(() => loadRedactionRules(alias, [])).toThrow("WORKFORGE_MCP_REDACTION_RULES");
      await rm(alias);
      await writeFile(path, 'PRIVATE_INVALID_CONTENT');
      try { loadRedactionRules(path, []); throw new Error("expected rejection"); }
      catch (error) { expect(String(error)).not.toContain("PRIVATE_INVALID_CONTENT"); }
      await writeFile(path, JSON.stringify({ version: 1, literals: Array(257).fill("oversized-value"), keyNames: [] }));
      expect(() => loadRedactionRules(path, [])).toThrow("configured limits");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("limits opt-in entropy masking to assignments while preserving hashes and IDs", () => {
    const value = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/";
    const raw = `API_SIGNING=${value}`;
    expect(createRedactor()(raw).value).toBe(raw);
    const redact = createRedactor([], { entropy: true });
    expect(redact(raw).value).toBe(`API_SIGNING=${REDACTION_MARKER}`);
    expect(redact({ sha256: "abcde0123456789".repeat(4) + "abcd1234", standalone: value }).redactionCount).toBe(0);
    expect(redact(`commit=${"abcdef0123".repeat(4)} id=shell_${"abcdef01".repeat(4)}`).redactionCount).toBe(0);
  });
  it("snapshots credential values without path values or unlimited collection", () => {
    const result = snapshotSecrets({ PWD: "/work", SSH_AUTH_SOCK: "/socket", PASSWORD_STORE_DIR: "/secrets",
      API_TOKEN_PATH: "C:\\file.txt", API_KEY: "synthetic-value", SERVICE_AUTH: "another-value",
      KEY: "/path/not-a-key", PASSWD: "test-password", BIG_SECRET: "x".repeat(4097) });
    expect(result.values.sort()).toEqual(["another-value", "synthetic-value", "test-password"]);
    expect(result.skipped).toBe(1);
    expect(snapshotSecrets(Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`TOKEN_${i}`, `secret-${i.toString().padStart(4, "0")}`]))).skipped).toBe(1);
  });

  it("redacts exact values including JSON escapes and known boundary fragments", () => {
    const secret = 'synthetic"\\secret-123456789';
    const redact = createRedactor([secret]);
    const output = redact({ text: `before ${secret} after`, nested: [secret.slice(0, 12), secret.slice(-12)] });
    expect(output.redactionCount).toBe(3);
    expect(output.value).toEqual({ text: `before ${REDACTION_MARKER} after`, nested: [REDACTION_MARKER, REDACTION_MARKER] });
    expect(JSON.stringify(output.value)).not.toContain("123456789");
    expect(containsRedactionMarker(output.value)).toBe(true);
    expect(redact({ sha256: "a".repeat(64), id: `shell_${"b".repeat(32)}`, normal: "hello" }).redactionCount).toBe(0);
  });

  it("masks token patterns, assignments, URL passwords and open PEM while retaining newlines", () => {
    const redact = createRedactor();
    for (const secret of ["ghp_" + "x".repeat(36), "sk-ant-" + "x".repeat(30), "AKIA" + "A".repeat(16)]) {
      expect(redact(secret).value).toBe(REDACTION_MARKER);
    }
    const output = redact('password="private value"\nAPI_KEY=synthetic-value\nAuthorization: Bearer abcdefghijkl\npostgres://user:private@host/db');
    expect(output.value).not.toMatch(/private|synthetic-value|abcdefghijkl/u);
    const begin = "-----BEGIN PRIVATE KEY-----\r\nprivate-data\r\n";
    const end = "private-data\n-----END PRIVATE KEY-----\nnormal";
    expect(redact(begin).value).toBe(`${REDACTION_MARKER}\r\n${REDACTION_MARKER}\r\n`);
    expect(redact(end).value).toBe(`${REDACTION_MARKER}\n${REDACTION_MARKER}\nnormal`);
    expect(redact("unidentified-middle-page").redactionCount).toBe(0);
  });

  it("bounds processing of large adversarial assignment and PEM strings", () => {
    const redact = createRedactor();
    const start = performance.now();
    const input = ("password=\" ".repeat(1000) + "-----BEGIN PRIVATE KEY-----\n").repeat(600);
    expect(redact(input).redactionCount).toBeGreaterThan(0);
    expect(performance.now() - start).toBeLessThan(5000);
  });

  it("keeps every tool registration behind the response/error boundary", async () => {
    const source = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
    expect(source.match(/server\.registerTool\(/gu)).toHaveLength(1);
    expect(source.match(/registerTool\(\s*"/gu)).toHaveLength(Object.keys(TOOL_MODES).length);
  });
});
