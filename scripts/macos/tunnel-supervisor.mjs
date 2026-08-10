import { spawn } from "node:child_process";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  atomicWrite,
  delay,
  loadInstallation,
  readControlPlaneKey,
  runtimePaths,
  tunnelClientPath,
} from "./tunnel-common.mjs";

const valueAfter = (name) => process.argv[process.argv.indexOf(name) + 1];
const profileId = valueAfter("--profile") ?? "workstation";
const instance = valueAfter("--instance");
if (!/^[a-f0-9-]{36}$/u.test(instance ?? "")) throw new Error("Supervisor instance is invalid.");
const installation = loadInstallation(profileId);
const paths = runtimePaths(installation);
const executable = tunnelClientPath(installation);
mkdirSync(installation.runtimeRoot, { recursive: true, mode: 0o700 });
const key = readControlPlaneKey(profileId);
let stopping = false;
let child;

const requestStop = () => {
  stopping = true;
  if (child?.pid) {
    try { child.kill("SIGTERM"); } catch { /* child already stopped */ }
  }
};
process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);

atomicWrite(paths.supervisorPath, `${JSON.stringify({
  version: 1, pid: process.pid, profileId, instance, createdAt: new Date().toISOString(),
})}\n`);

const failureTimes = [];
try {
  while (!stopping && existsSync(paths.desiredPath) && !existsSync(paths.stopPath)) {
    rmSync(paths.healthUrlPath, { force: true });
    rmSync(paths.tunnelPidPath, { force: true });
    const stdout = createWriteStream(paths.tunnelStdoutPath, { flags: "a", mode: 0o600 });
    const stderr = createWriteStream(paths.tunnelStderrPath, { flags: "a", mode: 0o600 });
    child = spawn(executable, [
      "run", "--profile-file", installation.tunnelConfigPath,
      "--control-plane.api-key", "env:CONTROL_PLANE_API_KEY",
      "--pid.file", paths.tunnelPidPath,
      "--health.listen-addr", "127.0.0.1:0",
      "--health.url-file", paths.healthUrlPath,
      "--log.file", paths.tunnelLogPath,
    ], {
      cwd: installation.engineRoot,
      env: { ...process.env, CONTROL_PLANE_API_KEY: key },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    atomicWrite(paths.statusPath, `${JSON.stringify({
      version: 1, state: "starting", profileId, supervisorPid: process.pid,
      tunnelPid: child.pid ?? null, failureCount: failureTimes.length, updatedAt: new Date().toISOString(),
    })}\n`);
    let exited = false;
    let exitCode = null;
    child.once("exit", (code) => { exited = true; exitCode = code; });

    while (!exited && !stopping && existsSync(paths.desiredPath) && !existsSync(paths.stopPath)) {
      let ready = false;
      try {
        const baseUrl = readFileSync(paths.healthUrlPath, "utf8").trim();
        const response = await fetch(`${baseUrl}/readyz`, { signal: AbortSignal.timeout(2_000) });
        ready = response.ok;
      } catch { /* tunnel is still starting */ }
      if (ready) {
        atomicWrite(paths.statusPath, `${JSON.stringify({
          version: 1, state: "ready", profileId, supervisorPid: process.pid,
          tunnelPid: child.pid ?? null, failureCount: failureTimes.length, updatedAt: new Date().toISOString(),
        })}\n`);
      }
      await delay(500);
    }
    if (!exited) {
      try { child.kill("SIGTERM"); } catch { /* already stopped */ }
      const deadline = Date.now() + 5_000;
      while (!exited && Date.now() < deadline) await delay(100);
      if (!exited) try { child.kill("SIGKILL"); } catch { /* already stopped */ }
    }
    stdout.end();
    stderr.end();
    if (stopping || !existsSync(paths.desiredPath) || existsSync(paths.stopPath)) break;

    const now = Date.now();
    failureTimes.push(now);
    while (failureTimes.length && failureTimes[0] < now - 300_000) failureTimes.shift();
    if (failureTimes.length > 3) {
      atomicWrite(paths.statusPath, `${JSON.stringify({
        version: 1, state: "exhausted", profileId, supervisorPid: process.pid,
        tunnelPid: null, failureCount: failureTimes.length, lastExitCode: exitCode,
        updatedAt: new Date().toISOString(),
      })}\n`);
      break;
    }
    await delay(2 ** (failureTimes.length - 1) * 1_000);
  }
} finally {
  rmSync(paths.supervisorPath, { force: true });
  rmSync(paths.tunnelPidPath, { force: true });
  rmSync(paths.healthUrlPath, { force: true });
  if (!existsSync(paths.statusPath) || stopping || existsSync(paths.stopPath) || !existsSync(paths.desiredPath)) {
    atomicWrite(paths.statusPath, `${JSON.stringify({
      version: 1, state: "stopped", profileId, supervisorPid: null,
      tunnelPid: null, failureCount: failureTimes.length, updatedAt: new Date().toISOString(),
    })}\n`);
  }
}
