// Windows source/portable-adapter fixture; never updates the installed engine.
import { mkdtemp, realpath, mkdir, writeFile, readFile, cp, copyFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

assert.equal(process.platform, "win32", "This portable adapter fixture requires Windows.");
const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryParent = await realpath(tmpdir());
const root = await realpath(await mkdtemp(join(temporaryParent, "workforge-isolated-stdio-")));
const hash = value => createHash("sha256").update(value).digest("hex");
try {
  const version = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;
  const primary = join(root, "workspace"), state = join(root, "state"), programs = join(root, "programs");
  const engine = join(programs, "versions", version);
  const profilePath = join(primary, "tools", "workforge-mcp", "profile.json");
  await Promise.all([mkdir(dirname(profilePath), { recursive: true }), mkdir(state), mkdir(engine, { recursive: true })]);
  await writeFile(join(primary, "project.marker"), "fixture=smoke-test\n");
  const profile = JSON.stringify({ id: "smoke-test", displayName: "Smoke Test", appName: "Smoke Test", serverName: "smoke-test",
    defaultWorkingDirectoryRelative: ".", bootstrapFiles: ["project.marker"],
    identityMarkers: [{ relativePath: "project.marker", expectedLiteral: "fixture=smoke-test" }] });
  await writeFile(profilePath, profile);
  const registry = join(state, "profile_registry.json");
  await writeFile(registry, JSON.stringify({ version: 1, profiles: [{ id: "smoke-test", profilePath, profileSha256: hash(profile) }] }));
  await cp(join(source, "dist"), join(engine, "dist"), { recursive: true });
  await copyFile(join(source, "workforge-contract.json"), join(engine, "workforge-contract.json"));
  await symlink(join(source, "node_modules"), join(engine, "node_modules"), "junction");
  // Legacy manifest fixture exercises adapter resolution without producing a release.
  const critical = [".workforge-release.json", "package.json", "runtime-lock.json", "dist/stdio.js",
    "runtimes/node/node.exe", "runtimes/ripgrep/rg.exe", "runtimes/tunnel-client/tunnel-client.exe",
    "scripts/Setup.ps1", "scripts/WorkForge.Portable.ps1", "scripts/Portable-Control.ps1", "scripts/Portable-Control.cmd"];
  const files = [];
  for (const path of critical) {
    const target = join(engine, path);
    await mkdir(dirname(target), { recursive: true });
    if (path === "runtimes/node/node.exe") await copyFile(process.execPath, target);
    else if (path.startsWith("runtimes/") || path === ".workforge-release.json") await writeFile(target, "fixture");
    else if (path !== "dist/stdio.js") await copyFile(join(source, path), target);
    files.push({ path: path.replaceAll("/", "\\"), sha256: hash(await readFile(target)) });
  }
  const manifest = JSON.stringify({ schemaVersion: 1, version, files });
  await writeFile(join(engine, ".workforge-install.json"), manifest);
  await writeFile(join(programs, "current.json"), JSON.stringify({ schemaVersion: 1, product: "WorkForge", version,
    relativePath: `versions/${version}`, installManifestSha256: hash(manifest) }));
  const env = { ...process.env, WORKFORGE_MCP_PROFILE_REGISTRY: registry, WORKFORGE_PORTABLE_PROGRAMS_ROOT: programs,
    WORKFORGE_PORTABLE_STATE_ROOT: state, WORKFORGE_MCP_READ_ONLY: "0", WORKFORGE_MCP_READ_ONLY_EXTRAS: "0",
    WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT: "0", WORKFORGE_MCP_REDACTION: "on", WORKFORGE_MCP_REDACT_SHELL_LOGS: "0",
    WORKFORGE_MCP_REDACT_ENTROPY: "0" };
  delete env.WORKFORGE_MCP_TOOLS;
  delete env.WORKFORGE_MCP_REDACTION_RULES;
  for (const [script, args, changes] of [
    ["stdio-smoke.mjs", ["smoke-test"], {}],
    ["stdio-smoke.mjs", ["smoke-test", "--read-only"], {}],
    ["stdio-smoke.mjs", ["smoke-test", "--read-only"], { WORKFORGE_MCP_READ_ONLY_EXTRAS: "1" }],
    ["stdio-smoke.mjs", ["smoke-test"], { WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT: "1", WORKFORGE_MCP_REDACT_SHELL_LOGS: "1" }],
    ["plugin-stdio-smoke.mjs", ["plugins/workforge", "smoke-test"], {}],
  ]) {
    const result = spawnSync(process.execPath, [join(source, "scripts", script), ...args],
      { cwd: source, env: { ...env, ...changes }, encoding: "utf8", timeout: 60_000 });
    process.stdout.write(result.stdout ?? "");
    assert.equal(result.status, 0, `${script}: ${result.error?.message ?? result.stderr}`);
  }
  console.log("ISOLATED_STDIO_TEST_OK");
} finally {
  const child = relative(temporaryParent, root);
  assert(child && !child.startsWith("..") && !isAbsolute(child), "Unsafe fixture cleanup path");
  await rm(root, { recursive: true, force: true });
}
