import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { keychainPasswordHex } from "./macos/tunnel-common.mjs";

if (process.platform !== "darwin") {
  console.log("MACOS_TUNNEL_TEST_SKIPPED");
  process.exit(0);
}
const root = resolve(import.meta.dirname, "..");
const longRuntimeKey = `sk-proj-${"x".repeat(180)}`;
assert.equal(Buffer.from(keychainPasswordHex(longRuntimeKey), "hex").toString("utf8"), longRuntimeKey);
const fixture = mkdtempSync(resolve(tmpdir(), "workforge-macos-tunnel-test-"));
const stateRoot = resolve(fixture, "state");
const projectRoot = resolve(fixture, "project");
const profileRoot = resolve(projectRoot, "tools", "workforge-mcp");
const fakeTunnel = resolve(fixture, "fake-tunnel-client.mjs");
mkdirSync(profileRoot, { recursive: true });
mkdirSync(stateRoot, { recursive: true });
const profilePath = resolve(profileRoot, "profile.json");
writeFileSync(profilePath, "{}\n");
writeFileSync(resolve(profileRoot, "tunnel.local.yaml"), "config_version: 1\n");
writeFileSync(resolve(stateRoot, "registry.json"), `${JSON.stringify({
  version: 1, profiles: [{ id: "workstation", profilePath, profileSha256: "0".repeat(64) }],
})}\n`);
writeFileSync(resolve(stateRoot, "current.json"), `${JSON.stringify({
  version: 1, engineRoot: root, registryPath: resolve(stateRoot, "registry.json"), nodePath: process.execPath,
})}\n`);
writeFileSync(fakeTunnel, `#!/usr/bin/env node
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
const valueAfter = (name) => process.argv[process.argv.indexOf(name) + 1];
if (process.argv.includes("--version")) { console.log("fake 0.0.11"); process.exit(0); }
if (process.argv[2] === "doctor") process.exit(process.env.FAKE_CONTROL_PLANE_OK === "1" ? 0 : 2);
if (process.argv[2] !== "run") process.exit(0);
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
  CONTROL_PLANE_API_KEY: "test-runtime-key",
  FAKE_CONTROL_PLANE_OK: "1",
};
try {
  execFileSync(process.execPath, [resolve(root, "scripts", "macos", "start-tunnel.mjs")], { env: environment, stdio: "inherit" });
  const running = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts", "macos", "tunnel-status.mjs")], { env: environment, encoding: "utf8" }));
  assert.equal(running.running, true);
  assert.equal(running.healthy, true);
  assert.equal(running.localReady, true);
  assert.equal(running.controlPlaneHealthy, true);
  assert.equal(running.ready, true);
  const unauthenticated = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts", "macos", "tunnel-status.mjs")], {
    env: { ...environment, FAKE_CONTROL_PLANE_OK: "0" }, encoding: "utf8",
  }));
  assert.equal(unauthenticated.localReady, true);
  assert.equal(unauthenticated.controlPlaneHealthy, false);
  assert.equal(unauthenticated.ready, false);
  execFileSync(process.execPath, [resolve(root, "scripts", "macos", "stop-tunnel.mjs")], { env: environment, stdio: "inherit" });
  const stopped = JSON.parse(execFileSync(process.execPath, [resolve(root, "scripts", "macos", "tunnel-status.mjs")], { env: environment, encoding: "utf8" }));
  assert.equal(stopped.running, false);
  console.log("MACOS_TUNNEL_LIFECYCLE_TEST_OK");
} finally {
  try { execFileSync(process.execPath, [resolve(root, "scripts", "macos", "stop-tunnel.mjs")], { env: environment, stdio: "ignore" }); } catch { /* best effort */ }
  rmSync(fixture, { recursive: true, force: true });
}
