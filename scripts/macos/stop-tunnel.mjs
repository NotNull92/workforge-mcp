import { rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  atomicWrite,
  delay,
  loadInstallation,
  processMatches,
  readPidRecord,
  runtimePaths,
} from "./tunnel-common.mjs";

const profileIndex = process.argv.indexOf("--profile");
const profileId = profileIndex >= 0 ? process.argv[profileIndex + 1] : "workstation";
const installation = loadInstallation(profileId);
const paths = runtimePaths(installation);
rmSync(paths.desiredPath, { force: true });
atomicWrite(paths.stopPath, `${profileId}\n`);
const supervisorScript = resolve(installation.engineRoot, "scripts", "macos", "tunnel-supervisor.mjs");
const record = readPidRecord(paths.supervisorPath);
if (processMatches(record, [supervisorScript, "--profile", profileId, "--instance", record?.instance ?? "<missing>"])) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && processMatches(record, [supervisorScript, record.instance])) await delay(250);
  if (processMatches(record, [supervisorScript, record.instance])) {
    try { process.kill(-record.pid, "SIGTERM"); } catch { /* already stopped */ }
    const forcedDeadline = Date.now() + 5_000;
    while (Date.now() < forcedDeadline && processMatches(record, [supervisorScript, record.instance])) await delay(100);
    if (processMatches(record, [supervisorScript, record.instance])) {
      try { process.kill(-record.pid, "SIGKILL"); } catch { /* already stopped */ }
    }
  }
}
rmSync(paths.stopPath, { force: true });
console.log(`WorkForge tunnel stopped: ${profileId}`);
