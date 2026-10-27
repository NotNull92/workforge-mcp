import { access, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { inspectRun } from "../src/inspect.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectContext, ProjectProfile } from "../src/profile.js";
import { resolveToolExecutable, runProcess } from "../src/process.js";
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
  const result = await runProcess(resolveToolExecutable("git"), args, { cwd: root, timeoutMs: 20_000 });
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
  it("rejects inspection when the actual Git root contains another profile", async () => {
    const parent = await mkdtemp(join(tmpdir(), "project-resume-root-"));
    temporaryRoots.push(parent);
    await initializeRepository(parent);
    const primary = join(parent, "primary");
    const foreign = join(parent, "foreign");
    await mkdir(primary); await mkdir(foreign);
    const { context } = await makeContext(primary);
    // Registered roots are canonical (profile.ts); CI temp dirs are not (macOS /var symlink, Windows 8.3 names).
    const isolated = { ...context, managedProjectRoots: [...context.managedProjectRoots, { profileId: "foreign", primaryRoot: await realpath(foreign) }] };
    await expect(inspectRun({ context: isolated, path: primary, preset: "git_log" })).rejects.toThrow("Cross-profile path denied");
  });
  it("does not run lazy-fetch transport commands for missing partial-clone objects", async () => {
    const { root: source } = await makeContext();
    await initializeRepository(source);
    await git(source, "config", "uploadpack.allowFilter", "true");
    await writeFile(join(source, "tracked.txt"), "changed\n");
    await git(source, "add", "tracked.txt");
    await git(source, "commit", "-m", "second");
    const parent = await mkdtemp(join(tmpdir(), "project-resume-partial-"));
    temporaryRoots.push(parent);
    const clone = join(parent, "clone");
    await git(parent, "clone", "--filter=blob:none", "--no-checkout", pathToFileURL(source).href, clone);
    const missing = await runProcess(resolveToolExecutable("git"), ["rev-list", "--objects", "--missing=print", "HEAD"], {
      cwd: clone, timeoutMs: 10000, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
    });
    expect(missing.stdout).toMatch(/^\?[0-9a-f]{40,64}$/mu);
    const { context } = await makeContext(clone);
    await git(clone, "config", "remote.origin.uploadpack", `sh -c 'touch WF_FETCHED; exec git-upload-pack "$@"' --`);
    await inspectRun({ context, path: clone, preset: "git_show_stat", revision: "HEAD" });
    await getProjectResume(context, 5, 200, clone, [], true).catch(() => undefined);
    await expect(access(join(clone, "WF_FETCHED"))).rejects.toThrow();
  });
  it("neutralizes included Git filters before read-only worktree inspection", async () => {
    const { context, root } = await makeContext();
    await initializeRepository(root);
    await writeFile(join(root, "filter.cjs"), "require('fs').writeFileSync('PWNED','executed');");
    await writeFile(join(root, "filter.conf"), `[filter "evil"]\n clean = node filter.cjs\n required = true\n`);
    await git(root, "config", "include.path", "../filter.conf");
    await writeFile(join(root, ".gitattributes"), "*.txt filter=evil\n");
    await writeFile(join(root, "tracked.txt"), "changed\n");
    const result = await getProjectResume(context, 5, 200, root, [], true);
    expect(result.isGitRepository).toBe(true);
    expect(result.status?.unstaged).toContain("tracked.txt");
    await expect(access(join(root, "PWNED"))).rejects.toThrow();
    expect((await inspectRun({ context, path: root, preset: "git_log" })).exitCode).toBe(0);
    await expect(inspectRun({ context, path: root, preset: "git_show_stat", revision: "--exec=bad" })).rejects.toThrow("revision");
  });
  it("refuses excessive Git filter drivers before worktree inspection", async () => {
    const { context, root } = await makeContext();
    await initializeRepository(root);
    await writeFile(join(root, "filter.cjs"), "require('fs').writeFileSync('PWNED','executed');");
    await writeFile(join(root, "filter.conf"), Array.from({ length: 65 }, (_, i) => `[filter "driver${i}"]\n clean = node filter.cjs\n`).join(""));
    await git(root, "config", "include.path", "../filter.conf");
    await writeFile(join(root, ".gitattributes"), "*.txt filter=driver0\n");
    await writeFile(join(root, "tracked.txt"), "changed\n");
    const result = await getProjectResume(context, 5, 200, root, [], true);
    expect(result.status).toBeNull();
    expect(result.error).toContain("Too many filter drivers");
    await expect(access(join(root, "PWNED"))).rejects.toThrow();
  });
  it("reads selected handoffs relative to the target without Git", async () => {
    const { context, root } = await makeContext();
    const resume = await getProjectResume(context, 5, 200, join(root, "docs"), ["HANDOFF.md"]);
    expect(resume.isGitRepository).toBe(false);
    expect(resume.resumeDocuments).toEqual([expect.objectContaining({
      path: join(root, "docs", "HANDOFF.md"),
      text: "Next: inspect the current diff.\n",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      truncated: false,
    })]);
    expect((await getProjectResume(context)).resumeDocuments).toEqual([]);
  });

  it("bounds document content and count, and rejects missing documents", async () => {
    const { context, root } = await makeContext();
    await writeFile(join(root, "docs", "HANDOFF.md"), "x".repeat(12_001), "utf8");
    const resume = await getProjectResume(context, 5, 200, root, ["docs/HANDOFF.md"]);
    expect(resume.resumeDocuments[0]?.text).toHaveLength(12_000);
    expect(resume.resumeDocuments[0]?.truncated).toBe(true);
    expect(resume.truncated).toBe(true);
    await expect(getProjectResume(context, 5, 200, root, Array(9).fill("docs/HANDOFF.md"))).rejects.toThrow("At most 8");
    await expect(getProjectResume(context, 5, 200, root, ["missing.md"])).rejects.toThrow();
  });

  it("rejects handoff symlinks into another registered profile", async () => {
    const { context, root } = await makeContext();
    const foreign = await makeContext();
    await symlink(foreign.root, join(root, "foreign"), process.platform === "win32" ? "junction" : "dir");
    // The profile loader registers canonical roots; CI temp dirs sit behind /var or 8.3 aliases.
    const isolated = { ...context, managedProjectRoots: [
      ...context.managedProjectRoots, { profileId: "foreign", primaryRoot: await realpath(foreign.root) },
    ] } satisfies ProjectContext;
    await expect(getProjectResume(isolated, 5, 200, root, ["foreign/docs/HANDOFF.md"])).rejects.toThrow("Cross-profile path denied");
  });

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
    const merge = await runProcess(resolveToolExecutable("git"), ["merge", "conflict-side"], { cwd: root, timeoutMs: 20_000 });
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

  it("summarizes an explicitly selected workstation repository outside the operating root", async () => {
    const { context } = await makeContext();
    const repositoryRoot = await mkdtemp(join(tmpdir(), "project-resume-external-"));
    temporaryRoots.push(repositoryRoot);
    await initializeRepository(repositoryRoot);

    const resume = await getProjectResume(context, 5, 200, repositoryRoot);

    expect(resume.gitAvailable).toBe(true);
    expect(resume.isGitRepository).toBe(true);
    expect(resume.workingDirectory).toBe(repositoryRoot);
    expect(resume.repositoryRoot).toBe(await realpath(repositoryRoot));
  });

  it("recognizes a repository when the requested working directory is an alias of its canonical path", async () => {
    const { context } = await makeContext();
    const fixtureRoot = await mkdtemp(join(tmpdir(), "project-resume-alias-"));
    temporaryRoots.push(fixtureRoot);
    const repositoryRoot = join(fixtureRoot, "repository");
    const aliasRoot = join(fixtureRoot, "alias");
    await mkdir(repositoryRoot, { recursive: true });
    await initializeRepository(repositoryRoot);
    await symlink(repositoryRoot, aliasRoot, process.platform === "win32" ? "junction" : "dir");

    const resume = await getProjectResume(context, 5, 200, aliasRoot);

    expect(resume.gitAvailable).toBe(true);
    expect(resume.isGitRepository).toBe(true);
    expect(resume.workingDirectory).toBe(aliasRoot);
    expect(resume.repositoryRoot).toBe(await realpath(repositoryRoot));
  });

  it("still refuses an explicitly selected repository owned by another registered profile", async () => {
    const { context } = await makeContext();
    const foreignRoot = await mkdtemp(join(tmpdir(), "project-resume-foreign-"));
    temporaryRoots.push(foreignRoot);
    await initializeRepository(foreignRoot);
    const isolatedContext = Object.freeze({
      ...context,
      managedProjectRoots: Object.freeze([
        ...context.managedProjectRoots,
        Object.freeze({ profileId: "foreign", primaryRoot: foreignRoot }),
      ]),
    }) satisfies ProjectContext;

    await expect(getProjectResume(isolatedContext, 5, 200, foreignRoot)).rejects.toThrow("Cross-profile path denied");
  });
});
