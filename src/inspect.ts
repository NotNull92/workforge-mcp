import { makeSafeEnvironment, resolveToolExecutable, runProcess } from "./process.js";
import type { ProjectContext } from "./profile.js";
import { resolveAuthorizedWorkstationPath } from "./workstation.js";

export async function inspectRun(input: { context: ProjectContext; path: string;
  preset: "git_log" | "git_show_stat" | "git_branches" | "git_diff_commits_stat";
  limit?: number; revision?: string; otherRevision?: string; signal?: AbortSignal }) {
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid log limit.");
  const revision = (value: string | undefined) => {
    if (!value || !/^(?:[0-9a-f]{4,64}|HEAD(?:~[0-9]{1,3})?)$/u.test(value)) throw new Error("Invalid inspection revision.");
    return value;
  };
  let args: string[];
  switch (input.preset) {
    case "git_log": args = ["log", "--no-show-signature", "--no-color", "-n", String(limit), "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%aI%x1f%an%x1f%s%x1e"]; break;
    case "git_show_stat": args = ["show", "--no-show-signature", "--no-color", "--no-ext-diff", "--no-textconv", "--stat", "--format=%H%x1f%s", revision(input.revision), "--"]; break;
    case "git_branches": args = ["branch", "--list", "--no-color", "--format=%(refname:short)"]; break;
    case "git_diff_commits_stat": args = ["diff", "--stat", "--no-ext-diff", "--no-textconv", revision(input.revision), revision(input.otherRevision), "--"]; break;
    default: throw new Error("Unknown inspection preset.");
  }
  const cwd = await resolveAuthorizedWorkstationPath(input.context, input.path, "tree");
  const result = await runProcess(resolveToolExecutable("git"), ["--no-pager", "-c", "core.fsmonitor=false", "-c", "diff.ignoreSubmodules=all", ...args], {
    cwd, timeoutMs: 15000, maxStdoutBytes: 256 * 1024, maxStderrBytes: 65536, signal: input.signal,
    env: makeSafeEnvironment({ GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }),
  });
  return { preset: input.preset, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr.slice(0, 1000),
    truncated: result.truncated, timedOut: result.timedOut };
}
