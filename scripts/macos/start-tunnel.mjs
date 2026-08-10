import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  atomicWrite,
  delay,
  loadInstallation,
  processMatches,
  readControlPlaneKey,
  readPidRecord,
  runtimePaths,
  tunnelDoctor,
  tunnelClientPath,
} from "./tunnel-common.mjs";

const profileIndex = process.argv.indexOf("--profile");
const profileId = profileIndex >= 0 ? process.argv[profileIndex + 1] : "workstation";
const installation = loadInstallation(profileId);
const paths = runtimePaths(installation);
const executable = tunnelClientPath(installation);
if (!existsSync(executable)) throw new Error("Tunnel runtime is not installed.");
if (!existsSync(installation.tunnelConfigPath)) throw new Error("Tunnel is not configured.");
const controlPlaneKey = readControlPlaneKey(profileId);
if (!tunnelDoctor(installation, controlPlaneKey, "inherit")) {
  throw new Error("Tunnel control-plane authentication failed.");
}
mkdirSync(installation.runtimeRoot, { recursive: true, mode: 0o700 });
const supervisorScript = resolve(installation.engineRoot, "scripts", "macos", "tunnel-supervisor.mjs");
const existing = readPidRecord(paths.supervisorPath);
if (processMatches(existing, [supervisorScript, existing?.instance ?? "<missing>"])) {
  throw new Error(`Tunnel supervisor is already running as PID ${existing.pid}.`);
}
rmSync(paths.supervisorPath, { force: true });
rmSync(paths.stopPath, { force: true });
atomicWrite(paths.desiredPath, `${profileId}\n`);
const instance = randomUUID();
const outputHandle = openSync(paths.supervisorLogPath, "a", 0o600);
const child = spawn(installation.nodePath, [supervisorScript, "--profile", profileId, "--instance", instance], {
  cwd: installation.engineRoot,
  detached: true,
  env: { ...process.env },
  shell: false,
  stdio: ["ignore", outputHandle, outputHandle],
});
closeSync(outputHandle);
child.unref();

const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  const record = readPidRecord(paths.supervisorPath);
  if (record?.instance === instance && processMatches(record, [supervisorScript, instance])) {
    try {
      const healthUrl = await import("node:fs").then(({ readFileSync }) => readFileSync(paths.healthUrlPath, "utf8").trim());
      const readiness = await fetch(`${healthUrl}/readyz`, { signal: AbortSignal.timeout(2_000) });
      if (readiness.ok) {
        console.log(`WorkForge tunnel ready: ${profileId}`);
        console.log(`Admin UI: ${healthUrl}/ui`);
        process.exit(0);
      }
    } catch { /* still starting */ }
  }
  await delay(500);
}
rmSync(paths.desiredPath, { force: true });
atomicWrite(paths.stopPath, `${profileId}\n`);
throw new Error(`Tunnel did not become ready. See ${paths.supervisorLogPath} and ${paths.tunnelStderrPath}.`);
