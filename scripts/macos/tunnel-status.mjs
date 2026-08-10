import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadInstallation,
  processMatches,
  readPidRecord,
  readStoredControlPlaneKey,
  runtimePaths,
  tunnelDoctor,
} from "./tunnel-common.mjs";

const profileIndex = process.argv.indexOf("--profile");
const profileId = profileIndex >= 0 ? process.argv[profileIndex + 1] : "workstation";
const installation = loadInstallation(profileId);
const paths = runtimePaths(installation);
const record = readPidRecord(paths.supervisorPath);
const supervisorScript = resolve(installation.engineRoot, "scripts", "macos", "tunnel-supervisor.mjs");
const running = processMatches(record, [supervisorScript, "--profile", profileId, "--instance", record?.instance ?? "<missing>"]);
let healthUrl = null;
let healthy = false;
let localReady = false;
if (running && existsSync(paths.healthUrlPath)) {
  try {
    healthUrl = readFileSync(paths.healthUrlPath, "utf8").trim();
    const [health, readiness] = await Promise.all([
      fetch(`${healthUrl}/healthz`, { signal: AbortSignal.timeout(2_000) }),
      fetch(`${healthUrl}/readyz`, { signal: AbortSignal.timeout(2_000) }),
    ]);
    healthy = health.ok;
    localReady = readiness.ok;
  } catch { /* running but not ready */ }
}
let controlPlaneHealthy = false;
if (running && localReady) {
  try { controlPlaneHealthy = tunnelDoctor(installation, readStoredControlPlaneKey(profileId)); } catch { /* key unavailable */ }
}
const ready = localReady && controlPlaneHealthy;
let state = null;
try { state = JSON.parse(readFileSync(paths.statusPath, "utf8")); } catch { /* no state yet */ }
console.log(JSON.stringify({ profileId, running, healthy, localReady, controlPlaneHealthy, ready, healthUrl, state }, null, 2));
