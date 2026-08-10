import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  deleteStoredControlPlaneKey,
  hasStoredControlPlaneKey,
  loadInstallation,
  readStoredControlPlaneKey,
  resolveTunnelRuntimeDescriptor,
  scrubControlPlaneEnvironment,
  storeControlPlaneKey,
} from "./macos/tunnel-common.mjs";

const root = resolve(import.meta.dirname, "..");
const commonSource = readFileSync(resolve(root, "scripts", "macos", "tunnel-common.mjs"), "utf8");
const configureSource = readFileSync(resolve(root, "scripts", "macos", "configure-tunnel.mjs"), "utf8");
const startSource = readFileSync(resolve(root, "scripts", "macos", "start-tunnel.mjs"), "utf8");
const installSource = readFileSync(resolve(root, "scripts", "macos", "install-tunnel-runtime.mjs"), "utf8");
assert.equal(configureSource.includes("keychainPasswordHex"), false, "Runtime API Key encoding helper must not return to macOS configure flow.");
assert.equal(configureSource.includes('"-X"'), false, "Runtime API Key must never be passed through configure-process argv.");
assert.match(commonSource, /spawnSync\("\/usr\/bin\/security", \["-i"\]/u, "Keychain storage must use security interactive stdin mode.");
assert.match(commonSource, /input: command/u, "Keychain storage must send the credential command through stdin.");
assert.doesNotMatch(commonSource, /spawnSync\("\/usr\/bin\/security", \[\s*"add-generic-password"/u, "Keychain storage must not put add-generic-password secret data in process argv.");
assert.match(configureSource, /storeControlPlaneKey/u, "macOS configure flow must use the Keychain stdin helper.");
assert.match(configureSource, /atomicWrite\(installation\.tunnelConfigPath/u, "macOS tunnel config must be written atomically in the destination directory.");
assert.match(startSource, /scrubControlPlaneEnvironment/u, "macOS supervisor launch must scrub CONTROL_PLANE_API_KEY.");
assert.match(installSource, /resolveTunnelRuntimeDescriptor/u, "macOS runtime install must use runtime-lock metadata.");
assert.match(installSource, /cpSync\(extractedPath, stagingRoot/u, "macOS runtime install must copy across filesystems before destination-local rename.");
assert.match(installSource, /AbortSignal\.timeout/u, "macOS runtime download must be bounded.");

if (process.platform !== "darwin") {
  console.log("MACOS_TUNNEL_STATIC_TEST_OK");
  console.log("MACOS_TUNNEL_TEST_SKIPPED");
  process.exit(0);
}

const profileId = `wf-test-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const longRuntimeKey = `runtime-${"x".repeat(180)}`;
const keySha256 = createHash("sha256").update(longRuntimeKey).digest("hex");
const scrubbed = scrubControlPlaneEnvironment({ KEEP_ME: "yes", CONTROL_PLANE_API_KEY: "remove-me" });
assert.equal(scrubbed.KEEP_ME, "yes");
assert.equal("CONTROL_PLANE_API_KEY" in scrubbed, false);

const fixture = mkdtempSync(resolve(tmpdir(), "workforge-macos-tunnel-test-"));
const stateRoot = resolve(fixture, "state");
const projectRoot = resolve(fixture, "project");
const profileRoot = resolve(projectRoot, "tools", "workforge-mcp");
const fakeTunnel = resolve(fixture, "fake-tunnel-client.mjs");
mkdirSync(profileRoot, { recursive: true });
mkdirSync(stateRoot, { recursive: true });
const profilePath = resolve(profileRoot, "profile.json");
const profileBytes = Buffer.from(`${JSON.stringify({ id: profileId })}\n`, "utf8");
writeFileSync(profilePath, profileBytes);
writeFileSync(resolve(profileRoot, "tunnel.local.yaml"), "config_version: 1\n");
writeFileSync(resolve(stateRoot, "registry.json"), `${JSON.stringify({
  version: 1,
  profiles: [{
    id: profileId,
    profilePath,
    profileSha256: createHash("sha256").update(profileBytes).digest("hex"),
  }],
})}\n`);
writeFileSync(resolve(stateRoot, "current.json"), `${JSON.stringify({
  version: 1, engineRoot: root, registryPath: resolve(stateRoot, "registry.json"), nodePath: process.execPath,
})}\n`);
writeFileSync(fakeTunnel, `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
const valueAfter = (name) => process.argv[process.argv.indexOf(name) + 1];
if (process.argv.includes("--version")) { console.log("fake 0.0.11"); process.exit(0); }
if (process.argv[2] === "doctor") process.exit(process.env.FAKE_CONTROL_PLANE_OK === "1" ? 0 : 2);
if (process.argv[2] !== "run") process.exit(0);
const observedKeyHash = createHash("sha256").update(process.env.CONTROL_PLANE_API_KEY ?? "").digest("hex");
if (observedKeyHash !== process.env.EXPECTED_KEY_SHA256) process.exit(9);
writeFileSync(valueAfter("--pid.file"), String(process.pid));
const server = createServer((request, response) => {
  response.statusCode = request.url === "/healthz" || request.url === "/readyz" ? 200 : 404;
  response.end("ok");
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  writeFileSync(valueAfter("--health.url-file"), "http://127.0.0.1:" + address.port);
});
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => {}, 1000);
`);
chmodSync(fakeTunnel, 0o755);
const environment = {
  ...process.env,
  WORKFORGE_MACOS_STATE_ROOT: stateRoot,
  WORKFORGE_TUNNEL_CLIENT_PATH: fakeTunnel,
  CONTROL_PLANE_API_KEY: "poison-parent-value",
  EXPECTED_KEY_SHA256: keySha256,
  FAKE_CONTROL_PLANE_OK: "1",
};
try {
  deleteStoredControlPlaneKey(profileId);
  storeControlPlaneKey(profileId, longRuntimeKey);
  assert.equal(hasStoredControlPlaneKey(profileId), true);
  assert.equal(readStoredControlPlaneKey(profileId), longRuntimeKey);

  const installation = loadInstallation(profileId);
  const arm64Runtime = resolveTunnelRuntimeDescriptor(installation, "arm64");
  const x64Runtime = resolveTunnelRuntimeDescriptor(installation, "x64");
  assert.equal(arm64Runtime.archiveName, `tunnel-client-v${arm64Runtime.version}-darwin-arm64.zip`);
  assert.equal(x64Runtime.archiveName, `tunnel-client-v${x64Runtime.version}-darwin-amd64.zip`);

  execFileSync(process.execPath, [resolve(root, "scripts", "macos", "start-tunnel.mjs"), "--profile", profileId], { env: environment, stdio: "inherit" });
  const running = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts", "macos", "tunnel-status.mjs"), "--profile", profileId], { env: environment, encoding: "utf8" }));
  assert.equal(running.running, true);
  assert.equal(running.healthy, true);
  assert.equal(running.localReady, true);
  assert.equal(running.controlPlaneHealthy, true);
  assert.equal(running.ready, true);
  const unauthenticated = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts", "macos", "tunnel-status.mjs"), "--profile", profileId], {
    env: { ...environment, FAKE_CONTROL_PLANE_OK: "0" }, encoding: "utf8",
  }));
  assert.equal(unauthenticated.localReady, true);
  assert.equal(unauthenticated.controlPlaneHealthy, false);
  assert.equal(unauthenticated.ready, false);
  execFileSync(process.execPath, [resolve(root, "scripts", "macos", "stop-tunnel.mjs"), "--profile", profileId], { env: environment, stdio: "inherit" });
  const stopped = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts", "macos", "tunnel-status.mjs"), "--profile", profileId], { env: environment, encoding: "utf8" }));
  assert.equal(stopped.running, false);
  console.log("MACOS_KEYCHAIN_ROUNDTRIP_TEST_OK");
  console.log("MACOS_TUNNEL_LIFECYCLE_TEST_OK");
} finally {
  try { execFileSync(process.execPath, [resolve(root, "scripts", "macos", "stop-tunnel.mjs"), "--profile", profileId], { env: environment, stdio: "ignore" }); } catch { /* best effort */ }
  deleteStoredControlPlaneKey(profileId);
  rmSync(fixture, { recursive: true, force: true });
}
