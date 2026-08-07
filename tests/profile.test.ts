import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  listKnownProfileIds,
  loadProjectContextFromArgv,
  loadProjectProfile,
  parseProfileId,
  type ProfileLoadOptions,
} from "../src/profile.js";

const temporaryRoots: string[] = [];

interface Fixture {
  options: ProfileLoadOptions;
  profilePath: string;
  registryPath: string;
  markerPath: string;
  primaryRoot: string;
  defaultWorkingDirectory: string;
  profile: Record<string, unknown>;
}

function profileText(profile: Record<string, unknown>): string {
  return JSON.stringify(profile, null, 2) + "\n";
}

interface FixtureRegistryEntry {
  id: string;
  profilePath: string;
  profileText: string;
}

async function writeFixtureRegistry(fixture: Fixture, entries: readonly FixtureRegistryEntry[]): Promise<void> {
  await writeFile(fixture.registryPath, JSON.stringify({
    version: 1,
    profiles: entries.map((entry) => ({
      id: entry.id,
      profilePath: entry.profilePath,
      profileSha256: createHash("sha256").update(entry.profileText).digest("hex").toUpperCase(),
    })),
  }, null, 2) + "\n", "utf8");
}

async function writeFixtureProfile(fixture: Fixture, profile: Record<string, unknown>): Promise<void> {
  const text = profileText(profile);
  await writeFile(fixture.profilePath, text, "utf8");
  await writeFixtureRegistry(fixture, [{ id: String(profile.id), profilePath: fixture.profilePath, profileText: text }]);
}

async function addFixtureProfile(
  fixture: Fixture,
  id: string,
  primaryRoot: string,
): Promise<FixtureRegistryEntry> {
  const profileDirectory = join(primaryRoot, "tools", "workforge-mcp");
  const profilePath = join(profileDirectory, "profile.json");
  const markerPath = join(primaryRoot, "project.marker");
  await mkdir(profileDirectory, { recursive: true });
  await writeFile(markerPath, `identity=${id}\n`, "utf8");
  const profile = {
    id,
    displayName: id,
    appName: `${id} Workstation`,
    serverName: `${id}-workstation`,
    defaultWorkingDirectoryRelative: ".",
    httpPort: 23004,
    bootstrapFiles: ["project.marker"],
    identityMarkers: [{ relativePath: "project.marker", expectedLiteral: `identity=${id}` }],
  };
  const text = profileText(profile);
  await writeFile(profilePath, text, "utf8");
  return { id, profilePath, profileText: text };
}

async function makeFixture(): Promise<Fixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workstation-profile-")));
  temporaryRoots.push(root);
  const engineRoot = join(root, "workforge-mcp");
  const registryDirectory = join(engineRoot, "runtime");
  const registryPath = join(registryDirectory, "profile_registry.json");
  const primaryRoot = join(root, "project");
  const defaultWorkingDirectory = join(primaryRoot, "workspace");
  const profileDirectory = join(primaryRoot, "tools", "workforge-mcp");
  const profilePath = join(profileDirectory, "profile.json");
  const markerPath = join(primaryRoot, "project.marker");
  await Promise.all([
    mkdir(engineRoot, { recursive: true }),
    mkdir(registryDirectory, { recursive: true }),
    mkdir(profileDirectory, { recursive: true }),
    mkdir(defaultWorkingDirectory, { recursive: true }),
  ]);
  await writeFile(markerPath, "identity=test-project\n", "utf8");
  await writeFile(join(primaryRoot, "README.md"), "fixture\n", "utf8");
  const profile: Record<string, unknown> = {
    id: "test-project",
    displayName: "Test Project",
    appName: "Test Project Workstation",
    serverName: "test-project-chatgpt-workstation",
    defaultWorkingDirectoryRelative: "workspace",
    httpPort: 23001,
    bootstrapFiles: ["README.md"],
    identityMarkers: [{ relativePath: "project.marker", expectedLiteral: "identity=test-project" }],
  };
  const fixture = {
    options: { engineRoot, registryPath },
    profilePath,
    registryPath,
    markerPath,
    primaryRoot,
    defaultWorkingDirectory,
    profile,
  };
  await writeFixtureProfile(fixture, profile);
  return fixture;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("profile selection", () => {
  it("requires exactly one explicit profile", () => {
    expect(() => parseProfileId([])).toThrow("exactly one --profile");
    expect(parseProfileId(["--profile", "example-one"])).toBe("example-one");
    expect(parseProfileId(["--profile=example-two"])).toBe("example-two");
  });

  it("rejects duplicate, malformed, unrelated, and unregistered selections", async () => {
    expect(() => parseProfileId(["--profile", "one", "--profile=two"])).toThrow("exactly one");
    expect(() => parseProfileId(["--profile", "../example"])).toThrow("Invalid project profile id");
    expect(() => parseProfileId(["--project-root", "C:\\unsafe"])).toThrow("Unknown MCP bridge argument");
    const fixture = await makeFixture();
    await expect(loadProjectProfile("unknown", fixture.options)).rejects.toThrow("Unknown project profile");
  });
});

describe("trusted identity profile", () => {
  it("rejects profile tampering, unknown keys, misplaced profiles, and marker mismatches", async () => {
    const fixture = await makeFixture();
    await writeFile(fixture.profilePath, profileText({ ...fixture.profile, displayName: "Tampered" }), "utf8");
    await expect(loadProjectProfile("test-project", fixture.options)).rejects.toThrow("SHA-256 mismatch");

    await writeFixtureProfile(fixture, { ...fixture.profile, accessRoots: [fixture.primaryRoot] });
    await expect(loadProjectProfile("test-project", fixture.options)).rejects.toThrow();

    await writeFixtureProfile(fixture, fixture.profile);
    await writeFile(fixture.markerPath, "identity=other-project\n", "utf8");
    await expect(loadProjectProfile("test-project", fixture.options)).rejects.toThrow("Identity marker mismatch");
  });

  it("derives and freezes identity plus default cwd without creating an access allowlist", async () => {
    const fixture = await makeFixture();
    const context = await loadProjectProfile("test-project", fixture.options);
    expect(context.primaryRoot).toBe(fixture.primaryRoot);
    expect(context.defaultWorkingDirectory).toBe(fixture.defaultWorkingDirectory);
    expect(context.profile.primaryRoot).toBe(fixture.primaryRoot);
    expect(Object.hasOwn(context.profile, "accessRoots")).toBe(false);
    expect(Object.hasOwn(context.profile, "protectedPrefixes")).toBe(false);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.profile.bootstrapFiles)).toBe(true);
    expect(Object.isFrozen(context.managedProjectRoots)).toBe(true);

    const mutable = context.profile as unknown as { displayName: string; bootstrapFiles: string[] };
    expect(() => { mutable.displayName = "changed"; }).toThrow(TypeError);
    expect(() => { mutable.bootstrapFiles.push("other.md"); }).toThrow(TypeError);
  });

  it("derives every managed project root from the trusted registry and rejects overlapping roots", async () => {
    const fixture = await makeFixture();
    const selectedText = profileText(fixture.profile);
    const foreignRoot = join(dirname(fixture.primaryRoot), "foreign-project");
    const foreign = await addFixtureProfile(fixture, "foreign-project", foreignRoot);
    await writeFixtureRegistry(fixture, [
      { id: "test-project", profilePath: fixture.profilePath, profileText: selectedText },
      foreign,
    ]);

    const context = await loadProjectProfile("test-project", fixture.options);
    expect(context.managedProjectRoots).toEqual([
      { profileId: "test-project", primaryRoot: fixture.primaryRoot },
      { profileId: "foreign-project", primaryRoot: foreignRoot },
    ]);
    expect(Object.isFrozen(context.managedProjectRoots[0])).toBe(true);

    const nestedRoot = join(fixture.primaryRoot, "nested-project");
    const nested = await addFixtureProfile(fixture, "nested-project", nestedRoot);
    await writeFixtureRegistry(fixture, [
      { id: "test-project", profilePath: fixture.profilePath, profileText: selectedText },
      nested,
    ]);
    await expect(loadProjectProfile("test-project", fixture.options)).rejects.toThrow("Managed project roots must not overlap");
  });
});

describe("explicit profile loading", () => {
  it("lists and loads only explicitly selected profiles from a supplied registry", async () => {
    const fixture = await makeFixture();
    await expect(loadProjectContextFromArgv([], fixture.options)).rejects.toThrow("exactly one --profile");
    await expect(listKnownProfileIds(fixture.options)).resolves.toEqual(["test-project"]);
    const context = await loadProjectContextFromArgv(["--profile", "test-project"], fixture.options);
    expect(context.profile.id).toBe("test-project");
    expect(context.managedProjectRoots).toEqual([{ profileId: "test-project", primaryRoot: fixture.primaryRoot }]);
  });
});

describe("stdio credential boundary", () => {
  it("removes only the tunnel credential before importing the server", async () => {
    const source = await readFile(fileURLToPath(new URL("../src/stdio.ts", import.meta.url)), "utf8");
    expect(source).toContain('key.toLowerCase() === "control_plane_api_key"');
    expect(source).not.toContain("SAFE_ENV_KEYS");
  });
});
