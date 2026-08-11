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
// A supervisor killed with SIGKILL leaves its last state behind, so trust the live process check
// over status.json unless the persisted state is the terminal "exhausted" diagnosis.
const processState = running ? (state?.state ?? "running") : (state?.state === "exhausted" ? "exhausted" : "stopped");
console.log(JSON.stringify({
  profileId,
  running,
  healthy,
  health: healthy,
  localReady,
  controlPlaneHealthy,
  ready,
  healthUrl,
  state,
  processState,
  desiredRunning: existsSync(paths.desiredPath),
  stopRequested: existsSync(paths.stopPath),
  supervised: running,
  supervisorState: processState,
  recoveryState: processState === "exhausted" ? "exhausted" : null,
  recoveryFailureCount: state?.failureCount ?? 0,
  pid: state?.tunnelPid ?? null,
  supervisorPid: record?.pid ?? state?.supervisorPid ?? null,
}, null, 2));
