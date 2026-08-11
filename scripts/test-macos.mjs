import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { assertSupportedNodeVersion, readMinimumNodeVersion } from "./macos/node-runtime.mjs";

if (process.platform !== "darwin") {
  console.log("MACOS_TEST_SKIPPED");
  process.exit(0);
}

const root = resolve(import.meta.dirname, "..");
const minimumNodeVersion = readMinimumNodeVersion(root);
assert.equal(minimumNodeVersion.text, "20.19.0");
assert.equal(assertSupportedNodeVersion("20.19.0", root, "/test/node"), "20.19.0");
assert.equal(assertSupportedNodeVersion("24.0.0", root, "/test/node"), "24.0.0");
assert.throws(
  () => assertSupportedNodeVersion("20.18.9", root, "/test/node"),
  /WorkForge requires Node\.js 20\.19\.0 or newer/u,
);
assert.throws(() => assertSupportedNodeVersion("20.19.0-rc.1", root), /Node\.js version is invalid/u);
assert.throws(() => assertSupportedNodeVersion("not-a-version", root), /Node\.js version is invalid/u);
const fixture = mkdtempSync(resolve(tmpdir(), "workforge-macos-test-"));
const projectRoot = resolve(fixture, "project");
const stateRoot = resolve(fixture, "state");
const runtimeRoot = resolve(fixture, "runtime");
const environment = {
  ...process.env,
  WORKFORGE_MACOS_STATE_ROOT: stateRoot,
  WORKFORGE_RUNTIME_ROOT: runtimeRoot,
};
mkdirSync(projectRoot, { recursive: true });

try {
  execFileSync(process.execPath, [resolve(root, "scripts", "macos", "setup.mjs"), "--project", projectRoot], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  const statePath = resolve(stateRoot, "current.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(state.registryPath, resolve(runtimeRoot, "profile_registry.json"));
  assert.equal(state.nodePath, process.execPath);

  const unsupportedNodePath = resolve(fixture, "unsupported-node");
  writeFileSync(unsupportedNodePath, "#!/bin/sh\nprintf '%s\n' '20.18.9'\n", { mode: 0o755 });
  writeFileSync(statePath, `${JSON.stringify({ ...state, nodePath: unsupportedNodePath }, null, 2)}\n`);
  assert.throws(
    () => execFileSync(process.execPath, [resolve(root, "scripts", "macos", "doctor.mjs")], {
      cwd: root,
      env: environment,
      encoding: "utf8",
      stdio: "pipe",
    }),
    (error) => {
      const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
      assert.match(output, /Node\.js 20\.18\.9 .* WorkForge requires Node\.js 20\.19\.0 or newer/u);
      return true;
    },
  );
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  execFileSync(process.execPath, [resolve(root, "scripts", "macos", "doctor.mjs")], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  execFileSync(process.execPath, [resolve(root, "scripts", "plugin-stdio-smoke.mjs"), resolve(root, "plugins", "workforge"), "workstation"], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  execFileSync(process.execPath, [resolve(root, "scripts", "macos", "uninstall.mjs"), "--profile", "workstation"], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  console.log("MACOS_INSTALL_AND_PLUGIN_TEST_OK");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
