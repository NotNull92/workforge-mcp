import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

if (process.platform !== "darwin") {
  console.log("MACOS_TEST_SKIPPED");
  process.exit(0);
}

const root = resolve(import.meta.dirname, "..");
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
  const state = JSON.parse(readFileSync(resolve(stateRoot, "current.json"), "utf8"));
  assert.equal(state.registryPath, resolve(runtimeRoot, "profile_registry.json"));
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
