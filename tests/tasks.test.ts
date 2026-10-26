import { access, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as shell from "../src/shell.js";
import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ProjectContext, ProjectProfile } from "../src/profile.js";
import { createServer } from "../src/server.js";
import { startShellJob, waitForShellSettled } from "../src/shell.js";
import { claimTask, deleteTask, listTasks, releaseTask, resumeTask, saveTaskCheckpoint, taskHistory, taskIdSchema } from "../src/tasks.js";

vi.mock("node:fs/promises", async (original) => ({ ...await original<typeof import("node:fs/promises")>() }));
vi.mock("node:crypto", async (original) => ({ ...await original<typeof import("node:crypto")>() }));

const roots: string[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workforge-tasks-")));
  roots.push(root);
  const primaryRoot = join(root, "primary");
  const foreign = join(root, "foreign");
  await mkdir(primaryRoot); await mkdir(foreign);
  const profile = { id: "tasks-test", displayName: "Tasks", appName: "Tasks", serverName: "tasks-test",
    defaultWorkingDirectoryRelative: ".", bootstrapFiles: [], identityMarkers: [], primaryRoot } as unknown as ProjectProfile;
  const context: ProjectContext = { profile, primaryRoot, defaultWorkingDirectory: primaryRoot, engineRoot: root,
    managedProjectRoots: [{ profileId: profile.id, primaryRoot }, { profileId: "foreign", primaryRoot: foreign }] };
  const state = { title: "Test task", objective: "Complete the change", reportedStatus: "active" as const,
    plan: ["Inspect", "Change", "Verify"], completedSteps: [], blockers: [], nextAction: "Inspect the files",
    projectPath: primaryRoot, relatedPaths: [], shellJobIds: [] };
  return { context, state, foreign, taskRoot: join(primaryRoot, "artifacts", "workforge-mcp", "tasks") };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("task checkpoints", () => {
  it("enforces advisory ownership, expiration, release identity and deletion CAS", async () => {
    const { context, state, taskRoot } = await fixture();
    const saved = await saveTaskCheckpoint({ context, taskId: "claimed", expectedSha256: "absent", state });
    const claim = await claimTask({ context, taskId: "claimed", owner: "codex" });
    expect(resumeTask(context, "claimed").claim).toMatchObject({ owner: "codex", expired: false });
    await expect(claimTask({ context, taskId: "claimed", owner: "claude" })).rejects.toThrow("CLAIM_HELD");
    const renewed = await claimTask({ context, taskId: "claimed", owner: "codex" });
    expect(renewed.claimId).not.toBe(claim.claimId);
    await expect(releaseTask({ context, taskId: "claimed", claimId: claim.claimId })).rejects.toThrow("CLAIM_MISMATCH");
    await writeFile(join(taskRoot, "claimed.claim.json"), JSON.stringify({ ...renewed, claimedAt: "2020-01-01T00:00:00.000Z", expiresAt: "2020-01-02T00:00:00.000Z" }));
    const taken = await claimTask({ context, taskId: "claimed", owner: "claude" });
    await releaseTask({ context, taskId: "claimed", claimId: taken.claimId });
    expect(resumeTask(context, "claimed").claim).toBe(null);
    await expect(claimTask({ context, taskId: "claimed", owner: "deploy_phrase=private", redactionOptions: { extraKeyNames: ["deploy_phrase"] } })).rejects.toThrow("CLAIM_SECRET");
    await expect(deleteTask({ context, taskId: "claimed", expectedSha256: "0".repeat(64), confirm: "DELETE_TASK" })).rejects.toThrow("CHECKPOINT_CONFLICT");
    await expect(deleteTask({ context, taskId: "claimed", expectedSha256: saved.sha256, confirm: undefined as never })).rejects.toThrow("confirmation");
    await deleteTask({ context, taskId: "claimed", expectedSha256: saved.sha256, confirm: "DELETE_TASK" });
    expect(resumeTask(context, "claimed").found).toBe(false);
    expect(taskHistory(context, "claimed").revisions[0]?.sha256).toBe(saved.sha256);
    const recreated = await saveTaskCheckpoint({ context, taskId: "claimed", expectedSha256: "absent", state });
    await deleteTask({ context, taskId: "claimed", expectedSha256: recreated.sha256, confirm: "DELETE_TASK", keepHistory: false });
    await expect(access(join(taskRoot, ".history", "claimed"))).rejects.toThrow();
  });
  it("accepts an identical existing revision and reports pruning failures without undoing saves", async () => {
    const { context, state, taskRoot } = await fixture();
    const first = await saveTaskCheckpoint({ context, taskId: "idempotent", expectedSha256: "absent", state });
    const directory = join(taskRoot, ".history", "idempotent");
    await mkdir(directory, { recursive: true });
    const name = `${first.savedAt.replace(/[:.]/gu, "")}-${first.sha256.slice(0, 12)}.json`;
    await writeFile(join(directory, name), await readFile(join(taskRoot, "idempotent.json")));
    const second = await saveTaskCheckpoint({ context, taskId: "idempotent", expectedSha256: first.sha256, state: { ...state, title: "Second" } });
    expect(second).toMatchObject({ history: "saved", historyErrorCode: null });
    await writeFile(join(directory, name), "corrupted");
    const third = await saveTaskCheckpoint({ context, taskId: "idempotent", expectedSha256: second.sha256, state });
    expect(third).toMatchObject({ history: "saved", historyErrorCode: "history_prune_failed" });
    expect(resumeTask(context, "idempotent").sha256).toBe(third.sha256);
    expect(resumeTask(context, "idempotent", first.sha256).found).toBe(false);
  });
  it("retains bounded revisions, retrieves by raw hash and makes no history for stale CAS", async () => {
    const { context, state, taskRoot } = await fixture();
    expect(taskHistory(context, "history").revisions).toEqual([]);
    await expect(access(taskRoot)).rejects.toThrow();
    let saved = await saveTaskCheckpoint({ context, taskId: "history", expectedSha256: "absent", state });
    expect(saved.history).toBe("not_applicable");
    const firstHash = saved.sha256;
    for (let i = 0; i < 22; i++) {
      saved = await saveTaskCheckpoint({ context, taskId: "history", expectedSha256: saved.sha256,
        state: { ...state, title: `Revision ${i}` } });
      expect(saved.history).toBe("saved");
    }
    const history = taskHistory(context, "history", 20);
    expect(history.revisions).toHaveLength(20);
    expect(resumeTask(context, "history", firstHash).found).toBe(false);
    const revision = history.revisions[0]!;
    expect(resumeTask(context, "history", revision.sha256)).toMatchObject({ revision: true, sha256: revision.sha256,
      checkpoint: { state: { title: revision.title } } });
    await expect(saveTaskCheckpoint({ context, taskId: "history", expectedSha256: firstHash, state })).rejects.toThrow("CHECKPOINT_CONFLICT");
    expect(taskHistory(context, "history", 20)).toEqual(history);
  });

  it("reports history failure separately from a committed checkpoint", async () => {
    const { context, state } = await fixture();
    const first = await saveTaskCheckpoint({ context, taskId: "failure", expectedSha256: "absent", state });
    const write = fs.writeFile;
    const mock = vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
      if (String(args[0]).includes(".history") && String(args[0]).endsWith(".json")) throw new Error("private disk path");
      return write(...args);
    });
    let second;
    try {
      second = await saveTaskCheckpoint({ context, taskId: "failure", expectedSha256: first.sha256, state: { ...state, title: "Updated" } });
      expect(second).toMatchObject({ history: "failed", historyErrorCode: "history_write_failed" });
      expect(resumeTask(context, "failure").sha256).toBe(second.sha256);
    } finally { mock.mockRestore(); }
    const next = await saveTaskCheckpoint({ context, taskId: "failure", expectedSha256: second!.sha256, state });
    expect(next.history).toBe("saved");
  });

  it("rejects redirected history and generates explicit IDs with collision retries", async () => {
    const { context, state, taskRoot, foreign } = await fixture();
    const first = await saveTaskCheckpoint({ context, expectedSha256: "absent", state: { ...state, title: "한글" } });
    expect(first.taskId).toMatch(/^task-[a-z0-9]{6}$/u);
    await expect(saveTaskCheckpoint({ context, expectedSha256: first.sha256, state })).rejects.toThrow("taskId");
    const random = vi.spyOn(crypto, "randomInt").mockReturnValue(1 as never);
    try {
      const generated = await saveTaskCheckpoint({ context, expectedSha256: "absent", state });
      expect(generated.taskId).toBe("test-task-000001");
      random.mockReturnValueOnce(1 as never).mockReturnValueOnce(2 as never);
      expect((await saveTaskCheckpoint({ context, expectedSha256: "absent", state })).taskId).toBe("test-task-000002");
    } finally { random.mockRestore(); }
    await symlink(foreign, join(taskRoot, ".history"), "junction");
    await expect(saveTaskCheckpoint({ context, taskId: first.taskId, expectedSha256: first.sha256, state })).rejects.toThrow("CHECKPOINT_UNSAFE");
    expect(() => taskHistory(context, first.taskId)).toThrow("CHECKPOINT_UNSAFE");
  });
  it("keeps reported completion separate from a failed shell's sealed evidence", async () => {
    const { context, state } = await fixture();
    const job = await startShellJob({ context, command: "exit 2", cwd: context.primaryRoot, timeoutMs: 10_000 });
    await waitForShellSettled(context, job.id, 10_000);
    await saveTaskCheckpoint({ context, taskId: "reported", expectedSha256: "absent",
      state: { ...state, reportedStatus: "completed", shellJobIds: [job.id] } });
    expect(resumeTask(context, "reported")).toMatchObject({ stateSource: "reported",
      checkpoint: { state: { reportedStatus: "completed" } },
      evidenceSummary: { total: 1, failed: 1, completed: 0, cancelled: 0, unsealed: 0, unavailable: 0, latestStatus: "failed" },
      shellEvidence: [{ id: job.id, available: true, status: "failed", exitCode: 2, evidenceSealed: true }] });
    const checkpoint = resumeTask(context, "reported");
    const statuses = ["failed", "completed", "cancelled", "ownership_lost"] as const;
    const ids = statuses.map((_, index) => `shell_${String(index).repeat(32)}`);
    await saveTaskCheckpoint({ context, taskId: "reported", expectedSha256: checkpoint.sha256!,
      state: { ...state, shellJobIds: [...ids, `shell_${"f".repeat(32)}`] } });
    const original = shell.getShellStatus(context, job.id);
    const mock = vi.spyOn(shell, "getShellStatus").mockImplementation((_context, id) => {
      const index = ids.indexOf(id);
      if (index < 0) throw new Error("unavailable");
      return { ...original, id, status: statuses[index], updatedAt: `2026-01-0${index + 1}T00:00:00.000Z` };
    });
    try {
      expect(resumeTask(context, "reported").evidenceSummary).toEqual({ total: 5, completed: 1, failed: 1,
        cancelled: 1, unsealed: 1, unavailable: 1, latestUpdatedAt: "2026-01-04T00:00:00.000Z", latestStatus: "ownership_lost" });
    } finally { mock.mockRestore(); }
  }, 15_000);

  it("discovers missing tasks without writes, then creates, resumes and CAS-updates raw bytes", async () => {
    const { context, state, taskRoot } = await fixture();
    expect(resumeTask(context, "first")).toMatchObject({ found: false, checkpoint: null, sha256: null });
    expect((await listTasks(context)).tasks).toEqual([]);
    await expect(access(taskRoot)).rejects.toThrow();
    const first = await saveTaskCheckpoint({ context, taskId: "first", expectedSha256: "absent", state });
    expect(first.created).toBe(true);
    expect(await readFile(join(taskRoot, ".gitignore"), "utf8")).toBe("*\n");
    const loaded = resumeTask({ ...context }, "first");
    expect(loaded.sha256).toBe(first.sha256);
    expect(loaded.checkpoint?.state).toEqual(state);
    expect(loaded.evidenceSummary).toEqual({ total: 0, completed: 0, failed: 0, cancelled: 0,
      unsealed: 0, unavailable: 0, latestUpdatedAt: null, latestStatus: null });
    const second = await saveTaskCheckpoint({ context, taskId: "first", expectedSha256: first.sha256,
      state: { ...state, reportedStatus: "completed", shellJobIds: [`shell_${"a".repeat(32)}`] } });
    expect(second.created).toBe(false);
    const resumed = resumeTask(context, "first");
    expect(resumed.evidenceSummary).toMatchObject({ total: 1, unavailable: 1, latestStatus: null });
    expect(resumed).toMatchObject({ stateSource: "reported", checkpoint: { state: { reportedStatus: "completed" } },
      shellEvidence: [{ available: false, code: "unavailable" }] });
    await expect(saveTaskCheckpoint({ context, taskId: "first", expectedSha256: first.sha256, state })).rejects.toThrow("CHECKPOINT_CONFLICT");
    await expect(saveTaskCheckpoint({ context, taskId: "first", expectedSha256: "absent", state })).rejects.toThrow("CHECKPOINT_EXISTS");
    expect((await listTasks(context)).tasks).toEqual([{ taskId: "first", title: state.title, reportedStatus: "completed", savedAt: second.savedAt, claim: null }]);
  });

  it("rejects reserved IDs, secrets, markers, foreign paths and oversized state before persistence", async () => {
    const { context, state, foreign, taskRoot } = await fixture();
    for (const id of ["con", "nul", "com1", "lpt9", "../escape", "Upper"]) expect(taskIdSchema.safeParse(id).success).toBe(false);
    const base = { context, taskId: "first", expectedSha256: "absent" };
    await expect(saveTaskCheckpoint({ ...base, state: { ...state, objective: "password=synthetic-value" } })).rejects.toThrow("CHECKPOINT_SECRET: state.objective");
    await expect(saveTaskCheckpoint({ ...base, knownSecrets: ["known-synthetic-value"], state: { ...state, title: "known-synthetic-value" } })).rejects.toThrow("CHECKPOINT_SECRET: state.title");
    await expect(saveTaskCheckpoint({ ...base, state: { ...state, nextAction: "[WORKFORGE_REDACTED]" } })).rejects.toThrow("CHECKPOINT_SECRET");
    await expect(saveTaskCheckpoint({ ...base, state: { ...state, projectPath: foreign } })).rejects.toThrow();
    await expect(saveTaskCheckpoint({ ...base, state: { ...state, plan: Array(40).fill("한".repeat(1000)), completedSteps: Array(40).fill("글".repeat(1000)) } })).rejects.toThrow(/CHECKPOINT_TOO_LARGE: \d+ > 131072/u);
    await expect(access(taskRoot)).rejects.toThrow();
  });

  it("refuses corrupt, foreign, hardlinked and redirected checkpoint archives", async () => {
    const { context, state, foreign, taskRoot } = await fixture();
    await saveTaskCheckpoint({ context, taskId: "first", expectedSha256: "absent", state });
    const path = join(taskRoot, "first.json");
    const original = await readFile(path, "utf8");
    await writeFile(path, JSON.stringify({ ...JSON.parse(original), profileId: "foreign" }));
    expect(() => resumeTask(context, "first")).toThrow("CHECKPOINT_INVALID");
    await writeFile(path, "PRIVATE_BROKEN_FRAGMENT");
    expect((await listTasks(context)).errors).toEqual([{ name: "first.json", code: "CHECKPOINT_INVALID" }]);
    await writeFile(path, original);
    await link(path, join(foreign, "linked"));
    expect(() => resumeTask(context, "first")).toThrow("CHECKPOINT_UNSAFE");
    await expect(saveTaskCheckpoint({ context, taskId: "first", expectedSha256: "a".repeat(64), state })).rejects.toThrow("CHECKPOINT_UNSAFE");
    await rm(taskRoot, { recursive: true });
    await symlink(foreign, taskRoot, process.platform === "win32" ? "junction" : "dir");
    expect(() => resumeTask(context, "first")).toThrow("CHECKPOINT_UNSAFE");
    await expect(saveTaskCheckpoint({ context, taskId: "second", expectedSha256: "absent", state })).rejects.toThrow("CHECKPOINT_UNSAFE");
    await expect(access(join(foreign, "second.json"))).rejects.toThrow();
  });

  it("allows one winner when checkpoint updates race", async () => {
    const { context, state } = await fixture();
    const first = await saveTaskCheckpoint({ context, taskId: "race", expectedSha256: "absent", state });
    const attempts = await Promise.allSettled(["One", "Two"].map((title) => saveTaskCheckpoint({ context,
      taskId: "race", expectedSha256: first.sha256, state: { ...state, title } })));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(["One", "Two"]).toContain(resumeTask(context, "race").checkpoint?.state.title);
  });

  it("exposes MCP discovery/resume in read-only and guards checkpoint writes", async () => {
    const { context, state } = await fixture();
    for (const readOnly of [false, true]) {
      const server = createServer(context, { readOnly });
      const client = new Client({ name: "task-test", version: "1" });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport); await client.connect(clientTransport);
        const bootstrap = await client.callTool({ name: "workstation_context", arguments: {} });
        const written = await client.callTool({ name: "task_checkpoint", arguments: { taskId: "mcp", state,
          expectedSha256: "absent", contextRevision: bootstrap.structuredContent!.contextRevision } });
        expect(written.isError === true).toBe(readOnly);
        const list = await client.callTool({ name: "task_list", arguments: {} });
        expect(list.isError).not.toBe(true);
        expect(list.structuredContent).toMatchObject({ tasks: [{ taskId: "mcp" }] });
        const resumed = await client.callTool({ name: "task_resume", arguments: { taskId: "mcp" } });
        expect(resumed.isError).not.toBe(true);
        expect(resumed.structuredContent).toMatchObject({ found: true, stateSource: "reported" });
      } finally { await client.close(); await server.close(); }
    }
  });
});
