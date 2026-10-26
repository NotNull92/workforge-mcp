import { randomBytes } from "node:crypto";
import { access, appendFile, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectContext, ProjectProfile } from "../src/profile.js";
import { createServer } from "../src/server.js";
import { cancelActiveShellJobs, cancelShellJob, getShellOutput, getShellStatus, listShellJobs, pruneShellJobs, startShellJob, waitForShellSettled } from "../src/shell.js";
import { saveTaskCheckpoint } from "../src/tasks.js";

const temporaryRoots: string[] = [];
const shellCommand = (powerShell: string, zsh: string): string => process.platform === "win32" ? powerShell : zsh;
const quoteZsh = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

async function fixture(): Promise<{ context: ProjectContext; primary: string; foreign: string; outside: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workstation-shell-")));
  temporaryRoots.push(root);
  const primary = join(root, "primary");
  const foreign = join(root, "foreign");
  const outside = join(root, "outside 한글");
  await Promise.all([
    mkdir(primary, { recursive: true }),
    mkdir(foreign, { recursive: true }),
    mkdir(outside, { recursive: true }),
  ]);
  const profile = Object.freeze({
    id: `shell-${randomBytes(8).toString("hex")}`,
    displayName: "Shell Test",
    appName: "Shell Test",
    serverName: "shell-test",
    defaultWorkingDirectoryRelative: ".",
    bootstrapFiles: Object.freeze([]),
    identityMarkers: Object.freeze([]),
    primaryRoot: primary,
  }) as unknown as ProjectProfile;
  const context = Object.freeze({
    profile,
    primaryRoot: primary,
    defaultWorkingDirectory: primary,
    engineRoot: primary,
    managedProjectRoots: Object.freeze([
      Object.freeze({ profileId: profile.id, primaryRoot: primary }),
      Object.freeze({ profileId: "foreign-profile", primaryRoot: foreign }),
    ]),
  });
  return { context, primary, foreign, outside };
}

async function waitForTerminal(context: ProjectContext, id: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = getShellStatus(context, id);
    if (status.status !== "running" && status.trackingState === "archived_terminal") return status;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Shell job did not finish: ${id}`);
}

async function archivedStart(context: ProjectContext, id: string, overrides: Record<string, unknown> = {}) {
  const root = join(context.primaryRoot, "artifacts", "workforge-mcp", "shell", id);
  await mkdir(root, { recursive: true });
  const timestamp = new Date().toISOString();
  await writeFile(join(root, "started.json"), JSON.stringify({
    version: 1, kind: "connection_owned_shell", executionMode: "connection_owned", id,
    profileId: context.profile.id, status: "running", cwd: context.primaryRoot,
    leaseScope: `profile:${context.profile.id}:shell`, processId: null, leaseAcquired: false,
    containmentEnforced: false, createdAt: timestamp, updatedAt: timestamp, exitCode: null,
    signal: null, timedOut: false, cancelRequested: false, timeoutMs: 60_000, commandUtf8Bytes: 10,
    stdoutBytes: 0, stderrBytes: 0, stdoutTruncated: false, stderrTruncated: false,
    inputSha256: "a".repeat(64), stdoutSha256: null, stderrSha256: null, replayAllowed: false,
    ...overrides,
  }));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workstation shell", { timeout: 30_000 }, () => {
  it("previews old records and protects checkpoint references during confirmed pruning", async () => {
    const { context, primary } = await fixture();
    const ids = ["a", "b", "c"].map(char => `shell_${char.repeat(32)}`);
    for (const id of ids) await archivedStart(context, id, { createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z" });
    await saveTaskCheckpoint({ context, taskId: "references", expectedSha256: "absent", state: { title: "Reference", objective: "Keep evidence",
      reportedStatus: "active", plan: [], completedSteps: [], blockers: [], nextAction: "", projectPath: primary, relatedPaths: [], shellJobIds: [ids[0]!] } });
    const input = { context, olderThanDays: 1, keepLatest: 0 };
    const preview = await pruneShellJobs(input);
    expect(preview.candidates.map(item => item.id).sort()).toEqual(ids.slice(1));
    expect(preview.deleted).toEqual([]);
    await expect(pruneShellJobs({ ...input, dryRun: false })).rejects.toThrow("confirmation");
    expect((await pruneShellJobs({ ...input, dryRun: false, confirm: "DELETE_SHELL_RECORDS" })).deleted.sort()).toEqual(ids.slice(1));
    expect(getShellStatus(context, ids[0]!).status).toBe("ownership_lost");
  });

  it("redacts disk log streams and seals hashes of stored bytes including a final partial line", async () => {
    const { context, primary } = await fixture();
    const secret = "opaque-disk-fixture-123456";
    const command = shellCommand(`[Console]::Out.Write('${secret}')`, `printf '%s' '${secret}'`);
    const job = await startShellJob({ context, cwd: primary, command, timeoutMs: 10000, redactLogs: true, knownSecrets: [secret] });
    await waitForShellSettled(context, job.id, 10000);
    expect(getShellStatus(context, job.id).logRedaction).toBe("line");
    const output = await getShellOutput({ context, id: job.id, stdoutOffset: 0, stderrOffset: 0, maxCharacters: 1000 });
    expect(JSON.stringify(output)).not.toContain(secret);
    const stored = await readFile(join(primary, "artifacts", "workforge-mcp", "shell", job.id, "stdout.log"), "utf8");
    expect(stored).toBe("[WORKFORGE_REDACTED]");
  });
  it("persists v2 labels and command fingerprints while reading v1 archives", async () => {
    const { context, primary } = await fixture();
    const secret = "opaque-shell-label-fixture-1234";
    await expect(startShellJob({ context, cwd: primary, command: "exit 0", timeoutMs: 10000,
      label: secret, knownSecrets: [secret] })).rejects.toThrow("SHELL_LABEL_SECRET");
    await expect(access(join(primary, "artifacts"))).rejects.toThrow();
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const job = await startShellJob({ context, cwd: primary, command: "exit 0", label: "Build", timeoutMs: 10000 });
      await waitForShellSettled(context, job.id, 10000);
      ids.push(job.id);
      expect(getShellStatus(context, job.id)).toMatchObject({ label: "Build", commandSha256: job.commandSha256 });
    }
    expect((await listShellJobs({ context, command: "exit 0", labelContains: "BUILD" })).jobs.map(job => job.id).sort()).toEqual(ids.sort());
    expect((await listShellJobs({ context, command: "exit 1" })).jobs).toEqual([]);
    const v1 = `shell_${"e".repeat(32)}`;
    await archivedStart(context, v1);
    expect(getShellStatus(context, v1)).toMatchObject({ label: null, commandSha256: null });
    const terminalPath = join(primary, "artifacts", "workforge-mcp", "shell", ids[0]!, "terminal.json");
    const terminal = JSON.parse(await readFile(terminalPath, "utf8"));
    expect(terminal.version).toBe(2);
    terminal.label = "Different";
    await writeFile(terminalPath, JSON.stringify(terminal));
    expect((await listShellJobs({ context })).errors).toContainEqual({ id: ids[0], code: "terminal_mismatch" });
  });
  it("widens filtered candidates and supports descendant cwd matching", async () => {
    const { context, primary } = await fixture();
    const child = join(primary, "child");
    await mkdir(child);
    const job = await startShellJob({ context, cwd: child, command: "exit 2", timeoutMs: 10000 });
    await waitForShellSettled(context, job.id, 10000);
    const root = join(primary, "artifacts", "workforge-mcp", "shell", job.id);
    await utimes(root, 1, 1);
    for (let i = 0; i < 5; i++) await archivedStart(context, `shell_${String(i).repeat(32)}`);
    const filtered = await listShellJobs({ context, limit: 1, status: ["failed"], cwd: primary, cwdScope: "tree" });
    expect(filtered.jobs.map(job => job.id)).toEqual([job.id]);
    expect(filtered.filterApplied).toBe(true);
    expect(filtered.inspectedCandidates).toBe(6);
    expect((await listShellJobs({ context, status: ["failed"], cwd: primary })).jobs).toEqual([]);
    expect((await listShellJobs({ context, status: ["completed"] })).jobs).toEqual([]);
  });
  it("discovers recent metadata candidates past 1000 arbitrary IDs without changing archives", async () => {
    const { context, primary } = await fixture();
    expect((await listShellJobs({ context })).jobs).toEqual([]);
    const runtime = join(primary, "artifacts", "workforge-mcp", "shell");
    await mkdir(runtime, { recursive: true });
    for (let index = 0; index < 1050; index += 1) {
      const directory = join(runtime, `shell_${index.toString(16).padStart(32, "0")}`);
      await mkdir(directory);
      await utimes(directory, 1, 1);
    }
    const id = `shell_${"f".repeat(32)}`;
    const root = await archivedStart(context, id);
    const before = await readFile(join(root, "started.json"));
    const result = await listShellJobs({ context, limit: 1 });
    expect(result.jobs.map((job) => job.id)).toEqual([id]);
    expect(result.jobs[0]).toMatchObject({ status: "ownership_lost", replayAllowed: false, stdoutBytes: 0 });
    expect(result.scannedEntries).toBe(1051);
    expect(result.scanLimited).toBe(false);
    expect(result.truncated).toBe(true);
    expect(result.errors[0]?.code).toBe("incomplete_start");
    expect(await readFile(join(root, "started.json"))).toEqual(before);
    expect((await listShellJobs({ context, cwd: process.platform === "win32" ? primary.toUpperCase() : primary })).jobs).toHaveLength(1);
    await expect(listShellJobs({ context, limit: 0 })).rejects.toThrow("limit");
    await expect(listShellJobs({ context, signal: AbortSignal.abort() })).rejects.toThrow();
  });

  it("returns only fixed diagnostics for damaged, foreign, redirected and hardlinked archives", async () => {
    const { context, primary, outside } = await fixture();
    const ids = Array.from({ length: 6 }, (_, index) => `shell_${index.toString(16).padStart(32, "0")}`);
    const malformed = await archivedStart(context, ids[0]!);
    await writeFile(join(malformed, "started.json"), '{"PRIVATE_MANIFEST_FRAGMENT"');
    await archivedStart(context, ids[1]!, { profileId: "foreign-profile" });
    await archivedStart(context, ids[2]!, { createdAt: "9999" });
    const hardlinked = await archivedStart(context, ids[3]!);
    await link(join(hardlinked, "started.json"), join(outside, "linked.json"));
    const runtime = join(primary, "artifacts", "workforge-mcp", "shell");
    await symlink(outside, join(runtime, ids[4]!), process.platform === "win32" ? "junction" : "dir");
    await mkdir(join(runtime, ids[5]!));
    const result = await listShellJobs({ context });
    expect(result.jobs).toEqual([]);
    expect(Object.fromEntries(result.errors.map(({ id, code }) => [id, code]))).toEqual({
      [ids[0]!]: "manifest_invalid", [ids[1]!]: "identity_mismatch", [ids[2]!]: "manifest_invalid",
      [ids[3]!]: "archive_unsafe", [ids[4]!]: "archive_unsafe", [ids[5]!]: "incomplete_start",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_MANIFEST_FRAGMENT");
  });

  it("bounds diagnostics and rejects a redirected runtime root", async () => {
    const { context, primary, outside } = await fixture();
    const runtime = join(primary, "artifacts", "workforge-mcp", "shell");
    await mkdir(runtime, { recursive: true });
    for (let index = 0; index < 110; index += 1) {
      await mkdir(join(runtime, `shell_${index.toString(16).padStart(32, "0")}`));
    }
    const result = await listShellJobs({ context, limit: 100 });
    expect(result.errors).toHaveLength(100);
    expect(result.errorsTruncated).toBe(true);
    await rm(runtime, { recursive: true });
    await symlink(outside, runtime, process.platform === "win32" ? "junction" : "dir");
    await expect(listShellJobs({ context })).rejects.toThrow("redirected");
  });

  it("lists attached jobs once through MCP and finds their sealed archives", async () => {
    const { context, primary, outside } = await fixture();
    const started = await startShellJob({ context, cwd: primary,
      command: shellCommand("Start-Sleep -Seconds 1; Write-Output 'done'", "sleep 1; echo done"), timeoutMs: 10_000 });
    const client = new Client({ name: "history-test", version: "1" });
    const server = createServer(context);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const response = await client.callTool({ name: "shell_list", arguments: {} });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ jobs: [{ id: started.id, trackingState: "attached" }] });
      expect((await listShellJobs({ context, cwd: outside })).jobs).toEqual([]);
      await waitForTerminal(context, started.id);
      const result = await listShellJobs({ context });
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0]).toMatchObject({ id: started.id, trackingState: "archived_terminal", status: "completed" });
    } finally {
      cancelActiveShellJobs(context);
      await client.close();
      await server.close();
    }
  });

  it("runs multiline PowerShell outside the profile root and separates stdout/stderr", async () => {
    const { context, primary, outside } = await fixture();
    const started = await startShellJob({
      context,
      cwd: outside,
      command: shellCommand(
        "$here=(Get-Location).Path\nWrite-Output $here\n[Console]::Error.WriteLine('stderr-marker')\nWrite-Output '한글-marker'",
        "pwd\nprintf '%s\\n' 'stderr-marker' >&2\nprintf '%s\\n' '한글-marker'",
      ),
      timeoutMs: 10_000,
    });
    const status = await waitForTerminal(context, started.id);
    expect(status.status).toBe("completed");
    expect(status.exitCode).toBe(0);
    const output = await getShellOutput({ context, id: started.id, stdoutOffset: 0, stderrOffset: 0, maxCharacters: 20_000 });
    expect(output.stdout.text).toContain(outside);
    expect(output.stdout.text).toContain("한글-marker");
    expect(output.stderr.text).toContain("stderr-marker");
    expect(output.complete).toBe(true);
    expect(output.trackingState).toBe("archived_terminal");
    expect(output.replayAllowed).toBe(false);

    const jobRoot = join(primary, "artifacts", "workforge-mcp", "shell", started.id);
    const [startedManifest, terminalManifest] = await Promise.all([
      readFile(join(jobRoot, "started.json"), "utf8"),
      readFile(join(jobRoot, "terminal.json"), "utf8"),
    ]);
    expect(startedManifest).not.toContain("stderr-marker");
    expect(terminalManifest).not.toContain("stderr-marker");
    expect(JSON.parse(terminalManifest)).toMatchObject({
      status: "completed",
      replayAllowed: false,
      stdoutSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      stderrSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    await appendFile(join(jobRoot, "stdout.log"), "tampered", "utf8");
    await expect(getShellOutput({ context, id: started.id, stdoutOffset: 0, stderrOffset: 0, maxCharacters: 20_000 }))
      .rejects.toThrow("evidence is incomplete or has changed");
  });

  it("publishes a 30 second maximum shell wait", async () => {
    const { context } = await fixture();
    const server = createServer(context);
    const client = new Client({ name: "shell-schema-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      const shellStatus = listed.tools.find((tool) => tool.name === "shell_status");
      const shellOutput = listed.tools.find((tool) => tool.name === "shell_output");
      expect(shellStatus?.inputSchema).toMatchObject({ properties: { waitMs: { maximum: 30_000 } } });
      expect(shellOutput?.inputSchema).toMatchObject({ properties: { waitMs: { maximum: 30_000 } } });
    } finally {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });

  it("stops waiting promptly when the request is aborted", async () => {
    const { context } = await fixture();
    const started = await startShellJob({
      context,
      cwd: ".",
      command: shellCommand("Start-Sleep -Seconds 20", "sleep 20"),
      timeoutMs: 30_000,
    });
    const controller = new AbortController();
    const waitedFrom = Date.now();
    const waiting = waitForShellSettled(context, started.id, 5_000, controller.signal);
    setTimeout(() => controller.abort(), 100);
    try {
      await waiting;
      expect(Date.now() - waitedFrom).toBeLessThan(1_000);
      expect(getShellStatus(context, started.id).status).toBe("running");
    } finally {
      cancelShellJob(context, started.id);
      await waitForTerminal(context, started.id);
    }
  });

  it("waits server-side for a slow job instead of forcing the caller to poll", async () => {
    const { context } = await fixture();
    const started = await startShellJob({
      context,
      cwd: ".",
      command: shellCommand(
        "Start-Sleep -Milliseconds 1500\nWrite-Output 'slow-done'",
        "sleep 1.5\nprintf '%s\\n' 'slow-done'",
      ),
      timeoutMs: 20_000,
    });
    expect(getShellStatus(context, started.id).status).toBe("running");
    await waitForShellSettled(context, started.id, 20_000);
    const output = await getShellOutput({ context, id: started.id, stdoutOffset: 0, stderrOffset: 0, maxCharacters: 20_000 });
    expect(output.complete).toBe(true);
    expect(output.status).toBe("completed");
    expect(output.stdout.text).toContain("slow-done");
  });

  it("returns while the job is still running when waitMs expires first", async () => {
    const { context } = await fixture();
    const started = await startShellJob({
      context,
      cwd: ".",
      command: shellCommand("Start-Sleep -Seconds 20", "sleep 20"),
      timeoutMs: 30_000,
    });
    const waitedFrom = Date.now();
    try {
      await waitForShellSettled(context, started.id, 300);
      expect(Date.now() - waitedFrom).toBeLessThan(5_000);
      expect(getShellStatus(context, started.id).status).toBe("running");
    } finally {
      cancelShellJob(context, started.id);
      await waitForTerminal(context, started.id);
    }
  });

  it("does not inherit the tunnel control-plane credential", async () => {
    const { context, outside } = await fixture();
    const previous = process.env.CONTROL_PLANE_API_KEY;
    process.env.CONTROL_PLANE_API_KEY = "must-not-reach-child";
    try {
      const started = await startShellJob({
        context,
        cwd: outside,
        command: shellCommand(
          "if ($null -eq $env:CONTROL_PLANE_API_KEY) { Write-Output 'SCRUBBED' } else { Write-Output 'LEAKED' }",
          "if [[ -z ${CONTROL_PLANE_API_KEY+x} ]]; then printf '%s\\n' SCRUBBED; else printf '%s\\n' LEAKED; fi",
        ),
        timeoutMs: 10_000,
      });
      await waitForTerminal(context, started.id);
      const output = await getShellOutput({ context, id: started.id, stdoutOffset: 0, stderrOffset: 0, maxCharacters: 20_000 });
      expect(output.stdout.text).toContain("SCRUBBED");
      expect(output.stdout.text).not.toContain("must-not-reach-child");
    } finally {
      if (previous === undefined) delete process.env.CONTROL_PLANE_API_KEY;
      else process.env.CONTROL_PLANE_API_KEY = previous;
    }
  });

  it("reports nonzero exits and can cancel an active process tree", async () => {
    const { context, outside } = await fixture();
    const failed = await startShellJob({
      context,
      cwd: outside,
      command: shellCommand("Write-Error 'expected failure'\nexit 7", "printf '%s\\n' 'expected failure' >&2\nexit 7"),
      timeoutMs: 10_000,
    });
    const failedStatus = await waitForTerminal(context, failed.id);
    expect(failedStatus.status).toBe("failed");
    expect(failedStatus.exitCode).toBe(7);

    const long = await startShellJob({ context, cwd: outside, command: shellCommand("Start-Sleep -Seconds 30", "sleep 30"), timeoutMs: 60_000 });
    const cancelled = cancelShellJob(context, long.id);
    expect(cancelled.status).toBe("running");
    expect(cancelled.cancelRequested).toBe(true);
    const terminal = await waitForTerminal(context, long.id);
    expect(terminal.status).toBe("cancelled");
  });

  it("cancels the active job for the profile when its stdio owner closes", async () => {
    const { context, outside } = await fixture();
    const first = await startShellJob({ context, cwd: outside, command: shellCommand("Start-Sleep -Seconds 30", "sleep 30"), timeoutMs: 60_000 });
    expect(cancelActiveShellJobs(context)).toBe(1);
    expect(cancelActiveShellJobs(context)).toBe(0);
    const firstStatus = await waitForTerminal(context, first.id);
    expect(firstStatus.status).toBe("cancelled");
  });

  it("rejects another managed project's cwd before creating logs or spawning a job", async () => {
    const { context, primary, foreign } = await fixture();
    const marker = join(foreign, "must-not-run.txt");
    await expect(startShellJob({
      context,
      cwd: foreign,
      command: shellCommand(
        `Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value 'unexpected'`,
        `printf '%s\\n' unexpected > ${quoteZsh(marker)}`,
      ),
      timeoutMs: 10_000,
    })).rejects.toThrow("foreign-profile");
    await expect(access(marker)).rejects.toThrow();
    await expect(access(join(primary, "artifacts", "workforge-mcp", "shell"))).rejects.toThrow();
  });

  it("rejects same-profile concurrent starts before spawn without blocking another project profile", async () => {
    const { context, outside } = await fixture();
    const marker = join(outside, "writer-started.txt");
    const escapedMarker = marker.replaceAll("'", "''");
    const first = await startShellJob({
      context,
      cwd: outside,
      command: shellCommand(
        `Set-Content -LiteralPath '${escapedMarker}' -Value 'started'\nStart-Sleep -Seconds 30`,
        `printf '%s\\n' started > ${quoteZsh(marker)}\nsleep 30`,
      ),
      timeoutMs: 60_000,
    });
    const markerDeadline = Date.now() + 10_000;
    while (Date.now() < markerDeadline) {
      try {
        await access(marker);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }
    await expect(access(marker)).resolves.toBeUndefined();
    const evidenceDeadline = Date.now() + 10_000;
    let firstEvidence = getShellStatus(context, first.id);
    while (Date.now() < evidenceDeadline && (!firstEvidence.leaseAcquired || !firstEvidence.containmentEnforced)) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      firstEvidence = getShellStatus(context, first.id);
    }
    expect(firstEvidence.leaseAcquired).toBe(true);
    expect(firstEvidence.containmentKind).toBe(process.platform === "win32" ? "windows_job_object_kill_on_close" : "posix_process_group");
    expect(firstEvidence.containmentEnforced).toBe(true);
    expect(firstEvidence.processId).toEqual(expect.any(Number));

    await expect(startShellJob({
      context,
      cwd: outside,
      command: shellCommand("Write-Output 'must-not-run'", "printf '%s\\n' must-not-run"),
      timeoutMs: 10_000,
    })).rejects.toThrow("1 active shell jobs");

    const otherProfile = await fixture();
    const other = await startShellJob({
      context: otherProfile.context,
      cwd: otherProfile.outside,
      command: shellCommand("Write-Output 'other-profile-ran'", "printf '%s\\n' other-profile-ran"),
      timeoutMs: 10_000,
    });
    expect((await waitForTerminal(otherProfile.context, other.id)).status).toBe("completed");

    cancelShellJob(context, first.id);
    await waitForTerminal(context, first.id);
    const afterRelease = await startShellJob({
      context,
      cwd: outside,
      command: shellCommand("Write-Output 'writer-after-release'", "printf '%s\\n' writer-after-release"),
      timeoutMs: 10_000,
    });
    expect((await waitForTerminal(context, afterRelease.id)).status).toBe("completed");
  }, 30_000);

  it.runIf(process.platform !== "win32")("recovers a stale POSIX profile lease whose owner is gone", async () => {
    const { context, primary, outside } = await fixture();
    const runtimeRoot = join(primary, "artifacts", "workforge-mcp", "shell");
    await mkdir(runtimeRoot, { recursive: true });
    await writeFile(join(runtimeRoot, "profile-shell-owner.lock"), "", "utf8");
    await writeFile(join(runtimeRoot, "profile-shell-owner.json"), JSON.stringify({ processId: 999_999_999 }), "utf8");
    const started = await startShellJob({
      context,
      cwd: outside,
      command: "printf '%s\\n' recovered",
      timeoutMs: 10_000,
    });
    const terminal = await waitForTerminal(context, started.id);
    expect(terminal.status).toBe("completed");
    expect(terminal.leaseAcquired).toBe(true);
  });

  it("kills a detached descendant when the owning shell exits", async () => {
    const { context, outside } = await fixture();
    const startedMarker = join(outside, "descendant-started.txt");
    const escapedStartedMarker = startedMarker.replaceAll("'", "''");
    const forbiddenMarker = join(outside, "descendant-outlived-owner.txt");
    const escapedForbiddenMarker = forbiddenMarker.replaceAll("'", "''");
    const descendantScript = [
      `Set-Content -LiteralPath '${escapedStartedMarker}' -Value $PID`,
      "Start-Sleep -Seconds 2",
      `Set-Content -LiteralPath '${escapedForbiddenMarker}' -Value 'escaped'`,
    ].join("\n");
    const encodedDescendant = Buffer.from(descendantScript, "utf16le").toString("base64");
    const powerShellCommand = [
      `$child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand','${encodedDescendant}') -PassThru`,
      "$deadline = [DateTime]::UtcNow.AddSeconds(15)",
      `while (-not (Test-Path -LiteralPath '${escapedStartedMarker}') -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 25 }`,
      `if (-not (Test-Path -LiteralPath '${escapedStartedMarker}')) { throw 'descendant did not start' }`,
      "Write-Output ('descendant=' + $child.Id)",
    ].join("\n");
    const command = shellCommand(
      powerShellCommand,
      [
        `(printf '%s\\n' $$ > ${quoteZsh(startedMarker)}; sleep 2; printf '%s\\n' escaped > ${quoteZsh(forbiddenMarker)}) &`,
        "descendant=$!",
        `deadline=$((SECONDS + 15)); while [[ ! -f ${quoteZsh(startedMarker)} && $SECONDS -lt $deadline ]]; do sleep 0.025; done`,
        `[[ -f ${quoteZsh(startedMarker)} ]] || exit 9`,
        "printf 'descendant=%s\\n' $descendant",
      ].join("\n"),
    );

    const started = await startShellJob({ context, cwd: outside, command, timeoutMs: 30_000 });
    const terminal = await waitForTerminal(context, started.id);
    expect(terminal.status).toBe("completed");
    expect(terminal.leaseAcquired).toBe(true);
    expect(terminal.containmentEnforced).toBe(true);
    await expect(access(startedMarker)).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await expect(access(forbiddenMarker)).rejects.toThrow();
  }, 30_000);

  it("rejects same-process concurrent starts before spawning redundant shells", async () => {
    const { context, outside } = await fixture();
    const attempts = await Promise.allSettled(Array.from({ length: 2 }, () => startShellJob({
      context,
      cwd: outside,
      command: shellCommand("Start-Sleep -Seconds 30", "sleep 30"),
      timeoutMs: 60_000,
    })));
    const accepted = attempts.filter((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof startShellJob>>> => attempt.status === "fulfilled");
    const rejected = attempts.filter((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.reason)).toContain("1 active shell jobs");

    cancelActiveShellJobs(context);
    await Promise.all(accepted.map((attempt) => waitForTerminal(context, attempt.value.id)));
  });

  it("reports a start-only archive as ownership_lost without replay or PID cancellation", async () => {
    const { context, primary, outside } = await fixture();
    const id = `shell_${randomBytes(16).toString("hex")}`;
    const jobRoot = join(primary, "artifacts", "workforge-mcp", "shell", id);
    await mkdir(jobRoot, { recursive: true });
    await Promise.all([
      writeFile(join(jobRoot, "stdout.log"), "partial-output", "utf8"),
      writeFile(join(jobRoot, "stderr.log"), "", "utf8"),
      writeFile(join(jobRoot, "terminal.json.tmp"), "partial", "utf8"),
    ]);
    const timestamp = new Date().toISOString();
    await writeFile(join(jobRoot, "started.json"), `${JSON.stringify({
      version: 1,
      kind: "connection_owned_shell",
      executionMode: "connection_owned",
      id,
      profileId: context.profile.id,
      status: "running",
      cwd: outside,
      leaseScope: `profile:${context.profile.id}:shell`,
      processId: null,
      leaseAcquired: false,
      containmentEnforced: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelRequested: false,
      timeoutMs: 60_000,
      commandUtf8Bytes: 10,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      inputSha256: "a".repeat(64),
      stdoutSha256: null,
      stderrSha256: null,
      replayAllowed: false,
    })}\n`, "utf8");

    const status = getShellStatus(context, id);
    expect(status.status).toBe("ownership_lost");
    expect(status.trackingState).toBe("ownership_lost");
    expect(status.replayAllowed).toBe(false);
    expect(() => cancelShellJob(context, id)).toThrow("refusing PID-based cancellation");
    const output = await getShellOutput({ context, id, stdoutOffset: 0, stderrOffset: 0, maxCharacters: 20_000 });
    expect(output.stdout.text).toBe("partial-output");
    expect(output.complete).toBe(false);
    await link(join(jobRoot, "started.json"), join(jobRoot, "started-hardlink.json"));
    expect(() => getShellStatus(context, id)).toThrow("missing or unsafe");
  });
});
