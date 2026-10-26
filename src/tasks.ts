import { createHash, randomInt, randomUUID } from "node:crypto";
import { lstatSync, opendirSync } from "node:fs";
import { lstat, mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { assertSafeRuntimeRoot, readBoundedArchiveFile, recentArchiveEntries } from "./archive.js";
import { deleteFileWithCas, writeTextFile } from "./filesystem.js";
import type { ProjectContext } from "./profile.js";
import { containsRedactionMarker, createRedactor, snapshotSecrets, type RedactionOptions } from "./redaction.js";
import { getShellStatus } from "./shell.js";
import { resolveAuthorizedWorkstationPath } from "./workstation.js";

const MAX_CHECKPOINT_BYTES = 128 * 1024;
export const taskIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/u)
  .refine((id) => !/^(?:con|nul|aux|prn|com[1-9]|lpt[1-9])$/u.test(id), "Reserved device name.");
const checkpointPath = z.string().min(1).max(4096);
export const taskStateSchema = z.object({
  title: z.string().min(1).max(200), objective: z.string().min(1).max(4000),
  reportedStatus: z.enum(["active", "blocked", "completed"]),
  plan: z.array(z.string().min(1).max(1000)).max(40),
  completedSteps: z.array(z.string().min(1).max(1000)).max(40),
  blockers: z.array(z.string().min(1).max(1000)).max(20), nextAction: z.string().max(4000),
  projectPath: checkpointPath, relatedPaths: z.array(checkpointPath).max(20),
  shellJobIds: z.array(z.string().regex(/^shell_[a-f0-9]{32}$/u)).max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate shell job ids."),
}).strict();
export const checkpointSchema = z.object({
  version: z.literal(1), taskId: taskIdSchema, profileId: z.string().min(1).max(128),
  savedAt: z.iso.datetime(), state: taskStateSchema,
}).strict();

const isMissing = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
const taskRoot = (context: ProjectContext) => resolve(context.primaryRoot, "artifacts", "workforge-mcp", "tasks");

const claimSchema = z.object({ version: z.literal(1), taskId: taskIdSchema, claimId: z.uuid(), owner: z.string().min(1).max(64),
  claimedAt: z.iso.datetime(), expiresAt: z.iso.datetime() }).strict();
function readClaim(context: ProjectContext, taskId: string) {
  taskIdSchema.parse(taskId);
  try {
    assertSafeRuntimeRoot(context, taskRoot(context));
    const bytes = readBoundedArchiveFile(resolve(taskRoot(context), `${taskId}.claim.json`), 8192, "Task claim");
    const claim = claimSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (claim.taskId !== taskId || claim.expiresAt <= claim.claimedAt) throw new Error("invalid");
    return { claim, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch (error) { if (isMissing(error)) return undefined; throw new Error("CLAIM_UNSAFE"); }
}
function claimSummary(context: ProjectContext, taskId: string) {
  const record = readClaim(context, taskId);
  return record ? { owner: record.claim.owner, expiresAt: record.claim.expiresAt, expired: Date.parse(record.claim.expiresAt) <= Date.now() } : null;
}

export async function claimTask(input: { context: ProjectContext; taskId: string; owner: string; ttlMinutes?: number;
  knownSecrets?: readonly string[]; redactionOptions?: RedactionOptions }) {
  taskIdSchema.parse(input.taskId);
  const ttl = input.ttlMinutes ?? 60;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 1440 || typeof input.owner !== "string" || !input.owner || input.owner.length > 64
    || /[\x00-\x1f\x7f]/u.test(input.owner)) throw new Error("Invalid claim input.");
  if (containsRedactionMarker(input.owner) || createRedactor(input.knownSecrets ?? snapshotSecrets(process.env).values, input.redactionOptions)(input.owner).redactionCount) throw new Error("CLAIM_SECRET");
  if (!readCheckpoint(input.context, input.taskId)) throw new Error("CHECKPOINT_MISSING");
  const existing = readClaim(input.context, input.taskId);
  if (existing && Date.parse(existing.claim.expiresAt) > Date.now() && existing.claim.owner !== input.owner) {
    throw new Error(`CLAIM_HELD: ${existing.claim.owner} until ${existing.claim.expiresAt}`);
  }
  const claim = { version: 1 as const, taskId: input.taskId, claimId: randomUUID(), owner: input.owner,
    claimedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + ttl * 60000).toISOString() };
  await writeTextFile({ context: input.context, path: resolve(taskRoot(input.context), `${input.taskId}.claim.json`),
    expectedSha256: existing?.sha256 ?? "absent", content: JSON.stringify(claim), createParents: false });
  return claim;
}

export async function releaseTask(input: { context: ProjectContext; taskId: string; claimId: string }) {
  const existing = readClaim(input.context, input.taskId);
  if (!existing || existing.claim.claimId !== input.claimId) throw new Error("CLAIM_MISMATCH");
  await deleteFileWithCas({ context: input.context, path: resolve(taskRoot(input.context), `${input.taskId}.claim.json`), expectedSha256: existing.sha256 });
  return { taskId: input.taskId, released: true };
}

export async function deleteTask(input: { context: ProjectContext; taskId: string; expectedSha256: string;
  confirm: "DELETE_TASK"; keepHistory?: boolean }) {
  if (input.confirm !== "DELETE_TASK") throw new Error("DELETE_TASK confirmation required.");
  const record = readCheckpoint(input.context, input.taskId);
  if (!record || record.sha256 !== input.expectedSha256) throw new Error("CHECKPOINT_CONFLICT");
  const keepHistory = input.keepHistory ?? true;
  if (keepHistory) {
    await prepareHistory(input.context, input.taskId);
    const history = await saveHistory(input.context, input.taskId, record);
    if (history.history !== "saved") throw new Error("CHECKPOINT_HISTORY_REQUIRED");
  } else {
    const history = historyRecords(input.context, input.taskId);
    if (history.errors.length) throw new Error("CHECKPOINT_UNSAFE");
    // Validate the whole directory, including unexpected entries, before removing any revision.
    try {
      const root = historyRoot(input.context, input.taskId);
      const directory = opendirSync(root);
      try { for (let entry; (entry = directory.readSync());) {
        const info = lstatSync(resolve(root, entry.name));
        if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error("CHECKPOINT_UNSAFE");
      } } finally { directory.closeSync(); }
    } catch (error) { if (!isMissing(error)) throw error; }
  }
  await deleteFileWithCas({ context: input.context, path: resolve(taskRoot(input.context), `${input.taskId}.json`), expectedSha256: input.expectedSha256 });
  if (!keepHistory) {
    try {
      const root = historyRoot(input.context, input.taskId);
      const directory = opendirSync(root);
      try { for (let entry; (entry = directory.readSync());) {
        const path = resolve(historyRoot(input.context, input.taskId), entry.name);
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error("CHECKPOINT_UNSAFE");
        await rm(path);
      } } finally { directory.closeSync(); }
      await rmdir(root);
    }
    catch (error) { if (!isMissing(error)) throw new Error("CHECKPOINT_DELETED_HISTORY_CLEANUP_FAILED"); }
  }
  return { taskId: input.taskId, deleted: true, historyKept: keepHistory };
}

export async function referencedShellJobs(context: ProjectContext, signal?: AbortSignal) {
  const discovery = await recentArchiveEntries(context, taskRoot(context), /^[a-z0-9][a-z0-9_-]{0,63}\.json$/u, "file", 500, signal, 1000);
  if (discovery.scanLimited || discovery.candidateCount > 1000 || discovery.unsafeNames.length) throw new Error("TASK_REFERENCES_UNAVAILABLE");
  const ids = new Set<string>();
  for (const entry of discovery.entries) {
    signal?.throwIfAborted();
    const record = readCheckpoint(context, entry.name.slice(0, -5));
    if (!record) throw new Error("TASK_REFERENCES_UNAVAILABLE");
    for (const id of record.checkpoint.state.shellJobIds) ids.add(id);
  }
  return ids;
}

async function assertTaskFile(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error("CHECKPOINT_UNSAFE");
  } catch (error) { if (!isMissing(error)) throw error; }
}

async function prepareTaskRoot(context: ProjectContext) {
  let directory = context.primaryRoot;
  for (const segment of ["artifacts", "workforge-mcp", "tasks"]) {
    directory = resolve(directory, segment);
    try { await mkdir(directory); }
    catch (error) { if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error; }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("CHECKPOINT_UNSAFE");
  }
  assertSafeRuntimeRoot(context, directory);
  const ignorePath = resolve(directory, ".gitignore");
  try { await writeFile(ignorePath, "*\n", { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
    if (!readBoundedArchiveFile(ignorePath, 8192, "Task ignore file").toString("utf8").split(/\r?\n/u).includes("*")) {
      throw new Error("CHECKPOINT_IGNORE_REQUIRED: preserve the existing file and add a wildcard ignore rule locally.");
    }
  }
}

function serializeCheckpoint(checkpoint: z.infer<typeof checkpointSchema>): string {
  const content = JSON.stringify(checkpoint) + "\n";
  const size = Buffer.byteLength(content, "utf8");
  if (size > MAX_CHECKPOINT_BYTES) throw new Error(`CHECKPOINT_TOO_LARGE: ${size} > ${MAX_CHECKPOINT_BYTES}`);
  return content;
}

function readCheckpoint(context: ProjectContext, taskId: string, path = resolve(taskRoot(context), `${taskId}.json`)) {
  taskIdSchema.parse(taskId);
  const root = taskRoot(context);
  let bytes: Buffer;
  try {
    assertSafeRuntimeRoot(context, root);
    bytes = readBoundedArchiveFile(path, MAX_CHECKPOINT_BYTES, "Task checkpoint");
  } catch (error) { if (isMissing(error)) return undefined; throw new Error("CHECKPOINT_UNSAFE"); }
  try {
    const checkpoint = checkpointSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (checkpoint.taskId !== taskId || checkpoint.profileId !== context.profile.id) throw new Error("identity");
    return { checkpoint, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch { throw new Error("CHECKPOINT_INVALID"); }
}

function historyRoot(context: ProjectContext, taskId: string) {
  taskIdSchema.parse(taskId);
  const root = taskRoot(context);
  assertSafeRuntimeRoot(context, root);
  for (const path of [resolve(root, ".history"), resolve(root, ".history", taskId)]) {
    const info = lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("CHECKPOINT_UNSAFE");
    assertSafeRuntimeRoot(context, path);
  }
  return resolve(root, ".history", taskId);
}

async function prepareHistory(context: ProjectContext, taskId: string) {
  for (const path of [resolve(taskRoot(context), ".history"), resolve(taskRoot(context), ".history", taskId)]) {
    try { await mkdir(path); } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
    }
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("CHECKPOINT_UNSAFE");
    assertSafeRuntimeRoot(context, path);
  }
  return historyRoot(context, taskId);
}

function historyRecords(context: ProjectContext, taskId: string) {
  const records: Array<NonNullable<ReturnType<typeof readCheckpoint>> & { name: string }> = [];
  const errors: Array<{ name: string; code: string }> = [];
  let root;
  try { root = historyRoot(context, taskId); }
  catch (error) { if (isMissing(error)) return { records, errors }; throw error; }
  const directory = opendirSync(root);
  try {
    for (let count = 0; ; count++) {
      const entry = directory.readSync();
      if (!entry) break;
      if (count >= 1000) { errors.push({ name: "", code: "history_scan_limit" }); break; }
      if (!/^\d{4}-\d{2}-\d{2}T\d{9}Z-[a-f0-9]{12}\.json$/u.test(entry.name)) continue;
      try {
        const record = readCheckpoint(context, taskId, resolve(root, entry.name));
        if (!record || entry.name !== historyName(record)) throw new Error("invalid");
        records.push({ ...record, name: entry.name });
      } catch { if (errors.length < 100) errors.push({ name: entry.name, code: "history_invalid" }); }
    }
  } finally { directory.closeSync(); }
  records.sort((a, b) => b.checkpoint.savedAt.localeCompare(a.checkpoint.savedAt) || a.name.localeCompare(b.name));
  return { records, errors };
}

function historyName(record: NonNullable<ReturnType<typeof readCheckpoint>>) {
  return `${record.checkpoint.savedAt.replace(/[:.]/gu, "")}-${record.sha256.slice(0, 12)}.json`;
}

async function saveHistory(context: ProjectContext, taskId: string, record: NonNullable<ReturnType<typeof readCheckpoint>>) {
  let root;
  try { root = historyRoot(context, taskId); }
  catch { return { history: "failed" as const, historyErrorCode: "history_unsafe" as const }; }
  const path = resolve(root, historyName(record));
  try {
    try { await writeFile(path, record.bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST"
        || readCheckpoint(context, taskId, path)?.sha256 !== record.sha256) throw error;
    }
  } catch { return { history: "failed" as const, historyErrorCode: "history_write_failed" as const }; }
  try {
    const { records, errors } = historyRecords(context, taskId);
    if (errors.length) throw new Error("Unsafe history entries.");
    for (const old of records.slice(20)) {
      const path = resolve(historyRoot(context, taskId), old.name);
      if (readCheckpoint(context, taskId, path)?.sha256 !== old.sha256) throw new Error("History changed.");
      await rm(path);
    }
  } catch { return { history: "saved" as const, historyErrorCode: "history_prune_failed" as const }; }
  return { history: "saved" as const, historyErrorCode: null };
}

export function taskHistory(context: ProjectContext, taskId: string, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Invalid history limit.");
  const { records, errors } = historyRecords(context, taskId);
  return { revisions: records.slice(0, limit).map(({ sha256, checkpoint: { savedAt, state } }) =>
    ({ sha256, savedAt, title: state.title, reportedStatus: state.reportedStatus })), errors };
}

export async function saveTaskCheckpoint(input: {
  context: ProjectContext; taskId?: string; expectedSha256: string; state: z.infer<typeof taskStateSchema>;
  knownSecrets?: readonly string[];
  redactionOptions?: RedactionOptions;
}) {
  if (input.taskId === undefined) {
    if (input.expectedSha256 !== "absent") throw new Error("taskId is required for updates.");
    const state = taskStateSchema.parse(input.state);
    const slug = state.title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 40) || "task";
    for (let attempt = 0; attempt < 3; attempt++) {
      const taskId = `${slug}-${randomInt(36 ** 6).toString(36).padStart(6, "0")}`;
      try { return await saveTaskCheckpoint({ ...input, taskId }); }
      catch (error) { if (!(error instanceof Error && error.message.startsWith("CHECKPOINT_EXISTS")) || attempt === 2) throw error; }
    }
    throw new Error("CHECKPOINT_EXISTS");
  }
  const taskId = taskIdSchema.parse(input.taskId);
  if (!/^(?:absent|[a-f0-9]{64})$/u.test(input.expectedSha256)) throw new Error("Invalid checkpoint expectedSha256.");
  const state = taskStateSchema.parse(input.state);
  const redact = createRedactor(input.knownSecrets ?? snapshotSecrets(process.env).values, input.redactionOptions);
  const checkSecrets = (value: unknown, path: string) => {
    if (typeof value === "string" && (containsRedactionMarker(value) || redact(value).redactionCount > 0)) {
      throw new Error(`CHECKPOINT_SECRET: ${path}`);
    }
    if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) checkSecrets(child, `${path}.${key}`);
  };
  checkSecrets(state, "state");
  const savedAt = new Date().toISOString();
  const checkpoint = { version: 1 as const, taskId, profileId: input.context.profile.id, savedAt, state };
  serializeCheckpoint(checkpoint);
  state.projectPath = await resolveAuthorizedWorkstationPath(input.context, state.projectPath, "tree");
  state.relatedPaths = await Promise.all(state.relatedPaths.map((path) => resolveAuthorizedWorkstationPath(input.context, path)));
  taskStateSchema.parse(state);
  checkSecrets(state, "state");
  const content = serializeCheckpoint(checkpoint);
  await prepareTaskRoot(input.context);
  const path = resolve(taskRoot(input.context), `${taskId}.json`);
  assertSafeRuntimeRoot(input.context, taskRoot(input.context));
  await assertTaskFile(path);
  const previous = input.expectedSha256 === "absent" ? undefined : readCheckpoint(input.context, taskId);
  if (input.expectedSha256 !== "absent" && previous?.sha256 !== input.expectedSha256) throw new Error("CHECKPOINT_CONFLICT: use task_resume.");
  if (previous) await prepareHistory(input.context, taskId);
  try {
    const result = await writeTextFile({ context: input.context, path, expectedSha256: input.expectedSha256, content, createParents: false });
    const history = previous ? await saveHistory(input.context, taskId, previous)
      : { history: "not_applicable" as const, historyErrorCode: null };
    return { taskId, savedAt, sha256: result.sha256, created: result.created, ...history };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("already exists") || (error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
      throw new Error("CHECKPOINT_EXISTS: use task_resume to obtain the current state and sha256.");
    }
    if (message.includes("changed after") || message.includes("no longer exists")) {
      throw new Error("CHECKPOINT_CONFLICT: use task_resume to obtain the current state and sha256.");
    }
    throw error;
  }
}

export function resumeTask(context: ProjectContext, taskId: string, revisionSha256?: string) {
  if (revisionSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(revisionSha256)) throw new Error("Invalid revisionSha256.");
  const record = revisionSha256 === undefined ? readCheckpoint(context, taskId)
    : historyRecords(context, taskId).records.find(record => record.sha256 === revisionSha256);
  const shellEvidence = (record?.checkpoint.state.shellJobIds ?? []).map((id) => {
    try {
      const { status, trackingState, exitCode, timedOut, createdAt, updatedAt, evidenceSealed } = getShellStatus(context, id);
      return { id, available: true as const, status, trackingState, exitCode, timedOut, createdAt, updatedAt, evidenceSealed };
    } catch { return { id, available: false as const, code: "unavailable" as const }; }
  });
  const evidenceSummary = { total: shellEvidence.length, completed: 0, failed: 0, cancelled: 0,
    unsealed: 0, unavailable: 0, latestUpdatedAt: null as string | null, latestStatus: null as string | null };
  for (const evidence of shellEvidence) {
    if (!evidence.available) { evidenceSummary.unavailable++; continue; }
    if (evidence.status === "ownership_lost") evidenceSummary.unsealed++;
    else if (evidence.status !== "running") evidenceSummary[evidence.status]++;
    if (evidenceSummary.latestUpdatedAt === null || evidence.updatedAt > evidenceSummary.latestUpdatedAt) {
      evidenceSummary.latestUpdatedAt = evidence.updatedAt;
      evidenceSummary.latestStatus = evidence.status;
    }
  }
  return { found: record !== undefined, checkpoint: record?.checkpoint ?? null, sha256: record?.sha256 ?? null,
    stateSource: "reported" as const, shellEvidence, evidenceSummary, revision: revisionSha256 !== undefined, claim: claimSummary(context, taskId) };
}

export async function listTasks(context: ProjectContext, limit = 20, signal?: AbortSignal) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be from 1 to 100.");
  const discovery = await recentArchiveEntries(context, taskRoot(context), /^[a-z0-9][a-z0-9_-]{0,63}\.json$/u, "file", limit, signal);
  const errors = discovery.unsafeNames.map((name) => ({ name, code: "CHECKPOINT_UNSAFE" }));
  let errorsTruncated = discovery.errorsTruncated;
  const tasks = [];
  for (const { name } of discovery.entries) {
    await new Promise<void>((done) => setImmediate(done));
    signal?.throwIfAborted();
    try {
      const record = readCheckpoint(context, name.slice(0, -5));
      if (!record) throw new Error("CHECKPOINT_MISSING");
      const { taskId, savedAt, state } = record.checkpoint;
      tasks.push({ taskId, title: state.title, reportedStatus: state.reportedStatus, savedAt, claim: claimSummary(context, taskId) });
    } catch {
      if (errors.length < 100) errors.push({ name, code: "CHECKPOINT_INVALID" });
      else errorsTruncated = true;
    }
  }
  tasks.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.taskId.localeCompare(b.taskId));
  const result = tasks.slice(0, limit);
  return { tasks: result, scannedEntries: discovery.scannedEntries, scanLimited: discovery.scanLimited,
    truncated: discovery.scanLimited || discovery.candidateCount > result.length, errors, errorsTruncated };
}
