import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { deleteStoredControlPlaneKey, loadInstallation, processMatches, readJson, readPidRecord, runtimePaths, scrubControlPlaneEnvironment, stateRoot } from "./tunnel-common.mjs";
import { readRegistry, unregisterProfile } from "./setup-support.mjs";

if (process.platform !== "darwin") throw new Error("This uninstall entrypoint supports macOS only.");
const profileIndex = process.argv.indexOf("--profile");
const profileId = profileIndex >= 0 ? process.argv[profileIndex + 1] : "workstation";
const whatIf = process.argv.includes("--what-if");
if (!profileId || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u.test(profileId)) throw new Error("Invalid profile id.");
const state = readJson(resolve(stateRoot(), "current.json"), "WorkForge macOS state");
if (typeof state.registryPath !== "string" || !isAbsolute(state.registryPath)) throw new Error("WorkForge macOS registry path is invalid.");
const registry = readRegistry(state.registryPath);
if (!registry.profiles.some(candidate => candidate.id === profileId)) throw new Error(`WorkForge macOS profile is not registered: ${profileId}`);
const installation = loadInstallation(profileId);
if (whatIf) {
  console.log(`Remove WorkForge profile registration: ${profileId}`);
  console.log("Remove global WorkForge state if this is the final registered profile.");
  console.log(`Remove the stored Runtime API Key and tunnel runtime state for: ${profileId}`);
  console.log("Preserve the workspace, Git history, and project-local tools/workforge-mcp files.");
  process.exit(0);
}
const paths = runtimePaths(installation);
const supervisorScript = resolve(installation.engineRoot, "scripts", "macos", "tunnel-supervisor.mjs");
const supervisor = readPidRecord(paths.supervisorPath);
const stopped = spawnSync(process.execPath, [resolve(installation.engineRoot, "scripts", "macos", "stop-tunnel.mjs"), "--profile", profileId], { stdio: "inherit", env: scrubControlPlaneEnvironment() });
if (stopped.status !== 0) throw new Error("WorkForge tunnel could not be stopped; uninstall was not applied.");
if (processMatches(supervisor, [supervisorScript, "--profile", profileId, "--instance", supervisor?.instance ?? "<missing>"])) throw new Error("WorkForge tunnel supervisor is still running; uninstall was not applied.");
deleteStoredControlPlaneKey(profileId);
rmSync(installation.runtimeRoot, { recursive: true, force: true });
unregisterProfile(installation.registryPath, profileId, () => rmSync(resolve(installation.root, "current.json"), { force: true }));
console.log(`WorkForge macOS profile unregistered: ${profileId}`);
console.log("Project-local tools/workforge-mcp files were preserved.");
