import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectContext, ProjectProfile } from "../src/profile.js";
import { runProcess } from "../src/process.js";
import { getProjectResume } from "../src/resume.js";

const temporaryRoots: string[] = [];

async function makeContext(root?: string): Promise<{ context: ProjectContext; root: string }> {
  const projectRoot = root ?? await mkdtemp(join(tmpdir(), "project-resume-"));
  if (!root) temporaryRoots.push(projectRoot);
  await mkdir(join(projectRoot, "docs"), { recursive: true });
  await writeFile(join(projectRoot, "AGENTS.md"), "Always verify.\n", "utf8");
  await writeFile(join(projectRoot, "docs", "HANDOFF.md"), "Next: inspect the current diff.\n", "utf8");
  const profile = Object.freeze({
    id: "resume-test",
    displayName: "Resume Test",
    appName: "Resume Test Workstation",
    serverName: "resume-test-workstation",
    defaultWorkingDirectoryRelative: ".",
    httpPort: 23004,
    bootstrapFiles: Object.freeze(["AGENTS.md", "docs/HANDOFF.md"]),
    identityMarkers: Object.freeze([]),
    primaryRoot: projectRoot,
  }) as unknown as ProjectProfile;
  const context = Object.freeze({
    profile,
    primaryRoot: projectRoot,
    defaultWorkingDirectory: projectRoot,
    engineRoot: projectRoot,
    managedProjectRoots: Object.freeze([Object.freeze({ profileId: profile.id, primaryRoot: projectRoot })]),
  }) satisfies ProjectContext;
  return { context, root: projectRoot };
}

async function git(root: string, ...args: string[]): Promise<void> {
  const result = await runProcess("git.exe", args, { cwd: root, timeoutMs: 20_000 });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

async function initializeRepository(root: string): Promise<void> {
  await git(root, "init");
  await git(root, "branch", "-M", "main");
  await git(root, "config", "user.name", "Resume Test");
  await git(root, "config", "user.email", "resume-test@example.invalid");
  await writeFile(join(root, "tracked.txt"), "initial\n", "utf8");
  await git(root, "add", "tracked.txt");
  await git(root, "commit", "-m", "initial checkpoint");
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project resume snapshot", () => {
  it("returns a bounded structured Git snapshot without mutating the worktree", async () => {
    const { context, root } = await makeContext();
    await initializeRepository(root);
    await writeFile(join(root, "tracked.txt"), "staged\n", "utf8");
    await writeFile(join(root, "staged-only.txt"), "staged only\n", "utf8");
    await git(root, "add", "tracked.txt", "staged-only.txt");
    await writeFile(join(root, "tracked.txt"), "unstaged after stage\n", "utf8");
    await writeFile(join(root, "untracked.txt"), "untracked\n", "utf8");

    const resume = await getProjectResume(context, 5, 200);

    expect(resume.gitAvailable).toBe(true);
    expect(resume.isGitRepository).toBe(true);
    expect(resume.repositoryRoot).toBe(await realpath(root));
    expect(resume.branch).toBeTruthy();
    expect(resume.detachedHead).toBe(false);
    expect(resume.head).toMatch(/^[a-f0-9]{40,64}$/u);
    expect(resume.upstream).toBeNull();
    expect(resume.ahead).toBeNull();
    expect(resume.behind).toBeNull();
    expect(resume.resumeFiles).toEqual(["docs/HANDOFF.md"]);
    expect(resume.status?.clean).toBe(false);
    expect(resume.status?.staged).toEqual(expect.arrayContaining(["tracked.txt", "staged-only.txt"]));
    expect(resume.status?.unstaged).toContain("tracked.txt");
    expect(resume.status?.untracked).toEqual(expect.arrayContaining(["AGENTS.md", "docs/HANDOFF.md", "untracked.txt"]));
    expect(resume.status?.conflicted).toEqual([]);
    expect(resume.recentCommits).toHaveLength(1);
    expect(resume.recentCommits[0]?.subject).toBe("initial checkpoint");
    expect(resume.stagedDiffStat).toContain("staged-only.txt");
    expect(resume.unstagedDiffStat).toContain("tracked.txt");
    expect(resume.truncated).toBe(false);
    expect(resume.error).toBeNull();

    const after = await getProjectResume(context, 5, 200);
    expect(after.status).toEqual(resume.status);
    expect(after.head).toBe(resume.head);
  });

  it("marks changed-path truncation explicitly", async () => {
    const { context, root } = await makeContext();
    await initializeRepository(root);
    await writeFile(join(root, "one.txt"), "one\n", "utf8");
    await writeFile(join(root, "two.txt"), "two\n", "utf8");

    const resume = await getProjectResume(context, 5, 1);

    expect(resume.status?.changedPaths).toHaveLength(1);
    expect(resume.statusTruncated).toBe(true);
    expect(resume.truncated).toBe(true);
  });

  it("reports staged renames and merge conflicts from porcelain v2", async () => {
    const { context, root } = await makeContext();
    await initializeRepository(root);
    await writeFile(join(root, "rename-me.txt"), "rename base\n", "utf8");
    await git(root, "add", "rename-me.txt");
    await git(root, "commit", "-m", "add rename fixture");
    await git(root, "mv", "rename-me.txt", "renamed.txt");

    const renamed = await getProjectResume(context);
    expect(renamed.status?.staged).toContain("renamed.txt");
    expect(renamed.status?.changedPaths).toContain("renamed.txt");

    await git(root, "reset", "--hard", "HEAD");
    await git(root, "checkout", "-b", "conflict-side");
    await writeFile(join(root, "tracked.txt"), "side\n", "utf8");
    await git(root, "add", "tracked.txt");
    await git(root, "commit", "-m", "side change");
    await git(root, "checkout", "main");
    await writeFile(join(root, "tracked.txt"), "main\n", "utf8");
    await git(root, "add", "tracked.txt");
    await git(root, "commit", "-m", "main change");
    const merge = await runProcess("git.exe", ["merge", "conflict-side"], { cwd: root, timeoutMs: 20_000 });
    expect(merge.exitCode).not.toBe(0);

    const conflicted = await getProjectResume(context);
    expect(conflicted.status?.conflicted).toContain("tracked.txt");
    expect(conflicted.status?.changedPaths).toContain("tracked.txt");
  });

  it("reports a non-repository without treating it as a tool failure", async () => {
    const { context } = await makeContext();

    const resume = await getProjectResume(context);

    expect(resume.gitAvailable).toBe(true);
    expect(resume.isGitRepository).toBe(false);
    expect(resume.repositoryRoot).toBeNull();
    expect(resume.status).toBeNull();
    expect(resume.error).toBeTruthy();
  });

  it("refuses to summarize a parent repository outside the registered project root", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "project-resume-parent-"));
    temporaryRoots.push(repositoryRoot);
    await initializeRepository(repositoryRoot);
    const childRoot = join(repositoryRoot, "registered-child");
    await mkdir(childRoot, { recursive: true });
    const { context } = await makeContext(childRoot);

    const resume = await getProjectResume(context);

    expect(resume.gitAvailable).toBe(true);
    expect(resume.isGitRepository).toBe(false);
    expect(resume.error).toMatch(/outside the registered project root/u);
  });
});
