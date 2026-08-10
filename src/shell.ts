import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  createWriteStream,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { z } from "zod";
import { normalizePathForComparison } from "./path-policy.js";
import type { ProjectContext } from "./profile.js";
import {
  killProcessTree,
  makeWorkstationEnvironment,
  resolvePowerShellExecutable,
} from "./process.js";
import { resolveAuthorizedWorkstationPath } from "./workstation.js";

const JOB_ID_PATTERN = /^shell_[a-f0-9]{32}$/u;
const MAX_ACTIVE_JOBS_PER_PROFILE = 8;
const MAX_LOG_BYTES_PER_STREAM = 16 * 1024 * 1024;
const MAX_STATUS_MANIFEST_BYTES = 64 * 1024;
const PROFILE_SHELL_BUSY_EXIT_CODE = 75;
const CONTAINMENT_KIND = process.platform === "win32"
  ? "windows_job_object_kill_on_close"
  : "posix_process_group";
const WINDOWS_JOB_OBJECT_CSHARP = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class WorkForgeMcpJobObject
{
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
    private const int JobObjectExtendedLimitInformation = 9;
    private const uint HANDLE_FLAG_INHERIT = 0x00000001;

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr securityAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    public static IntPtr AssignCurrentProcess()
    {
        IntPtr handle = CreateJobObject(IntPtr.Zero, null);
        if (handle == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateJobObject failed");
        try
        {
            if (!SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetHandleInformation failed");
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION information = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            information.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            uint size = (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            if (!SetInformationJobObject(handle, JobObjectExtendedLimitInformation, ref information, size))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "SetInformationJobObject failed");
            if (!AssignProcessToJobObject(handle, GetCurrentProcess()))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "AssignProcessToJobObject failed");
            return handle;
        }
        catch
        {
            CloseHandle(handle);
            throw;
        }
    }
}
`;
const POWERSHELL_STDIN_WRAPPER = [
  "$utf8 = [System.Text.UTF8Encoding]::new($false)",
  "[Console]::InputEncoding = $utf8",
  "[Console]::OutputEncoding = $utf8",
  "$OutputEncoding = $utf8",
  "$leaseMutex = $null",
  "$leaseAcquired = $false",
  "$scriptExitCode = $null",
  "$jobObjectHandle = [IntPtr]::Zero",
  "$shellJobId = $env:WORKFORGE_MCP_SHELL_JOB_ID",
  "$profileId = $env:WORKFORGE_MCP_PROFILE_ID",
  "$ownerPath = $env:WORKFORGE_MCP_PROFILE_SHELL_OWNER_PATH",
  "$ownerEvidencePath = $env:WORKFORGE_MCP_SHELL_OWNER_EVIDENCE_PATH",
  "$containmentEvidencePath = $env:WORKFORGE_MCP_SHELL_CONTAINMENT_EVIDENCE_PATH",
  "try {",
  "Add-Type -TypeDefinition $env:WORKFORGE_MCP_JOB_OBJECT_CSHARP -Language CSharp -ErrorAction Stop",
  "$jobObjectHandle = [WorkForgeMcpJobObject]::AssignCurrentProcess()",
  "$containment = [ordered]@{ version = 1; kind = 'windows_job_object_kill_on_close'; enforced = $true; jobId = $shellJobId; processId = $PID; createdAt = [DateTime]::UtcNow.ToString('o') }",
  "[IO.File]::WriteAllText($containmentEvidencePath, (($containment | ConvertTo-Json -Compress) + [Environment]::NewLine), $utf8)",
  "$leaseMutex = [Threading.Mutex]::new($false, $env:WORKFORGE_MCP_PROFILE_SHELL_MUTEX)",
  "try { $leaseAcquired = $leaseMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $leaseAcquired = $true }",
  `if (-not $leaseAcquired) { $ownerEvidence = ''; for ($ownerAttempt = 0; $ownerAttempt -lt 5 -and -not $ownerEvidence; $ownerAttempt++) { try { if ([IO.File]::Exists($ownerPath)) { $ownerEvidence = [IO.File]::ReadAllText($ownerPath, $utf8).Trim() } } catch {}; if (-not $ownerEvidence -and $ownerAttempt -lt 4) { Start-Sleep -Milliseconds 50 } }; $busyMessage = 'PROFILE_SHELL_LEASE_BUSY: another ChatGPT workstation shell job owns this profile shell lease.'; if ($ownerEvidence) { $busyMessage += ' owner=' + $ownerEvidence } else { $busyMessage += ' owner=initializing_or_unavailable' }; [Console]::Error.WriteLine($busyMessage); $scriptExitCode = ${PROFILE_SHELL_BUSY_EXIT_CODE} }`,
  "if ($null -eq $scriptExitCode) {",
  "$owner = [ordered]@{ version = 1; profileId = $profileId; jobId = $shellJobId; processId = $PID; createdAt = [DateTime]::UtcNow.ToString('o'); cwd = (Get-Location).Path; leaseScope = ('profile:' + $profileId + ':shell'); containment = 'windows_job_object_kill_on_close' }",
  "$ownerJson = ($owner | ConvertTo-Json -Compress) + [Environment]::NewLine",
  "[IO.File]::WriteAllText($ownerEvidencePath, $ownerJson, $utf8)",
  "$ownerTempPath = $ownerPath + '.' + $shellJobId + '.tmp'",
  "[IO.File]::WriteAllText($ownerTempPath, $ownerJson, $utf8)",
  "Move-Item -LiteralPath $ownerTempPath -Destination $ownerPath -Force",
  "Remove-Item Env:WORKFORGE_MCP_JOB_OBJECT_CSHARP, Env:WORKFORGE_MCP_PROFILE_ID, Env:WORKFORGE_MCP_SHELL_JOB_ID, Env:WORKFORGE_MCP_PROFILE_SHELL_MUTEX, Env:WORKFORGE_MCP_PROFILE_SHELL_OWNER_PATH, Env:WORKFORGE_MCP_SHELL_OWNER_EVIDENCE_PATH, Env:WORKFORGE_MCP_SHELL_CONTAINMENT_EVIDENCE_PATH -ErrorAction SilentlyContinue",
  "$script = [Console]::In.ReadToEnd()",
  "& ([ScriptBlock]::Create($script))",
  "if ($null -ne $LASTEXITCODE) { $scriptExitCode = $LASTEXITCODE }",
  "}",
  "} finally {",
  "if ($leaseAcquired) { try { if ([IO.File]::Exists($ownerPath)) { $currentOwner = [IO.File]::ReadAllText($ownerPath, $utf8) | ConvertFrom-Json; if ($currentOwner.jobId -eq $shellJobId) { Remove-Item -LiteralPath $ownerPath -Force } } } catch {} }",
  "if ($leaseAcquired) { $leaseMutex.ReleaseMutex() }",
  "if ($null -ne $leaseMutex) { $leaseMutex.Dispose() }",
  "}",
  "if ($null -ne $scriptExitCode) { exit $scriptExitCode }",
].join("; ");

type LiveShellStatus = "running" | "completed" | "failed" | "cancelled";
type PublicShellStatus = LiveShellStatus | "ownership_lost";

const persistedShellStatusSchema = z.object({
  version: z.literal(1),
  kind: z.literal("connection_owned_shell"),
  executionMode: z.literal("connection_owned"),
  id: z.string().regex(JOB_ID_PATTERN),
  profileId: z.string().min(1).max(128),
  status: z.enum(["running", "completed", "failed", "cancelled"]),
  cwd: z.string().min(1).max(32_768),
  leaseScope: z.string().min(1).max(512),
  processId: z.number().int().positive().nullable(),
  leaseAcquired: z.boolean(),
  containmentEnforced: z.boolean(),
  createdAt: z.string().min(1).max(64),
  updatedAt: z.string().min(1).max(64),
  exitCode: z.number().int().nullable(),
  signal: z.string().max(128).nullable(),
  timedOut: z.boolean(),
  cancelRequested: z.boolean(),
  timeoutMs: z.number().int().min(1000).max(86_400_000),
  commandUtf8Bytes: z.number().int().min(0).max(4 * 1024 * 1024),
  stdoutBytes: z.number().int().min(0).max(MAX_LOG_BYTES_PER_STREAM),
  stderrBytes: z.number().int().min(0).max(MAX_LOG_BYTES_PER_STREAM),
  stdoutTruncated: z.boolean(),
  stderrTruncated: z.boolean(),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  stdoutSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  stderrSha256: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  replayAllowed: z.literal(false),
}).strict();

type PersistedShellStatus = z.infer<typeof persistedShellStatusSchema>;

interface ShellJob {
  readonly id: string;
  readonly profileId: string;
  readonly cwd: string;
  readonly leaseScope: string;
  readonly createdAt: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly ownerEvidencePath: string;
  readonly containmentEvidencePath: string;
  readonly startedStatusPath: string;
  readonly terminalStatusPath: string;
  readonly inputSha256: string;
  readonly timeoutMs: number;
  readonly commandUtf8Bytes: number;
  readonly child: ChildProcessWithoutNullStreams;
  status: LiveShellStatus;
  updatedAt: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  cancelRequested: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutChunks: Buffer[];
  stderrChunks: Buffer[];
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  leaseAcquired: boolean;
  containmentEnforced: boolean;
  timer: NodeJS.Timeout;
}

const jobs = new Map<string, ShellJob>();
const pendingStartsByProfile = new Map<string, number>();

function now(): string {
  return new Date().toISOString();
}

function tryAcquirePosixLease(leasePath: string, ownerPath: string): boolean {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const leaseHandle = openSync(leasePath, "wx", 0o600);
      closeSync(leaseHandle);
      return true;
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") throw error;
    }

    let ownerProcessId: number | undefined;
    try {
      const owner = JSON.parse(readFileSync(ownerPath, "utf8")) as { processId?: unknown };
      if (typeof owner.processId === "number" && Number.isInteger(owner.processId) && owner.processId > 0) {
        ownerProcessId = owner.processId;
      }
    } catch {
      // A new owner gets a short window to publish its evidence.
    }
    if (ownerProcessId !== undefined) {
      try {
        process.kill(ownerProcessId, 0);
        return false;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "EPERM") return false;
      }
    } else {
      try {
        if (Date.now() - lstatSync(leasePath).mtimeMs < 10_000) return false;
      } catch {
        continue;
      }
    }
    try { unlinkSync(ownerPath); } catch { /* stale owner evidence was already absent */ }
    try { unlinkSync(leasePath); } catch { /* another process recovered it first */ }
  }
  return false;
}

function assertJobId(id: string): void {
  if (!JOB_ID_PATTERN.test(id)) throw new Error("Invalid shell job id.");
}

function runtimeRootFor(context: ProjectContext): string {
  return resolve(context.primaryRoot, "artifacts", "workforge-mcp", "shell");
}

function pathsFor(context: ProjectContext, id: string) {
  assertJobId(id);
  const runtimeRoot = runtimeRootFor(context);
  const jobRoot = resolve(runtimeRoot, id);
  return {
    runtimeRoot,
    jobRoot,
    stdoutPath: resolve(jobRoot, "stdout.log"),
    stderrPath: resolve(jobRoot, "stderr.log"),
    ownerEvidencePath: resolve(jobRoot, "owner.json"),
    containmentEvidencePath: resolve(jobRoot, "containment.json"),
    startedStatusPath: resolve(jobRoot, "started.json"),
    terminalStatusPath: resolve(jobRoot, "terminal.json"),
  } as const;
}

function assertSafeArchivedJobRoot(context: ProjectContext, runtimeRoot: string, jobRoot: string): void {
  const primaryCanonical = realpathSync(context.primaryRoot);
  for (const directory of [
    resolve(context.primaryRoot, "artifacts"),
    resolve(context.primaryRoot, "artifacts", "workforge-mcp"),
    runtimeRoot,
  ]) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error("Shell runtime archive contains a redirected directory segment.");
    }
  }
  const runtimeCanonical = realpathSync(runtimeRoot);
  const runtimeFromPrimary = relative(normalizePathForComparison(primaryCanonical), normalizePathForComparison(runtimeCanonical));
  if (runtimeFromPrimary === "" || runtimeFromPrimary.startsWith("..") || isAbsolute(runtimeFromPrimary)) {
    throw new Error("Shell runtime archive escaped the registered project root.");
  }
  const jobInfo = lstatSync(jobRoot);
  if (!jobInfo.isDirectory() || jobInfo.isSymbolicLink()) throw new Error("Shell job archive directory is unsafe.");
  const jobCanonical = realpathSync(jobRoot);
  const fromRuntime = relative(normalizePathForComparison(runtimeCanonical), normalizePathForComparison(jobCanonical));
  if (fromRuntime === "" || fromRuntime.startsWith("..") || isAbsolute(fromRuntime)) {
    throw new Error("Shell job archive escaped the profile runtime root.");
  }
}

function readBoundedArchiveFile(path: string, maxBytes: number, label: string): Buffer {
  const pathInfo = lstatSync(path);
  if (!pathInfo.isFile() || pathInfo.isSymbolicLink() || pathInfo.nlink > 1 || pathInfo.size > maxBytes) {
    throw new Error(`${label} is missing or unsafe.`);
  }
  const handle = openSync(path, "r");
  try {
    const info = fstatSync(handle);
    if (!info.isFile() || info.nlink > 1 || info.size !== pathInfo.size || info.size > maxBytes) {
      throw new Error(`${label} changed while it was being opened.`);
    }
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(handle, bytes, offset, bytes.byteLength - offset, offset);
      if (count === 0) throw new Error(`${label} changed while it was being read.`);
      offset += count;
    }
    const after = fstatSync(handle);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) {
      throw new Error(`${label} changed while it was being read.`);
    }
    return bytes;
  } finally {
    closeSync(handle);
  }
}

function readStatusManifest(path: string): PersistedShellStatus | undefined {
  let bytes: Buffer;
  try {
    bytes = readBoundedArchiveFile(path, MAX_STATUS_MANIFEST_BYTES, "Shell status manifest");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return persistedShellStatusSchema.parse(JSON.parse(text) as unknown);
}

function assertManifestIdentity(context: ProjectContext, id: string, manifest: PersistedShellStatus): void {
  if (manifest.id !== id || manifest.profileId !== context.profile.id) {
    throw new Error("Shell status manifest does not match this profile and job id.");
  }
}

function archiveStatus(context: ProjectContext, id: string) {
  const paths = pathsFor(context, id);
  try {
    assertSafeArchivedJobRoot(context, paths.runtimeRoot, paths.jobRoot);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error("Unknown shell job id for this profile.");
    }
    throw error;
  }
  const started = readStatusManifest(paths.startedStatusPath);
  if (!started) throw new Error("Shell job archive has no trusted start manifest.");
  assertManifestIdentity(context, id, started);
  if (started.status !== "running" || started.stdoutSha256 !== null || started.stderrSha256 !== null) {
    throw new Error("Shell start manifest has an invalid status.");
  }
  const terminal = readStatusManifest(paths.terminalStatusPath);
  if (terminal) {
    assertManifestIdentity(context, id, terminal);
    if (
      terminal.status === "running"
      || terminal.stdoutSha256 === null
      || terminal.stderrSha256 === null
      || terminal.inputSha256 !== started.inputSha256
      || terminal.cwd !== started.cwd
      || terminal.leaseScope !== started.leaseScope
      || terminal.createdAt !== started.createdAt
      || terminal.timeoutMs !== started.timeoutMs
      || terminal.commandUtf8Bytes !== started.commandUtf8Bytes
    ) {
      throw new Error("Shell terminal manifest is incomplete or does not match its start manifest.");
    }
  }
  const record = terminal ?? started;
  return {
    id: record.id,
    profileId: record.profileId,
    status: (terminal ? record.status : "ownership_lost") as PublicShellStatus,
    executionMode: "connection_owned" as const,
    replayAllowed: false as const,
    inputSha256: record.inputSha256,
    cwd: record.cwd,
    leaseScope: record.leaseScope,
    processId: record.processId,
    leaseAcquired: record.leaseAcquired,
    ownerEvidencePath: paths.ownerEvidencePath,
    containmentKind: CONTAINMENT_KIND,
    containmentEnforced: record.containmentEnforced,
    containmentEvidencePath: paths.containmentEvidencePath,
    trackingState: terminal ? "archived_terminal" as const : "ownership_lost" as const,
    evidenceSealed: terminal !== undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    exitCode: record.exitCode,
    signal: record.signal,
    timedOut: record.timedOut,
    cancelRequested: record.cancelRequested,
    stdoutBytes: record.stdoutBytes,
    stderrBytes: record.stderrBytes,
    stdoutTruncated: record.stdoutTruncated,
    stderrTruncated: record.stderrTruncated,
  };
}

function refreshJobEvidence(job: ShellJob): void {
  if (!job.leaseAcquired) {
    try {
      const evidence = JSON.parse(readFileSync(job.ownerEvidencePath, "utf8")) as { jobId?: unknown; processId?: unknown };
      job.leaseAcquired = evidence.jobId === job.id && evidence.processId === job.child.pid;
    } catch {
      // The wrapper may still be starting, or it may have failed before acquiring the lease.
    }
  }
  if (!job.containmentEnforced) {
    try {
      const evidence = JSON.parse(readFileSync(job.containmentEvidencePath, "utf8")) as {
        jobId?: unknown;
        processId?: unknown;
        kind?: unknown;
        enforced?: unknown;
      };
      job.containmentEnforced = evidence.jobId === job.id
        && evidence.processId === job.child.pid
        && evidence.kind === CONTAINMENT_KIND
        && evidence.enforced === true;
    } catch {
      // The wrapper may still be compiling the containment helper.
    }
  }
}

function publicStatus(job: ShellJob) {
  refreshJobEvidence(job);
  return {
    id: job.id,
    profileId: job.profileId,
    status: job.status,
    executionMode: "connection_owned" as const,
    replayAllowed: false as const,
    inputSha256: job.inputSha256,
    cwd: job.cwd,
    leaseScope: job.leaseScope,
    processId: job.child.pid ?? null,
    leaseAcquired: job.leaseAcquired,
    ownerEvidencePath: job.ownerEvidencePath,
    containmentKind: CONTAINMENT_KIND,
    containmentEnforced: job.containmentEnforced,
    containmentEvidencePath: job.containmentEvidencePath,
    trackingState: "attached" as const,
    evidenceSealed: false,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    exitCode: job.exitCode,
    signal: job.signal,
    timedOut: job.timedOut,
    cancelRequested: job.cancelRequested,
    stdoutBytes: job.stdoutBytes,
    stderrBytes: job.stderrBytes,
    stdoutTruncated: job.stdoutTruncated,
    stderrTruncated: job.stderrTruncated,
  };
}

function persistedStatus(
  job: ShellJob,
  hashes: { stdoutSha256: string; stderrSha256: string } | undefined = undefined,
): PersistedShellStatus {
  const status = publicStatus(job);
  return {
    version: 1,
    kind: "connection_owned_shell",
    executionMode: "connection_owned",
    id: status.id,
    profileId: status.profileId,
    status: status.status,
    cwd: status.cwd,
    leaseScope: status.leaseScope,
    processId: status.processId,
    leaseAcquired: status.leaseAcquired,
    containmentEnforced: status.containmentEnforced,
    createdAt: status.createdAt,
    updatedAt: status.updatedAt,
    exitCode: status.exitCode,
    signal: status.signal,
    timedOut: status.timedOut,
    cancelRequested: job.cancelRequested,
    timeoutMs: job.timeoutMs,
    commandUtf8Bytes: job.commandUtf8Bytes,
    stdoutBytes: status.stdoutBytes,
    stderrBytes: status.stderrBytes,
    stdoutTruncated: status.stdoutTruncated,
    stderrTruncated: status.stderrTruncated,
    inputSha256: status.inputSha256,
    stdoutSha256: hashes?.stdoutSha256 ?? null,
    stderrSha256: hashes?.stderrSha256 ?? null,
    replayAllowed: false,
  };
}

function writeStatusManifest(path: string, record: PersistedShellStatus): void {
  const verified = persistedShellStatusSchema.parse(record);
  const temporaryPath = `${path}.tmp`;
  const handle = openSync(temporaryPath, "wx", 0o600);
  try {
    const bytes = Buffer.from(`${JSON.stringify(verified)}\n`, "utf8");
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temporaryPath, path);
}

function writeBounded(
  stream: ReturnType<typeof createWriteStream>,
  chunk: Buffer,
  currentBytes: number,
): { bytes: number; accepted: Buffer; truncated: boolean } {
  if (currentBytes >= MAX_LOG_BYTES_PER_STREAM) return { bytes: currentBytes, accepted: Buffer.alloc(0), truncated: true };
  const remaining = MAX_LOG_BYTES_PER_STREAM - currentBytes;
  const accepted = chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
  if (accepted.byteLength > 0) stream.write(accepted);
  return { bytes: currentBytes + accepted.byteLength, accepted, truncated: chunk.byteLength > remaining };
}

export async function startShellJob(input: {
  context: ProjectContext;
  command: string;
  cwd: string;
  timeoutMs: number;
}) {
  const profileId = input.context.profile.id;
  const activeCount = [...jobs.values()].filter(
    (job) => job.profileId === profileId && job.status === "running",
  ).length;
  const pendingCount = pendingStartsByProfile.get(profileId) ?? 0;
  if (activeCount + pendingCount >= MAX_ACTIVE_JOBS_PER_PROFILE) {
    throw new Error(`This profile already has ${MAX_ACTIVE_JOBS_PER_PROFILE} active shell jobs.`);
  }
  pendingStartsByProfile.set(profileId, pendingCount + 1);
  try {
    return await startReservedShellJob(input);
  } finally {
    const remaining = (pendingStartsByProfile.get(profileId) ?? 1) - 1;
    if (remaining <= 0) pendingStartsByProfile.delete(profileId);
    else pendingStartsByProfile.set(profileId, remaining);
  }
}

async function startReservedShellJob(input: {
  context: ProjectContext;
  command: string;
  cwd: string;
  timeoutMs: number;
}) {
  const cwd = await resolveAuthorizedWorkstationPath(input.context, input.cwd, "tree");
  const cwdInfo = await stat(cwd);
  if (!cwdInfo.isDirectory()) throw new Error(`Shell cwd is not a directory: ${cwd}`);
  const id = `shell_${randomBytes(16).toString("hex")}`;
  const paths = pathsFor(input.context, id);
  await mkdir(paths.runtimeRoot, { recursive: true });
  await mkdir(paths.jobRoot, { recursive: false });
  const profileOwnerPath = resolve(paths.runtimeRoot, "profile-shell-owner.json");
  const profileLeasePath = resolve(paths.runtimeRoot, "profile-shell-owner.lock");
  await Promise.all([
    writeFile(paths.stdoutPath, Buffer.alloc(0), { flag: "wx" }),
    writeFile(paths.stderrPath, Buffer.alloc(0), { flag: "wx" }),
  ]);

  const createdAt = now();
  const commandUtf8Bytes = Buffer.byteLength(input.command, "utf8");
  const inputSha256 = createHash("sha256").update(JSON.stringify({
    domain: "chatgpt-codex-workforge-mcp:connection-owned-shell:v1",
    profileId: input.context.profile.id,
    cwd,
    timeoutMs: input.timeoutMs,
    command: input.command,
  })).digest("hex");
  writeStatusManifest(paths.startedStatusPath, {
    version: 1,
    kind: "connection_owned_shell",
    executionMode: "connection_owned",
    id,
    profileId: input.context.profile.id,
    status: "running",
    cwd,
    leaseScope: `profile:${input.context.profile.id}:shell`,
    processId: null,
    leaseAcquired: false,
    containmentEnforced: false,
    createdAt,
    updatedAt: createdAt,
    exitCode: null,
    signal: null,
    timedOut: false,
    cancelRequested: false,
    timeoutMs: input.timeoutMs,
    commandUtf8Bytes,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    inputSha256,
    stdoutSha256: null,
    stderrSha256: null,
    replayAllowed: false,
  });

  let ownsPosixLease = false;
  let command = input.command;
  if (process.platform !== "win32") {
    ownsPosixLease = tryAcquirePosixLease(profileLeasePath, profileOwnerPath);
    if (!ownsPosixLease) {
      let owner = "initializing_or_unavailable";
      try {
        owner = readFileSync(profileOwnerPath, "utf8").trim() || owner;
      } catch {
        // The current owner may still be writing its evidence.
      }
      const busyMessage = `PROFILE_SHELL_LEASE_BUSY: another ChatGPT workstation shell job owns this profile shell lease. owner=${owner}`;
      command = `printf '%s\\n' '${busyMessage.replaceAll("'", "'\\''")}' >&2\nexit ${PROFILE_SHELL_BUSY_EXIT_CODE}`;
    }
  }

  const childEnvironment = makeWorkstationEnvironment(process.platform === "win32" ? {
    WORKFORGE_MCP_PROFILE_SHELL_MUTEX: `Local\\WorkForgeMcp-ProfileShell-${input.context.profile.id}`,
    WORKFORGE_MCP_JOB_OBJECT_CSHARP: WINDOWS_JOB_OBJECT_CSHARP,
    WORKFORGE_MCP_PROFILE_ID: input.context.profile.id,
    WORKFORGE_MCP_SHELL_JOB_ID: id,
    WORKFORGE_MCP_PROFILE_SHELL_OWNER_PATH: profileOwnerPath,
    WORKFORGE_MCP_SHELL_OWNER_EVIDENCE_PATH: paths.ownerEvidencePath,
    WORKFORGE_MCP_SHELL_CONTAINMENT_EVIDENCE_PATH: paths.containmentEvidencePath,
  } : {});
  const child = process.platform === "win32"
    ? spawn(
      resolvePowerShellExecutable(),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", POWERSHELL_STDIN_WRAPPER],
      { cwd, env: childEnvironment, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] },
    )
    : spawn(
      "/bin/zsh",
      ["-f"],
      { cwd, env: childEnvironment, detached: true, shell: false, stdio: ["pipe", "pipe", "pipe"] },
    );
  if (ownsPosixLease && child.pid) {
    const owner = {
      version: 1,
      profileId: input.context.profile.id,
      jobId: id,
      processId: child.pid,
      createdAt,
      cwd,
      leaseScope: `profile:${input.context.profile.id}:shell`,
      containment: CONTAINMENT_KIND,
    };
    const containment = {
      version: 1,
      kind: CONTAINMENT_KIND,
      enforced: true,
      jobId: id,
      processId: child.pid,
      createdAt,
    };
    writeFileSync(profileOwnerPath, `${JSON.stringify(owner)}\n`, { mode: 0o600 });
    writeFileSync(paths.ownerEvidencePath, `${JSON.stringify(owner)}\n`, { mode: 0o600 });
    writeFileSync(paths.containmentEvidencePath, `${JSON.stringify(containment)}\n`, { mode: 0o600 });
  }
  const stdoutStream = createWriteStream(paths.stdoutPath, { flags: "a" });
  const stderrStream = createWriteStream(paths.stderrPath, { flags: "a" });
  const stdoutFinished = new Promise<Error | undefined>((resolveFinished) => {
    stdoutStream.once("finish", () => resolveFinished(undefined));
    stdoutStream.once("error", (error) => resolveFinished(error));
  });
  const stderrFinished = new Promise<Error | undefined>((resolveFinished) => {
    stderrStream.once("finish", () => resolveFinished(undefined));
    stderrStream.once("error", (error) => resolveFinished(error));
  });
  const job: ShellJob = {
    id,
    profileId: input.context.profile.id,
    cwd,
    leaseScope: `profile:${input.context.profile.id}:shell`,
    createdAt,
    stdoutPath: paths.stdoutPath,
    stderrPath: paths.stderrPath,
    ownerEvidencePath: paths.ownerEvidencePath,
    containmentEvidencePath: paths.containmentEvidencePath,
    startedStatusPath: paths.startedStatusPath,
    terminalStatusPath: paths.terminalStatusPath,
    inputSha256,
    timeoutMs: input.timeoutMs,
    commandUtf8Bytes,
    child,
    status: "running",
    updatedAt: createdAt,
    exitCode: null,
    signal: null,
    timedOut: false,
    cancelRequested: false,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutChunks: [],
    stderrChunks: [],
    stdoutTruncated: false,
    stderrTruncated: false,
    leaseAcquired: ownsPosixLease,
    containmentEnforced: ownsPosixLease,
    timer: setTimeout(() => undefined, 0),
  };
  clearTimeout(job.timer);
  jobs.set(id, job);

  child.stdout.on("data", (raw: Buffer | string) => {
    const result = writeBounded(stdoutStream, Buffer.from(raw), job.stdoutBytes);
    job.stdoutBytes = result.bytes;
    if (result.accepted.byteLength > 0) job.stdoutChunks.push(result.accepted);
    job.stdoutTruncated ||= result.truncated;
    job.updatedAt = now();
  });
  child.stderr.on("data", (raw: Buffer | string) => {
    const result = writeBounded(stderrStream, Buffer.from(raw), job.stderrBytes);
    job.stderrBytes = result.bytes;
    if (result.accepted.byteLength > 0) job.stderrChunks.push(result.accepted);
    job.stderrTruncated ||= result.truncated;
    job.updatedAt = now();
  });
  child.once("error", (error) => {
    job.status = "failed";
    job.updatedAt = now();
    const line = Buffer.from(`${error instanceof Error ? error.message : String(error)}\n`, "utf8");
    const result = writeBounded(stderrStream, line, job.stderrBytes);
    job.stderrBytes = result.bytes;
    if (result.accepted.byteLength > 0) job.stderrChunks.push(result.accepted);
    job.stderrTruncated ||= result.truncated;
  });
  child.once("close", (exitCode, signal) => {
    clearTimeout(job.timer);
    job.exitCode = exitCode;
    job.signal = signal;
    if (job.cancelRequested || job.timedOut) job.status = "cancelled";
    else job.status = exitCode === 0 ? "completed" : "failed";
    job.updatedAt = now();
    if (ownsPosixLease) {
      try {
        const owner = JSON.parse(readFileSync(profileOwnerPath, "utf8")) as { jobId?: unknown };
        if (owner.jobId === id) unlinkSync(profileOwnerPath);
      } catch {
        // Cleanup is best effort; the lease file below remains authoritative.
      }
      try { unlinkSync(profileLeasePath); } catch { /* already removed */ }
    }
    stdoutStream.end();
    stderrStream.end();
    void Promise.all([stdoutFinished, stderrFinished]).then(([stdoutError, stderrError]) => {
      if (stdoutError || stderrError) throw stdoutError ?? stderrError;
      const stdoutBytes = readBoundedArchiveFile(job.stdoutPath, MAX_LOG_BYTES_PER_STREAM, "Shell stdout log");
      const stderrBytes = readBoundedArchiveFile(job.stderrPath, MAX_LOG_BYTES_PER_STREAM, "Shell stderr log");
      if (stdoutBytes.byteLength !== job.stdoutBytes || stderrBytes.byteLength !== job.stderrBytes) {
        throw new Error("Shell log sizes do not match the terminal status counters.");
      }
      writeStatusManifest(job.terminalStatusPath, persistedStatus(job, {
        stdoutSha256: createHash("sha256").update(stdoutBytes).digest("hex"),
        stderrSha256: createHash("sha256").update(stderrBytes).digest("hex"),
      }));
      if (jobs.get(job.id) === job) jobs.delete(job.id);
    }).catch(() => {
      // Without a sealed terminal manifest, reconnect must report ownership_lost.
      // Keep the in-memory record available for the current connection.
    });
  });
  if (process.platform !== "win32") {
    child.once("exit", () => {
      if (!child.pid) return;
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* no descendants remain */ }
    });
  }
  job.timer = setTimeout(() => {
    job.timedOut = true;
    job.cancelRequested = true;
    job.updatedAt = now();
    killProcessTree(child);
  }, input.timeoutMs);

  child.stdin.end(command, "utf8");
  return publicStatus(job);
}

export function getShellStatus(context: ProjectContext, id: string) {
  assertJobId(id);
  const job = jobs.get(id);
  if (job) {
    if (job.profileId !== context.profile.id) throw new Error("Unknown shell job id for this profile.");
    return publicStatus(job);
  }
  return archiveStatus(context, id);
}

function pageText(text: string, offset: number, maxCharacters: number) {
  const selected = text.slice(offset, offset + maxCharacters);
  const nextOffset = offset + selected.length < text.length ? offset + selected.length : null;
  return { text: selected, nextOffset, totalCharacters: text.length };
}

export async function getShellOutput(input: {
  context: ProjectContext;
  id: string;
  stdoutOffset: number;
  stderrOffset: number;
  maxCharacters: number;
}) {
  assertJobId(input.id);
  const job = jobs.get(input.id);
  if (job && job.profileId !== input.context.profile.id) throw new Error("Unknown shell job id for this profile.");
  const status = job ? publicStatus(job) : archiveStatus(input.context, input.id);
  let stdoutBytes: Buffer;
  let stderrBytes: Buffer;
  if (job) {
    stdoutBytes = Buffer.concat(job.stdoutChunks, job.stdoutBytes);
    stderrBytes = Buffer.concat(job.stderrChunks, job.stderrBytes);
  } else {
    const paths = pathsFor(input.context, input.id);
    stdoutBytes = readBoundedArchiveFile(paths.stdoutPath, MAX_LOG_BYTES_PER_STREAM, "Shell stdout log");
    stderrBytes = readBoundedArchiveFile(paths.stderrPath, MAX_LOG_BYTES_PER_STREAM, "Shell stderr log");
    if (status.trackingState === "archived_terminal") {
      const terminal = readStatusManifest(paths.terminalStatusPath);
      if (
        !terminal
        || terminal.stdoutSha256 === null
        || terminal.stderrSha256 === null
        || terminal.stdoutBytes !== stdoutBytes.byteLength
        || terminal.stderrBytes !== stderrBytes.byteLength
        || terminal.stdoutSha256 !== createHash("sha256").update(stdoutBytes).digest("hex")
        || terminal.stderrSha256 !== createHash("sha256").update(stderrBytes).digest("hex")
      ) {
        throw new Error("Shell terminal output evidence is incomplete or has changed.");
      }
    }
  }
  const stdout = stdoutBytes.toString("utf8");
  const stderr = stderrBytes.toString("utf8");
  return {
    id: status.id,
    status: status.status,
    trackingState: status.trackingState,
    replayAllowed: false as const,
    stdout: pageText(stdout, input.stdoutOffset, input.maxCharacters),
    stderr: pageText(stderr, input.stderrOffset, input.maxCharacters),
    complete: status.trackingState === "archived_terminal",
    stdoutTruncated: status.stdoutTruncated,
    stderrTruncated: status.stderrTruncated,
  };
}

export function cancelShellJob(context: ProjectContext, id: string) {
  assertJobId(id);
  const job = jobs.get(id);
  if (!job) {
    const archived = archiveStatus(context, id);
    if (archived.status === "ownership_lost") {
      throw new Error(
        "Shell ownership was lost across reconnect; refusing PID-based cancellation because process identity is no longer authoritative.",
      );
    }
    return archived;
  }
  if (job.profileId !== context.profile.id) throw new Error("Unknown shell job id for this profile.");
  if (job.status === "running") {
    job.cancelRequested = true;
    job.updatedAt = now();
    clearTimeout(job.timer);
    killProcessTree(job.child);
    return publicStatus(job);
  }
  return publicStatus(job);
}

export function cancelActiveShellJobs(context: ProjectContext): number {
  let cancelled = 0;
  for (const job of jobs.values()) {
    if (job.profileId !== context.profile.id || job.status !== "running" || job.cancelRequested) continue;
    job.cancelRequested = true;
    job.updatedAt = now();
    clearTimeout(job.timer);
    killProcessTree(job.child);
    cancelled += 1;
  }
  return cancelled;
}
