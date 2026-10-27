import { access, chmod, link, mkdir, mkdtemp, open, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { listDirectory, readImageFile, readTextFile, readTextFiles, replaceText, searchFiles, writeTextFile } from "../src/filesystem.js";
import { createServer, enabledToolNames, parseReadOnlyMode } from "../src/server.js";
import { parseBridgeArguments, parseProfileId } from "../src/profile.js";
import { readTextStream, suggestRelatedFiles } from "../src/reading.js";
import * as processTools from "../src/process.js";
import * as workstation from "../src/workstation.js";
import * as fs from "node:fs/promises";
import { replaceTextMulti } from "../src/filesystem.js";
import { applyUnifiedPatch } from "../src/patch.js";
vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>() }));
import type { ProjectContext, ProjectProfile } from "../src/profile.js";

const temporaryRoots: string[] = [];

async function fixture(): Promise<{ context: ProjectContext; primary: string; foreign: string; outside: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workstation-files-")));
  temporaryRoots.push(root);
  const primary = join(root, "primary");
  const foreign = join(root, "foreign");
  const outside = join(root, "outside 한글");
  const engineRoot = join(root, "workforge-mcp");
  await Promise.all([
    mkdir(primary, { recursive: true }),
    mkdir(foreign, { recursive: true }),
    mkdir(outside, { recursive: true }),
    mkdir(engineRoot, { recursive: true }),
  ]);
  const profile = Object.freeze({
    id: "test-profile",
    displayName: "Test Profile",
    appName: "Test Workstation",
    serverName: "test-workstation",
    defaultWorkingDirectoryRelative: ".",
    bootstrapFiles: Object.freeze([]),
    identityMarkers: Object.freeze([]),
    primaryRoot: primary,
  }) as unknown as ProjectProfile;
  const context = Object.freeze({
    profile,
    primaryRoot: primary,
    defaultWorkingDirectory: primary,
    engineRoot,
    managedProjectRoots: Object.freeze([
      Object.freeze({ profileId: "test-profile", primaryRoot: primary }),
      Object.freeze({ profileId: "foreign-profile", primaryRoot: foreign }),
    ]),
  });
  return { context, primary, foreign, outside };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workstation filesystem", () => {
  it("preserves existing CRLF-only line endings for writes and replacements", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "lines.txt");
    await writeFile(path, "one\r\ntwo\r\n");
    const original = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    const written = await writeTextFile({ context, path, expectedSha256: original.sha256, content: original.text.replace("two", "changed"), createParents: false });
    expect(await readFile(path, "utf8")).toBe("one\r\nchanged\r\n");
    await replaceText({ context, path, expectedSha256: written.sha256, oldText: "changed", newText: "two\nextra" });
    expect(await readFile(path, "utf8")).toBe("one\r\ntwo\r\nextra\r\n");
    for (const content of ["one\ntwo\n", "one\r\ntwo\n"]) {
      await writeFile(path, content);
      const current = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
      await writeTextFile({ context, path, expectedSha256: current.sha256, content: "new\ntext\n", createParents: false });
      expect(await readFile(path, "utf8")).toBe("new\ntext\n");
    }
  });
  it("reports exclusive-write fallback when publishing a new patch without hardlink support", async () => {
    const { context, primary } = await fixture();
    vi.spyOn(fs, "link").mockRejectedValue(Object.assign(new Error("unsupported"), { code: "ENOTSUP" }));
    const result = await applyUnifiedPatch({ context, patch: "--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+new\n",
      expectedSha256: { "new.txt": "absent" } });
    expect(await readFile(join(primary, "new.txt"), "utf8")).toBe("new\n");
    expect(result.publicationWarnings).toEqual([{ path: join(primary, "new.txt"), code: "exclusive_write_fallback" }]);
  });

  it("validates multi-file edits before any write and rolls back a partial rename failure", async () => {
    const { context, primary } = await fixture();
    const paths = [join(primary, "a.txt"), join(primary, "b.txt")];
    await Promise.all(paths.map(path => writeFile(path, "before\n")));
    const files = await Promise.all(paths.map(async path => ({ path, expectedSha256: (await readTextFile({ context, path, startLine: 1, maxLines: 10 })).sha256,
      edits: [{ oldText: "before", newText: "after" }] })));
    await expect(replaceTextMulti({ context, files: [files[0]!, { ...files[1]!, edits: [{ oldText: "missing", newText: "x" }] }] })).rejects.toThrow("files[1]");
    expect(await readFile(paths[0]!, "utf8")).toBe("before\n");
    const rename = fs.rename;
    let calls = 0;
    const mock = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(from).includes(".workforge-multi-") && ++calls === 2) throw new Error("injected commit failure");
      return rename(from, to);
    });
    try { await expect(replaceTextMulti({ context, files })).rejects.toThrow("rollback=complete"); }
    finally { mock.mockRestore(); }
    for (const path of paths) expect(await readFile(path, "utf8")).toBe("before\n");
    expect((await replaceTextMulti({ context, files })).files).toHaveLength(2);
    for (const path of paths) expect(await readFile(path, "utf8")).toBe("after\n");
  });

  it("applies unified context and new files while rejecting deletions and ambiguous context", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "a.txt");
    await writeFile(path, "before\n");
    const { sha256 } = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    await applyUnifiedPatch({ context, patch: "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-before\n+after\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+new\n",
      expectedSha256: { "a.txt": sha256, "new.txt": "absent" } });
    expect(await readFile(path, "utf8")).toBe("after\n");
    expect(await readFile(join(primary, "new.txt"), "utf8")).toBe("new\n");
    await expect(applyUnifiedPatch({ context, patch: "--- a/a.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-after\n", expectedSha256: { "a.txt": sha256 } })).rejects.toThrow("Deletion");
    await writeFile(path, "same\nsame\n");
    const duplicated = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    await expect(applyUnifiedPatch({ context, patch: "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-same\n+changed\n", expectedSha256: { "a.txt": duplicated.sha256 } })).rejects.toThrow("multiple");
  });

  it("accepts CRLF patch transport while preserving target line endings", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "a.txt");
    const patch = "--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-before\n+after\n";
    for (const [source, transport, expected] of [["before\n", "\r\n", "after\n"], ["before\r\n", "\n", "after\r\n"], ["before\r\n", "\r\n", "after\r\n"]]) {
      await writeFile(path, source!);
      const { sha256 } = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
      await applyUnifiedPatch({ context, patch: patch.replaceAll("\n", transport!), expectedSha256: { "a.txt": sha256 } });
      expect(await readFile(path, "utf8")).toBe(expected);
    }
    await writeFile(path, "before");
    const { sha256 } = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    await applyUnifiedPatch({ context, patch: "--- a/a.txt\r\n+++ b/a.txt\r\n@@ -1 +1 @@\r\n-before\r\n\\ No newline at end of file\r\n+after\r\n\\ No newline at end of file\r\n", expectedSha256: { "a.txt": sha256 } });
    expect(await readFile(path, "utf8")).toBe("after");
  });

  it("creates new patch parent directories only after validation and removes them on failure", async () => {
    const { context, primary, foreign } = await fixture();
    const patch = "--- /dev/null\n+++ b/newdir/sub/file.txt\n@@ -0,0 +1 @@\n+new\n";
    const existing = join(primary, "existing.txt");
    await writeFile(existing, "before\n");
    const badPatch = patch + "--- a/existing.txt\n+++ b/existing.txt\n@@ -1 +1 @@\n-before\n+after\n";
    await expect(applyUnifiedPatch({ context, patch: badPatch, expectedSha256: { "newdir/sub/file.txt": "absent", "existing.txt": "a".repeat(64) } })).rejects.toThrow();
    await expect(fs.access(join(primary, "newdir"))).rejects.toThrow();
    await applyUnifiedPatch({ context, patch, expectedSha256: { "newdir/sub/file.txt": "absent" } });
    expect(await readFile(join(primary, "newdir/sub/file.txt"), "utf8")).toBe("new\n");
    await symlink(foreign, join(primary, "foreign-alias"), process.platform === "win32" ? "junction" : "dir");
    await expect(applyUnifiedPatch({ context, patch: patch.replaceAll("newdir/sub", "foreign-alias/sub"), expectedSha256: { "foreign-alias/sub/file.txt": "absent" } })).rejects.toThrow("Cross-profile");
    const failPatch = patch.replaceAll("newdir", "rollbackdir");
    vi.spyOn(fs, "open").mockRejectedValueOnce(new Error("injected staging failure"));
    await expect(applyUnifiedPatch({ context, patch: failPatch, expectedSha256: { "rollbackdir/sub/file.txt": "absent" } })).rejects.toThrow();
    await expect(fs.access(join(primary, "rollbackdir"))).rejects.toThrow();
  });

  it("keeps opt-in tools disabled by default and raw responses still reject masked writes", async () => {
    expect(enabledToolNames(false)).toHaveLength(25);
    expect(enabledToolNames(true)).toHaveLength(14);
    expect(enabledToolNames(false, undefined, { multiFileEdit: true })).toHaveLength(27);
    expect(enabledToolNames(true, undefined, { multiFileEdit: true })).not.toContain("apply_patch");
    expect(enabledToolNames(true, undefined, { readOnlyExtras: true })).toHaveLength(16);
    const { context, primary } = await fixture();
    const secret = "opaque-raw-fixture-123456";
    await writeFile(join(primary, "secret.txt"), secret);
    const server = createServer(context, { redaction: "off", knownSecrets: [secret] });
    const client = new Client({ name: "raw-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const posture = (await client.callTool({ name: "workstation_context", arguments: {} })).structuredContent!;
      expect(posture.redaction).toBe("off");
      expect((await client.callTool({ name: "read_text_file", arguments: { path: "secret.txt" } })).structuredContent?.text).toBe(secret);
      expect((await client.callTool({ name: "write_text_file", arguments: { path: "new.txt", content: "[WORKFORGE_REDACTED]",
        contextRevision: posture.contextRevision, expectedSha256: "absent" } })).isError).toBe(true);
    } finally { await client.close(); await server.close(); }
  });
  it("streams large files within scan limits, including CRLF chunk boundaries", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "large-stream.txt");
    const handle = await open(path, "w");
    await handle.writeFile("a".repeat(65535) + "\r\nsecond\r\nthird");
    await handle.truncate(70 * 1024 * 1024); await handle.close();
    const range = await readTextStream({ context, path, startLine: 2, maxLines: 1 });
    expect(range).toMatchObject({ text: "second", startLine: 2, endLine: 2, hashAvailable: false, editable: false, nextStartLine: 3 });
    expect(range.scannedBytes).toBeLessThan(200000);
    expect(await readTextStream({ context, path, startLine: 2, maxScanBytes: 65536 })).toMatchObject({ scanLimited: true, text: "" });
    await expect(readTextStream({ context, path, signal: AbortSignal.abort() })).rejects.toThrow();
    await writeFile(path, Buffer.from([0xff]));
    await expect(readTextStream({ context, path })).rejects.toThrow();
  });

  it("reuses a batch source near the raw byte limit", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "large-cached.txt");
    const handle = await open(path, "w");
    await handle.writeFile("first\nsecond\n"); await handle.truncate(40 * 1024 * 1024); await handle.close();
    const result = await readTextFiles({ context, files: [{ path, maxLines: 1 }, { path, startLine: 2, maxLines: 1 }] });
    expect(result.results.map(result => result.status)).toEqual(["read", "read"]);
    expect(result.returnedCharacters).toBe(11);
  });

  it("invalidates the request cache after source metadata changes", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "changing.txt");
    await writeFile(path, "before");
    const authorize = workstation.resolveAuthorizedWorkstationPath;
    let count = 0;
    vi.spyOn(workstation, "resolveAuthorizedWorkstationPath").mockImplementation(async (...args) => {
      if (++count === 2) await writeFile(path, "after-and-longer");
      return authorize(...args);
    });
    const result = await readTextFiles({ context, files: [{ path }, { path }] });
    expect(result.results[0]).toMatchObject({ file: { text: "before" } });
    expect(result.results[1]).toMatchObject({ file: { text: "after-and-longer" } });
  });

  it("selects sorted globs and suggests existing related imports and test pairs", async () => {
    const { context, primary, foreign } = await fixture();
    await writeFile(join(foreign, "private.ts"), "private");
    await writeFile(join(primary, "foo.ts"), 'import { x } from "./bar.js"; import("./missing"); import("../foreign/private");');
    await writeFile(join(primary, "foo.test.ts"), "test");
    await writeFile(join(primary, "bar.ts"), "export const x=1");
    await writeFile(join(primary, "foo.css"), "body{}");
    const selected = await readTextFiles({ context, select: { root: primary, globs: ["*.ts"], maxFiles: 2 } });
    expect(selected.results.map(result => basename(result.requestedPath))).toEqual(["bar.ts", "foo.test.ts"]);
    expect(selected.selection?.truncated).toBe(true);
    await expect(readTextFiles({ context, files: [], select: { root: primary, globs: ["*"] } })).rejects.toThrow("either");
    const related = await suggestRelatedFiles({ context, path: join(primary, "foo.ts") });
    expect(related.suggestions).toEqual(expect.arrayContaining([
      { path: join(primary, "foo.test.ts"), reason: "test_pair" }, { path: join(primary, "bar.ts"), reason: "relative_import" },
      { path: join(primary, "foo.css"), reason: "same_basename" }]));
    expect(related.suggestions.some(item => item.path.includes("private.ts"))).toBe(false);
  });

  it("supports sorted basename filters, bounded columns and optional search statistics", async () => {
    const { context, primary } = await fixture();
    await mkdir(join(primary, "needle"));
    await writeFile(join(primary, "needle", "other.txt"), "needle");
    await writeFile(join(primary, "needle.txt"), "needle\n" + "needle".repeat(1000));
    const input = { context, path: primary, query: "needle", mode: "path" as const, regex: false, globs: [], includeHidden: true, respectIgnoreFiles: true, maxResults: 10 };
    const filtered = await searchFiles({ ...input, match: "basename", sort: "path" });
    expect(filtered.matches.map(match => basename(match.path))).toEqual(["needle.txt"]);
    const json = await searchFiles({ ...input, mode: "content", sort: "path", includeStats: true });
    expect(json.stats?.searchesWithMatch).toBe(2);
    const columns = await searchFiles({ ...input, mode: "content", sort: "path", lineFormat: "columns" });
    expect(columns.matches.map(({ path, line, column }) => ({ path, line, column })))
      .toEqual(json.matches.map(({ path, line, column }) => ({ path, line, column })));
    expect(columns.stats).toBe(null);
    await writeFile(join(primary, "[needle].txt"), "literal");
    expect((await searchFiles({ ...input, query: "[needle]", match: "basename" })).matches.map(match => basename(match.path))).toEqual(["[needle].txt"]);
  });
  it("parses read-only flags and permits only shrinking mode tool sets", () => {
    expect(parseBridgeArguments(["--read-only", "--profile", "fixture"])).toEqual({ readOnlyFlag: true, profileArgv: ["--profile", "fixture"] });
    expect(() => parseBridgeArguments(["--read-only", "--read-only"])).toThrow();
    expect(() => parseProfileId(parseBridgeArguments(["--unknown"]).profileArgv)).toThrow();
    expect(enabledToolNames(true, " read_text_file ")).toEqual(["read_text_file", "workstation_context"]);
    for (const list of ["", "read_text_file,", "read_text_file,read_text_file", "write_text_file", "unknown"]) {
      expect(() => enabledToolNames(true, list)).toThrow("WORKFORGE_MCP_TOOLS");
    }
  });

  it("locks a live session and rejects cached mutation calls while retaining shell_cancel", async () => {
    const { context } = await fixture();
    const onSessionLock = vi.fn();
    const server = createServer(context, { onSessionLock });
    const client = new Client({ name: "lock-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      const initial = (await client.callTool({ name: "workstation_context", arguments: {} })).structuredContent!;
      const result = await client.callTool({ name: "workstation_lock_read_only", arguments: { contextRevision: initial.contextRevision, confirm: "LOCK_READ_ONLY" } });
      expect(result.isError).not.toBe(true);
      const names = (await client.listTools()).tools.map(tool => tool.name).sort();
      expect(onSessionLock).toHaveBeenCalledWith({ toolMode: "read_only", toolModeSource: "session_lock", redaction: "on", tools: names.length });
      expect(names).toEqual([...enabledToolNames(true), "shell_cancel"].sort());
      const posture = (await client.callTool({ name: "workstation_context", arguments: {} })).structuredContent;
      expect(posture).toMatchObject({ toolMode: "read_only", toolModeSource: "session_lock", enabledTools: names });
      for (const name of ["write_text_file", "project_resume", "workstation_lock_read_only"]) {
        const rejected = await client.callTool({ name, arguments: {} }).then(result => result.isError === true, () => true);
        expect(rejected).toBe(true);
      }
    } finally { await client.close(); await server.close(); }
  });

  it("registers only the explicit reduced tool set", async () => {
    const { context } = await fixture();
    const server = createServer(context, { readOnly: true, tools: "read_text_file" });
    const client = new Client({ name: "allowlist-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      expect((await client.listTools()).tools.map(tool => tool.name).sort()).toEqual(["read_text_file", "workstation_context"]);
    } finally { await client.close(); await server.close(); }
  });
  it("omits unchanged text without consuming the batch character budget", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "conditional.txt");
    await writeFile(path, "a\n".repeat(1000));
    const original = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    expect(original.unchanged).toBe(false);
    const result = await readTextFiles({ context, maxTotalCharacters: 1024, files: [
      { path, ifSha256Differs: original.sha256 }, { path, maxLines: 2 }] });
    expect(result.results[0]).toMatchObject({ status: "read", file: { unchanged: true, text: "",
      characterLimited: false, truncated: false, nextStartLine: null, sha256: original.sha256 } });
    expect(result.returnedCharacters).toBe(3);
    await writeFile(path, "changed");
    expect(await readTextFile({ context, path, startLine: 1, maxLines: 10, ifSha256Differs: original.sha256 }))
      .toMatchObject({ unchanged: false, text: "changed" });
  });
  it("previews repeated edits and resulting CRLF line ranges without taking a lease", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "preview.txt");
    const content = "a\r\na\r\na\r\nremove\r\nend";
    await writeFile(path, content);
    const original = await readTextFile({ context, path });
    const input = { context, path, expectedSha256: original.sha256, edits: [
      { oldText: "remove\r\n", newText: "" }, { oldText: "a\n", newText: "b\nc\n", expectedCount: 3 }] };
    const preview = await replaceText({ ...input, dryRun: true });
    expect(await readFile(path, "utf8")).toBe(content);
    await expect(access(join(context.engineRoot, "runtime", "file-leases"))).rejects.toThrow();
    expect(preview).toMatchObject({ dryRun: true, editsApplied: 2, replacementsApplied: 4, ranges: [
      { index: 0, startLine: 7, endLine: 6 }, { index: 1, startLine: 1, endLine: 2 },
      { index: 1, startLine: 3, endLine: 4 }, { index: 1, startLine: 5, endLine: 6 }] });
    const applied = await replaceText(input);
    expect(applied.sha256).toBe(preview.sha256);
    expect(applied.ranges).toEqual(preview.ranges);
    expect(await readFile(path, "utf8")).toBe("b\r\nc\r\nb\r\nc\r\nb\r\nc\r\nend");
  });

  it("rejects count mismatch and overlapping repeated replacements before writing", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "counts.txt");
    await writeFile(path, "aaa x x x");
    const { sha256: expectedSha256 } = await readTextFile({ context, path });
    const base = { context, path, expectedSha256 };
    for (const dryRun of [true, false]) {
      await expect(replaceText({ ...base, dryRun, oldText: "x", newText: "z", expectedCount: 2 })).rejects.toThrow("expected 2 occurrences, found 3");
      await expect(replaceText({ ...base, dryRun, edits: [{ oldText: "aa", newText: "z", expectedCount: 2 }] })).rejects.toThrow("overlapping occurrences");
      await expect(replaceText({ ...base, dryRun, edits: [{ oldText: "x", newText: "z", expectedCount: 3 }, { oldText: "x x", newText: "z" }] })).rejects.toThrow();
    }
    expect(await readFile(path, "utf8")).toBe("aaa x x x");
  });
  it.skipIf(process.platform === "win32")("preserves POSIX modes across both atomic writers", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "mode.txt");
    for (const mode of [0o755, 0o644]) {
      await writeFile(path, "before");
      await chmod(path, mode);
      const original = await readTextFile({ context, path });
      const edited = await replaceText({ context, path, expectedSha256: original.sha256, oldText: "before", newText: "after" });
      expect((await stat(path)).mode & 0o7777).toBe(mode);
      await writeTextFile({ context, path, expectedSha256: edited.sha256, content: "written", createParents: false });
      expect((await stat(path)).mode & 0o7777).toBe(mode);
    }
  });
  it("redacts both MCP representations and errors, rejecting masked mutation inputs", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "secret.txt");
    const secret = 'synthetic"\\credential-123456789';
    await writeFile(path, `value: ${secret}`);
    const server = createServer(context, { knownSecrets: [secret] });
    const client = new Client({ name: "redaction-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const read = await client.callTool({ name: "read_text_file", arguments: { path } });
      expect(read.isError).not.toBe(true);
      expect(read._meta).toMatchObject({ redactionCount: 1 });
      expect(read.structuredContent).toMatchObject({ text: "value: [WORKFORGE_REDACTED]" });
      expect(JSON.parse((read.content as Array<{ text: string }>)[0]!.text)).toEqual(read.structuredContent);
      const bootstrap = await client.callTool({ name: "workstation_context", arguments: {} });
      const contextRevision = bootstrap.structuredContent!.contextRevision;
      for (const [name, fields] of [
        ["write_text_file", { content: "[WORKFORGE_REDACTED]", expectedSha256: read.structuredContent!.sha256 }],
        ["replace_text", { oldText: "[WORKFORGE_REDACTED]", newText: "new", expectedSha256: read.structuredContent!.sha256 }],
        ["shell_start", { command: "echo [WORKFORGE_REDACTED]" }],
      ] as const) {
        const result = await client.callTool({ name, arguments: { path, contextRevision, ...fields } });
        expect(result.isError).toBe(true);
      }
      const invalid = await client.callTool({ name: "shell_status", arguments: { id: secret } });
      expect(invalid.isError).toBe(true);
      expect(JSON.stringify(invalid)).not.toContain("123456789");
      const missing = await client.callTool({ name: "read_text_file", arguments: { path: join(primary, "ghp_" + "x".repeat(36)) } });
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing)).not.toContain("ghp_" + "x".repeat(36));
      expect(await readFile(path, "utf8")).toBe(`value: ${secret}`);
    } finally { await client.close(); await server.close(); }
  });

  it("enforces read-only registration and strict startup mode parsing", async () => {
    expect(parseReadOnlyMode(undefined)).toBe(false);
    expect(parseReadOnlyMode("0")).toBe(false);
    expect(parseReadOnlyMode("1")).toBe(true);
    for (const value of ["", "true", "yes", " 1"]) expect(() => parseReadOnlyMode(value)).toThrow("WORKFORGE_MCP_READ_ONLY");
    const { context, primary } = await fixture();
    const path = join(primary, "read-only.txt");
    await writeFile(path, "unchanged");
    const server = createServer(context, { readOnly: true });
    const client = new Client({ name: "read-only-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
        "list_directory", "read_image", "read_text_file", "read_text_files", "read_text_stream", "search_files",
        "shell_list", "shell_output", "shell_status", "suggest_related_files", "task_history", "task_list", "task_resume", "workstation_context",
      ]);
      const bootstrap = await client.callTool({ name: "workstation_context", arguments: {} });
      expect(bootstrap.structuredContent).toMatchObject({ toolMode: "read_only" });
      for (const name of ["write_text_file", "replace_text", "shell_start", "shell_cancel", "project_resume", "task_checkpoint"]) {
        const rejected = await client.callTool({ name, arguments: { path, content: "changed", command: "echo unexpected" } })
          .then((result) => result.isError === true, () => true);
        expect(rejected).toBe(true);
      }
      const read = await client.callTool({ name: "read_text_file", arguments: { path } });
      expect(read.structuredContent).toMatchObject({ text: "unchanged" });
      expect(await readFile(path, "utf8")).toBe("unchanged");
      await expect(access(join(primary, "artifacts"))).rejects.toThrow();
    } finally { await client.close(); await server.close(); }
  });

  it("applies original-based batch edits once, preserving BOM and normalized CRLF ranges", async () => {
    const { context, primary } = await fixture();
    const original = Buffer.from("\uFEFFalpha\r\nbeta\r\ngamma\r\n");
    const edits = [{ oldText: "alpha\nbeta\n", newText: "beta\n$&\n" }, { oldText: "gamma\n", newText: "한글\n" }];
    for (const ordered of [edits, [...edits].reverse()]) {
      const path = join(primary, "batch.txt");
      await writeFile(path, original);
      const read = await readTextFile({ context, path, startLine: 1, maxLines: 20 });
      const result = await replaceText({ context, path, expectedSha256: read.sha256, edits: ordered });
      expect(result.editsApplied).toBe(2);
      expect(await readFile(path, "utf8")).toBe("\uFEFFbeta\r\n$&\r\n한글\r\n");
    }
  });

  it("rejects any ambiguous, missing, overlapping or invalid batch without changing bytes", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "unchanged.txt");
    const original = "aaa\r\nbeta\r\ngamma\r\n";
    await writeFile(path, original);
    const read = await readTextFile({ context, path, startLine: 1, maxLines: 20 });
    const base = { context, path, expectedSha256: read.sha256 };
    await expect(replaceText({ ...base, edits: [{ oldText: "aa", newText: "x" }] })).rejects.toThrow("edits[0]: oldText matches multiple");
    await expect(replaceText({ ...base, edits: [{ oldText: "beta", newText: "x" }, { oldText: "missing", newText: "y" }] })).rejects.toThrow("edits[1]: oldText not found");
    await expect(replaceText({ ...base, edits: [{ oldText: "aaa\nbeta\n", newText: "x" }, { oldText: "beta", newText: "y" }] })).rejects.toThrow("edits[0] overlaps edits[1]");
    await expect(replaceText({ ...base, edits: [{ oldText: "beta", newText: "x" }, { oldText: "beta", newText: "y" }] })).rejects.toThrow("overlaps");
    await expect(replaceText({ ...base, edits: [{ oldText: "beta", newText: "new" }, { oldText: "new", newText: "y" }] })).rejects.toThrow("not found");
    for (const input of [{ edits: [] }, { edits: [], oldText: "a", newText: "" }, { oldText: "a" },
      { edits: Array(101).fill({ oldText: "a", newText: "" }) }]) {
      await expect(replaceText({ ...base, ...input })).rejects.toThrow();
    }
    await expect(replaceText({ ...base, path: join(primary, "does-not-exist"),
      edits: Array(9).fill({ oldText: "x".repeat(1024 * 1024), newText: "y".repeat(1024 * 1024) }) })).rejects.toThrow("payload");
    expect(await readFile(path, "utf8")).toBe(original);
    const deleted = await replaceText({ ...base, oldText: "gamma", newText: "" });
    expect(deleted.editsApplied).toBe(1);
  });

  it("distinguishes an exact search limit from additional matches", async () => {
    const { context, primary } = await fixture();
    await writeFile(join(primary, "search.txt"), "alpha\nalpha\nalpha\n", "utf8");
    const input = { context, path: primary, query: "alpha", mode: "content" as const, regex: false, globs: [], includeHidden: true, respectIgnoreFiles: true };
    const limited = await searchFiles({ ...input, maxResults: 2 });
    expect(limited).toMatchObject({ stoppedBecause: "result_limit", truncated: true, warning: null });
    expect(limited.matches).toHaveLength(2);
    const complete = await searchFiles({ ...input, maxResults: 3 });
    expect(complete).toMatchObject({ stoppedBecause: "complete", truncated: false });
    expect(complete.matches).toHaveLength(3);
    const paths = await searchFiles({ ...input, mode: "path", query: "search", maxResults: 1 });
    expect(paths.matches).toHaveLength(1);
    expect(paths.stoppedBecause).toBe("complete");
    const invalid = await searchFiles({ ...input, regex: true, query: "[", maxResults: 2 });
    expect(invalid).toMatchObject({ stoppedBecause: "error", truncated: true });
  });

  it("rejects unsupported path regex without blocking the server", async () => {
    const { context, primary } = await fixture();
    await writeFile(join(primary, "search.txt"), "x");
    const input = { context, path: primary, query: "(?=search)", mode: "path" as const, regex: true, globs: [], includeHidden: true, respectIgnoreFiles: true, maxResults: 10 };
    expect(await searchFiles(input)).toMatchObject({ stoppedBecause: "error", truncated: true });
  });

  it("bounds pathological path regex and maps matching records", async () => {
    const { context, primary } = await fixture();
    for (const name of ["a".repeat(40) + "!", "Search.txt", "search2.txt", "search3.txt"]) await writeFile(join(primary, name), "x");
    const input = { context, path: primary, mode: "path" as const, regex: true, globs: [], includeHidden: true, respectIgnoreFiles: true, maxResults: 10, timeoutMs: 2000, match: "basename" as const };
    for (const query of ["^(a+)+$", "(.+)+\\u0000"]) {
      const result = await searchFiles({ ...input, query });
      expect(result.matches).toHaveLength(0);
      expect(result.elapsedMs).toBeLessThan(5000);
    }
    expect((await searchFiles({ ...input, query: "search\\.txt$" })).matches).toHaveLength(1);
    expect(await searchFiles({ ...input, query: "SEARCH", maxResults: 2 })).toMatchObject({ stoppedBecause: "result_limit", matches: expect.arrayContaining([expect.any(Object)]) });
  }, 15000);

  it("parses chunked Unicode JSON and NUL paths without accepting unfinished records", async () => {
    const { context, primary } = await fixture();
    const record = JSON.stringify({ type: "match", data: { path: { text: "한글.txt" }, lines: { text: "😀\n" }, line_number: 1, submatches: [{ start: 0 }] } });
    const fake = vi.spyOn(processTools, "runProcess").mockImplementation(async (_executable, args, options) => {
      expect(args).toContain("--no-config");
      const bytes = Buffer.from(args.includes("--null") ? "한글\n파일.txt\0unfinished" : `${record}\n${record.slice(0, -2)}`);
      for (let i = 0; i < bytes.length; i++) options.onStdoutChunk!(bytes.subarray(i, i + 1));
      return { command: "fixture", exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false, truncated: false, stopReason: null, killConfirmed: true };
    });
    const input = { context, path: primary, query: "", regex: false, globs: [], includeHidden: true, respectIgnoreFiles: true, maxResults: 10 };
    const content = await searchFiles({ ...input, mode: "content" });
    expect(content.matches).toEqual([{ path: join(primary, "한글.txt"), text: "😀", line: 1, column: 1 }]);
    const paths = await searchFiles({ ...input, mode: "path" });
    expect(paths.matches).toEqual([{ path: join(primary, "한글\n파일.txt"), text: null, line: null, column: null }]);
    expect(fake).toHaveBeenCalledTimes(2);
  });

  it("reads ordered ranges with full-file hashes and distinguishes requested ranges from clipping", async () => {
    const { context, primary } = await fixture();
    await writeFile(join(primary, "text.txt"), "alpha\r\n한글\r\nomega", "utf8");
    await writeFile(join(primary, "empty.txt"), "", "utf8");
    const files = [{ path: "text.txt", startLine: 2, maxLines: 1 }, { path: "text.txt", maxLines: 1 }, { path: "empty.txt" }];
    const batch = await readTextFiles({ context, files });
    expect(batch.results.map((result) => result.status)).toEqual(["read", "read", "read"]);
    expect(batch.results[0]).toMatchObject({ file: { text: "한글", truncated: true, characterLimited: false, nextStartLine: 3 } });
    expect(batch.truncated).toBe(false);
    expect(batch.hasErrors).toBe(false);
    expect(batch.returnedCharacters).toBe(7);
    if (batch.results[0]?.status === "read" && batch.results[1]?.status === "read") {
      expect(batch.results[0].file.sha256).toBe(batch.results[1].file.sha256);
    }
  });

  it("stops accessing files after the text budget and handles exact exhaustion", async () => {
    const { context, primary, foreign } = await fixture();
    await writeFile(join(primary, "full.txt"), "a".repeat(1024), "utf8");
    const first = await readTextFiles({ context, files: [{ path: "full.txt" }], maxTotalCharacters: 1024 });
    expect(first.truncated).toBe(false);
    const batch = await readTextFiles({ context, files: [{ path: "full.txt" }, { path: join(foreign, "secret.txt") }], maxTotalCharacters: 1024 });
    expect(batch.results[1]).toMatchObject({ status: "skipped", reason: "budget_exhausted" });
    expect(batch.returnedCharacters).toBe(1024);
    expect(batch.truncated).toBe(true);
    expect(batch.hasErrors).toBe(false);
  });

  it("returns recovery lines without splitting surrogate pairs", async () => {
    const { context, primary } = await fixture();
    await writeFile(join(primary, "lines.txt"), "alpha\nbeta\ngamma", "utf8");
    const cut = await readTextFile({ context, path: "lines.txt", startLine: 1, maxLines: 10, maxCharacters: 8 });
    expect(cut).toMatchObject({ text: "alpha\nbe", characterLimited: true, nextStartLine: 2 });
    const resumed = await readTextFile({ context, path: "lines.txt", startLine: cut.nextStartLine!, maxLines: 10 });
    expect(resumed.text).toBe("beta\ngamma");
    expect((await readTextFile({ context, path: "lines.txt", startLine: 1, maxLines: 10, maxCharacters: 6 })).nextStartLine).toBe(2);
    expect(await readTextFile({ context, path: "lines.txt", startLine: 20, maxLines: 10 })).toMatchObject({ text: "", endLine: 19, nextStartLine: null });
    await writeFile(join(primary, "emoji.txt"), "😀".repeat(1000), "utf8");
    const emoji = await readTextFiles({ context, files: [{ path: "emoji.txt" }], maxTotalCharacters: 1025 });
    expect(emoji.results[0]).toMatchObject({ file: { text: "😀".repeat(512), nextStartLine: 1, characterLimited: true } });
    expect(emoji.returnedCharacters).toBe(1024);
  });

  it("preserves partial failures, rejects foreign aliases, and bounds diagnostics", async () => {
    const { context, primary, foreign } = await fixture();
    await writeFile(join(primary, "valid.txt"), "ok", "utf8");
    await writeFile(join(primary, "invalid.txt"), Buffer.from([0xff]));
    await symlink(foreign, join(primary, "alias"), process.platform === "win32" ? "junction" : "dir");
    const batch = await readTextFiles({ context, files: [
      { path: "missing.txt" }, { path: "." }, { path: "invalid.txt" },
      { path: "alias/secret.txt" }, { path: "a".repeat(1500) }, { path: "valid.txt" },
    ] });
    expect(batch.results.map((result) => result.status)).toEqual(["error", "error", "error", "error", "error", "read"]);
    expect(batch.results[0]).toMatchObject({ code: "ENOENT" });
    if (batch.results[4]?.status === "error") expect(batch.results[4].error.length).toBeLessThanOrEqual(1000);
    expect(batch.results[5]).toMatchObject({ file: { text: "ok" } });
    expect(batch.hasErrors).toBe(true);
  });

  it("charges failed decoding to the source budget and preserves budget on pre-read rejection", async () => {
    const { context, primary } = await fixture();
    await writeFile(join(primary, "bad.txt"), Buffer.from([0xff, 0xfe]));
    await writeFile(join(primary, "large.txt"), "1234", "utf8");
    const budget = { remainingBytes: 2 };
    await expect(readTextFile({ context, path: "missing", startLine: 1, maxLines: 1, sourceBudget: budget })).rejects.toThrow();
    expect(budget.remainingBytes).toBe(2);
    await expect(readTextFile({ context, path: "large.txt", startLine: 1, maxLines: 1, sourceBudget: budget })).rejects.toMatchObject({ code: "SOURCE_BUDGET_EXCEEDED" });
    expect(budget.remainingBytes).toBe(2);
    await expect(readTextFile({ context, path: "bad.txt", startLine: 1, maxLines: 1, sourceBudget: budget })).rejects.toThrow();
    expect(budget.remainingBytes).toBe(0);
  });

  it("stops a batch at the source limit even when decoding fails", async () => {
    const { context, primary, foreign } = await fixture();
    const handle = await open(join(primary, "large-invalid.txt"), "w");
    try { await handle.truncate(64 * 1024 * 1024); await handle.write(Buffer.from([0xff]), 0, 1, 0); }
    finally { await handle.close(); }
    const batch = await readTextFiles({ context, files: [{ path: "large-invalid.txt" }, { path: join(foreign, "secret.txt") }] });
    expect(batch.results[0]?.status).toBe("error");
    expect(batch.results[1]).toMatchObject({ status: "skipped", reason: "source_budget_exhausted" });
    expect(batch.truncated).toBe(true);
  });

  it("validates batch requests and respects cancellation", async () => {
    const { context } = await fixture();
    await expect(readTextFiles({ context, files: [] })).rejects.toThrow();
    await expect(readTextFiles({ context, files: Array(21).fill({ path: "file" }) })).rejects.toThrow();
    await expect(readTextFiles({ context, files: [{ path: "file", startLine: 0 }] })).rejects.toThrow();
    await expect(readTextFiles({ context, files: [{ path: "file" }], maxTotalCharacters: 200001 })).rejects.toThrow();
    await expect(readTextFiles({ context, files: [{ path: "file" }], signal: AbortSignal.abort() })).rejects.toThrow();
  });

  it("exposes serializable MCP batch schemas and matching text/structured results", async () => {
    const { context, primary } = await fixture();
    await writeFile(join(primary, "read.txt"), "hello", "utf8");
    const server = createServer(context);
    const client = new Client({ name: "batch-read-test", version: "1" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const tools = await client.listTools();
      const tool = tools.tools.find((item) => item.name === "read_text_files");
      expect(JSON.parse(JSON.stringify(tool?.outputSchema))).toHaveProperty("properties.results");
      const result = await client.callTool({ name: "read_text_files", arguments: { files: [{ path: "read.txt" }, { path: "missing" }] } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ returnedCharacters: 5, hasErrors: true });
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(JSON.parse(content.find((part) => part.type === "text")!.text!)).toEqual(result.structuredContent);
      const invalid = await client.callTool({ name: "read_text_files", arguments: { files: [] } });
      expect(invalid.isError).toBe(true);
      const search = await client.callTool({ name: "search_files", arguments: { path: primary, query: "hello" } });
      expect(search.isError).not.toBe(true);
      expect(search.structuredContent).toMatchObject({ stoppedBecause: "complete", elapsedMs: expect.any(Number) });
      const bootstrap = await client.callTool({ name: "workstation_context", arguments: {} });
      const contextRevision = bootstrap.structuredContent!.contextRevision;
      const file = await readTextFile({ context, path: "read.txt", startLine: 1, maxLines: 10 });
      const replaced = await client.callTool({ name: "replace_text", arguments: { path: "read.txt", contextRevision,
        expectedSha256: file.sha256, edits: [{ oldText: "he", newText: "HE" }, { oldText: "lo", newText: "LO" }] } });
      expect(replaced.isError).not.toBe(true);
      expect(replaced.structuredContent).toMatchObject({ editsApplied: 2 });
      const single = await client.callTool({ name: "replace_text", arguments: { path: "read.txt", contextRevision,
        expectedSha256: replaced.structuredContent!.sha256, oldText: "HE", newText: "he" } });
      expect(single.isError).not.toBe(true);
      expect(single.structuredContent).toMatchObject({ editsApplied: 1 });
    } finally { await client.close(); await server.close(); }
  });

  it("reads, creates, replaces, lists, and searches outside the profile root", async () => {
    const { context, outside } = await fixture();
    const path = join(outside, ".env.example");
    const created = await writeTextFile({
      context,
      path,
      content: "alpha=한글\nbeta=two\n",
      expectedSha256: "absent",
      createParents: false,
    });
    expect(created.created).toBe(true);

    const read = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    expect(read.text).toContain("alpha=한글");
    expect(read.sha256).toBe(created.sha256);

    const replaced = await replaceText({
      context,
      path,
      expectedSha256: read.sha256,
      oldText: "beta=two",
      newText: "beta=three",
    });
    expect((await readFile(path, "utf8"))).toContain("beta=three");
    expect(replaced.sha256).not.toBe(read.sha256);

    const listing = await listDirectory({ context, path: outside, depth: 2, maxEntries: 100 });
    expect(listing.entries.some((entry) => entry.path === path)).toBe(true);

    const contentSearch = await searchFiles({
      context,
      path: outside,
      query: "beta=three",
      mode: "content",
      regex: false,
      globs: [],
      includeHidden: true,
      respectIgnoreFiles: false,
      maxResults: 20,
    });
    expect(contentSearch.matches.some((match) => match.path === path)).toBe(true);

    const pathSearch = await searchFiles({
      context,
      path: outside,
      query: ".env.example",
      mode: "path",
      regex: false,
      globs: [],
      includeHidden: true,
      respectIgnoreFiles: false,
      maxResults: 20,
    });
    expect(pathSearch.matches.some((match) => match.path === path)).toBe(true);
  });

  it("uses the default cwd for relative paths and preserves stale-write conflicts", async () => {
    const { context, primary } = await fixture();
    const path = join(primary, "nested", "file.txt");
    const created = await writeTextFile({
      context,
      path: "nested/file.txt",
      content: "first\n",
      expectedSha256: "absent",
      createParents: true,
    });
    await writeFile(path, "changed elsewhere\n", "utf8");
    await expect(writeTextFile({
      context,
      path,
      content: "overwrite\n",
      expectedSha256: created.sha256,
      createParents: false,
    })).rejects.toThrow("changed after it was read");
    expect(await readFile(path, "utf8")).toBe("changed elsewhere\n");
  });

  it("treats JavaScript replacement tokens as literal text", async () => {
    const { context, outside } = await fixture();
    const path = join(outside, "replacement-tokens.txt");
    await writeFile(path, "before TOKEN after\n", "utf8");
    const read = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    const dollar = "$";
    const replacement = [dollar + "&", dollar + "1", dollar + "'", dollar + "`"].join("|");

    await replaceText({
      context,
      path,
      expectedSha256: read.sha256,
      oldText: "TOKEN",
      newText: replacement,
    });

    expect(await readFile(path, "utf8")).toBe(`before ${replacement} after\n`);
  });

  it("accepts LF text copied from read_text_file when the file uses CRLF", async () => {
    const { context, outside } = await fixture();
    const path = join(outside, "crlf.txt");
    await writeFile(path, "alpha\r\nbeta\r\n", "utf8");
    const read = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    expect(read.text).toBe("alpha\nbeta\n");

    await replaceText({
      context,
      path,
      expectedSha256: read.sha256,
      oldText: read.text,
      newText: "alpha\nchanged\n",
    });

    expect(await readFile(path, "utf8")).toBe("alpha\r\nchanged\r\n");
  });

  it("allows hardlink reads but rejects ambiguous hardlink mutation", async () => {
    const { context, outside } = await fixture();
    const source = join(outside, "source.txt");
    const alias = join(outside, "alias.txt");
    await writeFile(source, "hardlink content\n", "utf8");
    await link(source, alias);
    const read = await readTextFile({ context, path: alias, startLine: 1, maxLines: 10 });
    expect(read.text).toContain("hardlink content");
    await expect(replaceText({
      context,
      path: alias,
      expectedSha256: read.sha256,
      oldText: "hardlink",
      newText: "changed",
    })).rejects.toThrow(/Hardlinked text mutation/u);
    expect(await readFile(source, "utf8")).toBe("hardlink content\n");
  });

  it("allows exactly one concurrent replacement for the same prior hash", async () => {
    const { context, outside } = await fixture();
    const path = join(outside, "concurrent.txt");
    const created = await writeTextFile({
      context,
      path,
      content: "version=one\n",
      expectedSha256: "absent",
      createParents: false,
    });
    const attempts = await Promise.allSettled([
      writeTextFile({ context, path, content: "version=left\n", expectedSha256: created.sha256, createParents: false }),
      writeTextFile({ context, path, content: "version=right\n", expectedSha256: created.sha256, createParents: false }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(["version=left\n", "version=right\n"]).toContain(await readFile(path, "utf8"));
  });

  it("denies every direct filesystem tool at another managed project root before mutation", async () => {
    const { context, foreign } = await fixture();
    const textPath = join(foreign, "secret.txt");
    const imagePath = join(foreign, "secret.png");
    await writeFile(textPath, "foreign content\n", "utf8");
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    await expect(listDirectory({ context, path: foreign, depth: 1, maxEntries: 10 })).rejects.toThrow("foreign-profile");
    await expect(searchFiles({
      context,
      path: foreign,
      query: "foreign",
      mode: "content",
      regex: false,
      globs: [],
      includeHidden: true,
      respectIgnoreFiles: false,
      maxResults: 10,
    })).rejects.toThrow("foreign-profile");
    await expect(readTextFile({ context, path: textPath, startLine: 1, maxLines: 10 })).rejects.toThrow("foreign-profile");
    await expect(readImageFile(context, imagePath)).rejects.toThrow("foreign-profile");
    await expect(replaceText({
      context,
      path: textPath,
      expectedSha256: "0".repeat(64),
      oldText: "foreign",
      newText: "changed",
    })).rejects.toThrow("foreign-profile");

    const newParent = join(foreign, "must-not-exist");
    await expect(writeTextFile({
      context,
      path: join(newParent, "new.txt"),
      content: "blocked\n",
      expectedSha256: "absent",
      createParents: true,
    })).rejects.toThrow("foreign-profile");
    await expect(access(newParent)).rejects.toThrow();
  });

  it("blocks relative, broad-tree, case-variant, and junction routes into another managed project", async () => {
    const { context, primary, foreign, outside } = await fixture();
    const secretPath = join(foreign, "secret.txt");
    await writeFile(secretPath, "foreign content\n", "utf8");

    await expect(readTextFile({ context, path: "../foreign/secret.txt", startLine: 1, maxLines: 10 })).rejects.toThrow("foreign-profile");
    await expect(listDirectory({ context, path: join(primary, ".."), depth: 1, maxEntries: 10 })).rejects.toThrow("foreign-profile");

    if (process.platform === "win32") {
      await expect(readTextFile({ context, path: secretPath.toUpperCase(), startLine: 1, maxLines: 10 })).rejects.toThrow("foreign-profile");
    }

    const alias = join(outside, "foreign-junction");
    await symlink(foreign, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(readTextFile({ context, path: join(alias, "secret.txt"), startLine: 1, maxLines: 10 })).rejects.toThrow("foreign-profile");
  });

  it("caps text responses by character count even when a single line is huge", async () => {
    const { context, outside } = await fixture();
    const path = join(outside, "one-long-line.txt");
    await writeFile(path, "x".repeat(20_000), "utf8");

    const read = await readTextFile({ context, path, startLine: 1, maxLines: 10, maxCharacters: 1024 });

    expect(read.text).toHaveLength(1024);
    expect(read.truncated).toBe(true);
    expect(read.totalLines).toBe(1);
  });

  it("allows an unmanaged sibling whose name only shares a foreign-root prefix", async () => {
    const { context, foreign } = await fixture();
    const sibling = `${foreign}-backup`;
    const path = join(sibling, "notes.txt");
    await mkdir(sibling, { recursive: true });
    await writeFile(path, "allowed\n", "utf8");
    const result = await readTextFile({ context, path, startLine: 1, maxLines: 10 });
    expect(result.text).toContain("allowed");
  });
});
