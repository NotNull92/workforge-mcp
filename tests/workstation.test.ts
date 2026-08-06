import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectContext, ProjectProfile } from "../src/profile.js";
import { assertCurrentContextRevision, getWorkstationContext } from "../src/workstation.js";

const temporaryRoots: string[] = [];

async function fixture(bootstrapFiles: readonly string[] = ["AGENTS.md", "docs/HANDOFF.md"]) {
  const root = await mkdtemp(join(tmpdir(), "workstation-context-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "Always verify.\n", "utf8");
  await writeFile(join(root, "docs", "HANDOFF.md"), "Current task: context parity.\n", "utf8");
  const profile = Object.freeze({
    id: "test-profile",
    displayName: "Test Profile",
    appName: "Test Workstation",
    serverName: "test-workstation",
    defaultWorkingDirectoryRelative: ".",
    httpPort: 23003,
    bootstrapFiles: Object.freeze([...bootstrapFiles]),
    identityMarkers: Object.freeze([]),
    primaryRoot: root,
  }) as unknown as ProjectProfile;
  const context = Object.freeze({
    profile,
    primaryRoot: root,
    defaultWorkingDirectory: root,
    engineRoot: root,
    managedProjectRoots: Object.freeze([Object.freeze({ profileId: "test-profile", primaryRoot: root })]),
  }) satisfies ProjectContext;
  return { context, root };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workstation bootstrap context", () => {
  it("returns complete configured bootstrap content with a deterministic revision", async () => {
    const { context } = await fixture();
    const first = await getWorkstationContext(context);
    const second = await getWorkstationContext(context);

    expect(first.contextRevision).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.contextRevision).toBe(second.contextRevision);
    expect(first.bootstrapEntries.map((entry) => entry.relativePath)).toEqual(["AGENTS.md", "docs/HANDOFF.md"]);
    expect(first.bootstrapEntries[0]?.content).toBe("Always verify.\n");
    expect(first.bootstrapEntries[1]?.content).toBe("Current task: context parity.\n");
    await expect(assertCurrentContextRevision(context, first.contextRevision)).resolves.toBeUndefined();
  });

  it("rejects a stale revision after any configured bootstrap file changes", async () => {
    const { context, root } = await fixture();
    const first = await getWorkstationContext(context);
    await writeFile(join(root, "AGENTS.md"), "Always verify twice.\n", "utf8");

    await expect(assertCurrentContextRevision(context, first.contextRevision)).rejects.toThrow(/missing or stale/u);
    const refreshed = await getWorkstationContext(context);
    expect(refreshed.contextRevision).not.toBe(first.contextRevision);
    await expect(assertCurrentContextRevision(context, refreshed.contextRevision)).resolves.toBeUndefined();
  });

  it("fails closed when a configured bootstrap file is missing or invalid UTF-8", async () => {
    const missing = await fixture(["MISSING.md"]);
    await expect(getWorkstationContext(missing.context)).rejects.toThrow(/missing/u);

    const invalid = await fixture(["AGENTS.md"]);
    await writeFile(join(invalid.root, "AGENTS.md"), Buffer.from([0xff, 0xfe]));
    await expect(getWorkstationContext(invalid.context)).rejects.toThrow();
  });
});
