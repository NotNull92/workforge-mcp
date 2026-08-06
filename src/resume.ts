import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ProjectContext } from "./profile.js";
import { makeSafeEnvironment, runProcess, type ProcessResult } from "./process.js";

const GIT_EXECUTABLE = "git.exe";
const GIT_TIMEOUT_MS = 20_000;
const MAX_GIT_STDOUT_BYTES = 512 * 1024;
const MAX_GIT_STDERR_BYTES = 64 * 1024;
const RESUME_FILE_PATTERN = /(?:^|\/)(?:current_status|[^/]*handoff[^/]*|[^/]*decision_log[^/]*)\.(?:md|txt)$/iu;

export interface ResumeCommit {
  readonly hash: string;
  readonly shortHash: string;
  readonly authoredAt: string;
  readonly subject: string;
}

export interface ResumeStatus {
  readonly clean: boolean;
  readonly staged: readonly string[];
  readonly unstaged: readonly string[];
  readonly untracked: readonly string[];
  readonly conflicted: readonly string[];
  readonly changedPaths: readonly string[];
}

export interface ProjectResume {
  readonly generatedAt: string;
  readonly profileId: string;
  readonly primaryRoot: string;
  readonly workingDirectory: string;
  readonly bootstrapFiles: readonly string[];
  readonly resumeFiles: readonly string[];
  readonly gitAvailable: boolean;
  readonly isGitRepository: boolean;
  readonly repositoryRoot: string | null;
  readonly branch: string | null;
  readonly detachedHead: boolean;
  readonly head: string | null;
  readonly upstream: string | null;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly status: ResumeStatus | null;
  readonly recentCommits: readonly ResumeCommit[];
  readonly stagedDiffStat: string;
  readonly unstagedDiffStat: string;
  readonly statusTruncated: boolean;
  readonly diffStatTruncated: boolean;
  readonly truncated: boolean;
  readonly error: string | null;
}

interface ParsedStatus {
  readonly branch: string | null;
  readonly detachedHead: boolean;
  readonly head: string | null;
  readonly upstream: string | null;
  readonly ahead: number | null;
  readonly behind: number | null;
  readonly status: ResumeStatus;
  readonly truncated: boolean;
}

function normalizeForComparison(path: string): string {
  return process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  const fromRoot = relative(normalizeForComparison(root), normalizeForComparison(candidate));
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

function firstDiagnostic(result: ProcessResult, fallback: string): string {
  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();
  return (stderr || stdout || fallback).split(/\r?\n/u, 1)[0]?.slice(0, 1000) ?? fallback;
}

async function runGit(cwd: string, args: readonly string[], maxStdoutBytes = MAX_GIT_STDOUT_BYTES): Promise<ProcessResult> {
  return await runProcess(GIT_EXECUTABLE, ["-c", "core.fsmonitor=false", ...args], {
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
    maxStdoutBytes,
    maxStderrBytes: MAX_GIT_STDERR_BYTES,
    env: makeSafeEnvironment({ GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }),
  });
}

function addUnique(target: string[], seen: Set<string>, path: string): void {
  if (path.length === 0 || seen.has(path)) return;
  seen.add(path);
  target.push(path);
}

function parseStatus(output: string, commandTruncated: boolean, maxChangedPaths: number): ParsedStatus {
  const records = output.split("\0");
  if (records.at(-1) === "") records.pop();
  else if (commandTruncated) records.pop();

  let branch: string | null = null;
  let detachedHead = false;
  let head: string | null = null;
  let upstream: string | null = null;
  let ahead: number | null = null;
  let behind: number | null = null;

  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  const conflicted: string[] = [];
  const stagedSeen = new Set<string>();
  const unstagedSeen = new Set<string>();
  const untrackedSeen = new Set<string>();
  const conflictedSeen = new Set<string>();
  const encounterOrder: string[] = [];
  const encountered = new Set<string>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.startsWith("# branch.oid ")) {
      const value = record.slice("# branch.oid ".length);
      head = value === "(initial)" ? null : value;
      continue;
    }
    if (record.startsWith("# branch.head ")) {
      const value = record.slice("# branch.head ".length);
      detachedHead = value === "(detached)";
      branch = detachedHead ? null : value;
      continue;
    }
    if (record.startsWith("# branch.upstream ")) {
      upstream = record.slice("# branch.upstream ".length) || null;
      continue;
    }
    if (record.startsWith("# branch.ab ")) {
      const match = /^# branch\.ab \+(\d+) -(\d+)$/u.exec(record);
      if (match) {
        ahead = Number(match[1]);
        behind = Number(match[2]);
      }
      continue;
    }

    if (record.startsWith("? ")) {
      const path = record.slice(2);
      addUnique(untracked, untrackedSeen, path);
      addUnique(encounterOrder, encountered, path);
      continue;
    }

    if (record.startsWith("u ")) {
      const match = /^u \S{2}(?: \S+){8} (.*)$/su.exec(record);
      const path = match?.[1] ?? "";
      addUnique(conflicted, conflictedSeen, path);
      addUnique(encounterOrder, encountered, path);
      continue;
    }

    const ordinary = /^1 (\S{2})(?: \S+){6} (.*)$/su.exec(record);
    const renamed = /^2 (\S{2})(?: \S+){7} (.*)$/su.exec(record);
    const match = ordinary ?? renamed;
    if (!match) continue;
    const xy = match[1] ?? "..";
    const path = match[2] ?? "";
    if (xy[0] !== ".") addUnique(staged, stagedSeen, path);
    if (xy[1] !== ".") addUnique(unstaged, unstagedSeen, path);
    addUnique(encounterOrder, encountered, path);
    if (renamed) index += 1; // Porcelain v2 -z emits the original path as the next record.
  }

  const allowedPaths = new Set(encounterOrder.slice(0, maxChangedPaths));
  const trimToAllowed = (paths: readonly string[]) => paths.filter((path) => allowedPaths.has(path));
  const changedPaths = encounterOrder.slice(0, maxChangedPaths);
  const truncated = commandTruncated || encounterOrder.length > maxChangedPaths;
  const boundedStatus = {
    clean: encounterOrder.length === 0,
    staged: trimToAllowed(staged),
    unstaged: trimToAllowed(unstaged),
    untracked: trimToAllowed(untracked),
    conflicted: trimToAllowed(conflicted),
    changedPaths,
  } satisfies ResumeStatus;

  return { branch, detachedHead, head, upstream, ahead, behind, status: boundedStatus, truncated };
}

function parseCommits(output: string): readonly ResumeCommit[] {
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [hash = "", shortHash = "", authoredAt = "", ...subjectParts] = record.split("\x1f");
      return { hash, shortHash, authoredAt, subject: subjectParts.join("\x1f") };
    })
    .filter((commit) => commit.hash.length > 0);
}

function baseResult(context: ProjectContext): Omit<ProjectResume, "gitAvailable" | "isGitRepository" | "repositoryRoot" | "branch" | "detachedHead" | "head" | "upstream" | "ahead" | "behind" | "status" | "recentCommits" | "stagedDiffStat" | "unstagedDiffStat" | "statusTruncated" | "diffStatTruncated" | "truncated" | "error"> {
  return {
    generatedAt: new Date().toISOString(),
    profileId: context.profile.id,
    primaryRoot: context.primaryRoot,
    workingDirectory: context.defaultWorkingDirectory,
    bootstrapFiles: [...context.profile.bootstrapFiles],
    resumeFiles: context.profile.bootstrapFiles.filter((path) => RESUME_FILE_PATTERN.test(path.replaceAll("\\", "/"))),
  };
}

function unavailableResult(context: ProjectContext, gitAvailable: boolean, error: string): ProjectResume {
  return {
    ...baseResult(context),
    gitAvailable,
    isGitRepository: false,
    repositoryRoot: null,
    branch: null,
    detachedHead: false,
    head: null,
    upstream: null,
    ahead: null,
    behind: null,
    status: null,
    recentCommits: [],
    stagedDiffStat: "",
    unstagedDiffStat: "",
    statusTruncated: false,
    diffStatTruncated: false,
    truncated: false,
    error,
  };
}

export async function getProjectResume(
  context: ProjectContext,
  recentCommitLimit = 8,
  maxChangedPaths = 200,
): Promise<ProjectResume> {
  let rootResult: ProcessResult;
  try {
    rootResult = await runGit(context.defaultWorkingDirectory, ["rev-parse", "--show-toplevel"], 32 * 1024);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return unavailableResult(context, false, `Git is unavailable: ${message}`);
  }

  if (rootResult.exitCode !== 0 || rootResult.timedOut || rootResult.truncated) {
    return unavailableResult(
      context,
      true,
      firstDiagnostic(rootResult, "The default working directory is not inside a Git worktree."),
    );
  }

  const reportedRoot = rootResult.stdout.trim();
  if (reportedRoot.length === 0) {
    return unavailableResult(context, true, "Git returned an empty worktree root.");
  }
  const repositoryRoot = await realpath(resolve(reportedRoot));
  const primaryRoot = await realpath(context.primaryRoot);
  if (!isWithinOrEqual(primaryRoot, repositoryRoot)) {
    return unavailableResult(context, true, "Git worktree root resolves outside the registered project root.");
  }

  const [statusResult, logResult, stagedStatResult, unstagedStatResult] = await Promise.all([
    runGit(repositoryRoot, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]),
    runGit(repositoryRoot, [
      "log",
      `-${recentCommitLimit}`,
      "--date=iso-strict",
      "--pretty=format:%H%x1f%h%x1f%aI%x1f%s%x1e",
    ]),
    runGit(repositoryRoot, ["diff", "--cached", "--stat", "--no-color", "--no-ext-diff", "--no-textconv", "--"]),
    runGit(repositoryRoot, ["diff", "--stat", "--no-color", "--no-ext-diff", "--no-textconv", "--"]),
  ]);

  if (statusResult.exitCode !== 0 || statusResult.timedOut) {
    throw new Error(firstDiagnostic(statusResult, "Git status failed."));
  }
  for (const [label, result] of [
    ["Git log", logResult],
    ["Git staged diff stat", stagedStatResult],
    ["Git unstaged diff stat", unstagedStatResult],
  ] as const) {
    if (result.exitCode !== 0 && result.exitCode !== 128) {
      throw new Error(firstDiagnostic(result, `${label} failed.`));
    }
    if (result.timedOut) throw new Error(`${label} timed out.`);
  }

  const parsed = parseStatus(statusResult.stdout, statusResult.truncated, maxChangedPaths);
  const diffStatTruncated = stagedStatResult.truncated || unstagedStatResult.truncated;
  return {
    ...baseResult(context),
    gitAvailable: true,
    isGitRepository: true,
    repositoryRoot,
    branch: parsed.branch,
    detachedHead: parsed.detachedHead,
    head: parsed.head,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    status: parsed.status,
    recentCommits: logResult.exitCode === 0 ? parseCommits(logResult.stdout) : [],
    stagedDiffStat: stagedStatResult.exitCode === 0 ? stagedStatResult.stdout.trimEnd() : "",
    unstagedDiffStat: unstagedStatResult.exitCode === 0 ? unstagedStatResult.stdout.trimEnd() : "",
    statusTruncated: parsed.truncated,
    diffStatTruncated,
    truncated: parsed.truncated || logResult.truncated || diffStatTruncated,
    error: null,
  };
}
