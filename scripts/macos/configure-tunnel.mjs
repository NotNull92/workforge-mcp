import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  atomicWrite,
  deleteStoredControlPlaneKey,
  hasStoredControlPlaneKey,
  loadInstallation,
  readStoredControlPlaneKey,
  scrubControlPlaneEnvironment,
  storeControlPlaneKey,
  tunnelClientPath,
  validateControlPlaneKey,
} from "./tunnel-common.mjs";

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const profileId = valueAfter("--profile") ?? "workstation";
let tunnelId = valueAfter("--tunnel-id");
if (!tunnelId) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  tunnelId = (await prompt.question("OpenAI tunnel_id: ")).trim();
  prompt.close();
}
if (!/^tunnel_[a-f0-9]{32}$/u.test(tunnelId)) throw new Error("tunnel_id is invalid.");
let environmentReplacementKey = process.env.CONTROL_PLANE_API_KEY;
delete process.env.CONTROL_PLANE_API_KEY;
const installation = loadInstallation(profileId);
const executable = tunnelClientPath(installation);
execFileSync(executable, ["--version"], { env: scrubControlPlaneEnvironment(), stdio: "ignore" });

const hadStoredKey = hasStoredControlPlaneKey(profileId);
const previousKey = hadStoredKey ? readStoredControlPlaneKey(profileId) : null;
const previousConfig = existsSync(installation.tunnelConfigPath) ? readFileSync(installation.tunnelConfigPath) : null;
let keyChanged = false;
let configChanged = false;
let buildRoot = null;
try {
  if (!hadStoredKey || process.argv.includes("--replace-key")) {
    let replacementKey = environmentReplacementKey;
    environmentReplacementKey = undefined;
    if (!replacementKey) {
      console.log("Enter the OpenAI Runtime API Key in the hidden macOS dialog.");
      const prompted = spawnSync("/usr/bin/osascript", [
        "-e",
        'text returned of (display dialog "OpenAI Runtime API Key" default answer "" with hidden answer buttons {"Cancel", "Save"} default button "Save")',
      ], {
        encoding: "utf8",
        env: scrubControlPlaneEnvironment(),
        stdio: ["ignore", "pipe", "inherit"],
      });
      if (prompted.status !== 0) throw new Error("Runtime API Key entry was cancelled.");
      replacementKey = prompted.stdout.trim();
    }
    keyChanged = true;
    storeControlPlaneKey(profileId, validateControlPlaneKey(replacementKey));
    replacementKey = undefined;
  }

  const key = readStoredControlPlaneKey(profileId);
  const command = `"${installation.nodePath.replaceAll('"', '\\"')}" "${resolve(installation.engineRoot, "dist", "stdio.js").replaceAll('"', '\\"')}" --profile ${profileId}`;
  buildRoot = mkdtempSync(resolve(tmpdir(), "workforge-tunnel-profile-"));
  execFileSync(executable, [
    "init", "--sample", "sample_mcp_stdio_local", "--profile", profileId,
    "--profile-dir", buildRoot, "--tunnel-id", tunnelId,
    "--mcp-command", command, "--health-listen-addr", "127.0.0.1:0", "--force",
  ], { env: scrubControlPlaneEnvironment(), stdio: "inherit" });
  const generated = readdirSync(buildRoot).filter((name) => name.endsWith(".yaml"));
  if (generated.length !== 1) throw new Error("Expected exactly one generated tunnel profile.");
  mkdirSync(dirname(installation.tunnelConfigPath), { recursive: true, mode: 0o700 });
  atomicWrite(installation.tunnelConfigPath, readFileSync(resolve(buildRoot, generated[0])), 0o600);
  configChanged = true;
  execFileSync(executable, ["doctor", "--profile-file", installation.tunnelConfigPath, "--explain"], {
    env: { ...scrubControlPlaneEnvironment(), CONTROL_PLANE_API_KEY: key },
    stdio: "inherit",
  });
} catch (error) {
  if (configChanged) {
    if (previousConfig) atomicWrite(installation.tunnelConfigPath, previousConfig, 0o600);
    else rmSync(installation.tunnelConfigPath, { force: true });
  }
  if (keyChanged) {
    if (previousKey) storeControlPlaneKey(profileId, previousKey);
    else deleteStoredControlPlaneKey(profileId);
  }
  throw error;
} finally {
  environmentReplacementKey = undefined;
  if (buildRoot) rmSync(buildRoot, { recursive: true, force: true });
}
console.log(`Tunnel configured for ${profileId}. It remains stopped until explicitly started.`);
