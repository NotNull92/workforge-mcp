import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  KEYCHAIN_SERVICE,
  loadInstallation,
  readControlPlaneKey,
  tunnelClientPath,
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
const installation = loadInstallation(profileId);
const executable = tunnelClientPath(installation);
execFileSync(executable, ["--version"], { stdio: "ignore" });

if (!process.env.CONTROL_PLANE_API_KEY) {
  const existing = spawnSync("/usr/bin/security", [
    "find-generic-password", "-a", profileId, "-s", KEYCHAIN_SERVICE,
  ], { stdio: "ignore" });
  if (existing.status !== 0 || process.argv.includes("--replace-key")) {
    console.log("Enter the OpenAI Runtime API Key at the macOS Keychain prompt.");
    const stored = spawnSync("/usr/bin/security", [
      "add-generic-password", "-a", profileId, "-s", KEYCHAIN_SERVICE,
      "-l", `WorkForge ${profileId} Runtime API Key`, "-U", "-w",
    ], { stdio: "inherit" });
    if (stored.status !== 0) throw new Error("Runtime API Key was not stored in Keychain.");
  }
}

const key = readControlPlaneKey(profileId);
const command = `"${installation.nodePath.replaceAll('"', '\\"')}" "${resolve(installation.engineRoot, "dist", "stdio.js").replaceAll('"', '\\"')}" --profile ${profileId}`;
const buildRoot = mkdtempSync(resolve(tmpdir(), "workforge-tunnel-profile-"));
try {
  execFileSync(executable, [
    "init", "--sample", "sample_mcp_stdio_local", "--profile", profileId,
    "--profile-dir", buildRoot, "--tunnel-id", tunnelId,
    "--mcp-command", command, "--health-listen-addr", "127.0.0.1:0", "--force",
  ], { stdio: "inherit" });
  const generated = readdirSync(buildRoot).filter((name) => name.endsWith(".yaml"));
  if (generated.length !== 1) throw new Error("Expected exactly one generated tunnel profile.");
  mkdirSync(resolve(installation.projectRoot, "tools", "workforge-mcp"), { recursive: true, mode: 0o700 });
  const temporaryConfig = `${installation.tunnelConfigPath}.${process.pid}.tmp`;
  renameSync(resolve(buildRoot, generated[0]), temporaryConfig);
  renameSync(temporaryConfig, installation.tunnelConfigPath);
  execFileSync(executable, ["doctor", "--profile-file", installation.tunnelConfigPath, "--explain"], {
    env: { ...process.env, CONTROL_PLANE_API_KEY: key },
    stdio: "inherit",
  });
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}
console.log(`Tunnel configured for ${profileId}. It remains stopped until explicitly started.`);
