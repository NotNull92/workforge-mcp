import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

export const TUNNEL_VERSION = "0.0.11";
export const TUNNEL_ARCHIVE_SHA256 = "3685443b057614ff932d2d477dab94be2082e60bcf4e8b4e378bebc89121b714";
export const TUNNEL_ARCHIVE_URL = "https://github.com/openai/tunnel-client/releases/download/v0.0.11/tunnel-client-v0.0.11-darwin-arm64.zip";
export const KEYCHAIN_SERVICE = "io.workforge.control-plane";

export function assertProfileId(profileId) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u.test(profileId)) throw new Error("Invalid profile id.");
  return profileId;
}

export function stateRoot() {
  const configured = process.env.WORKFORGE_MACOS_STATE_ROOT;
  if (configured && !isAbsolute(configured)) throw new Error("WORKFORGE_MACOS_STATE_ROOT must be absolute.");
  return resolve(configured ?? resolve(homedir(), "Library", "Application Support", "WorkForge"));
}

function readJson(path, label) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 256 * 1024) {
    throw new Error(`${label} is missing or unsafe.`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadInstallation(profileId = "workstation") {
  assertProfileId(profileId);
  const root = stateRoot();
  const state = readJson(resolve(root, "current.json"), "WorkForge macOS state");
  const engineRoot = realpathSync(state.engineRoot);
  const registryPath = realpathSync(state.registryPath);
  const nodePath = realpathSync(state.nodePath);
  const registry = readJson(registryPath, "WorkForge profile registry");
  const entry = registry.profiles?.find((candidate) => candidate.id === profileId);
  if (!entry || !isAbsolute(entry.profilePath)) throw new Error(`Unknown WorkForge profile: ${profileId}`);
  const profilePath = realpathSync(entry.profilePath);
  return {
    root,
    engineRoot,
    registryPath,
    nodePath,
    profileId,
    profilePath,
    projectRoot: resolve(dirname(profilePath), "..", ".."),
    tunnelConfigPath: resolve(dirname(profilePath), "tunnel.local.yaml"),
    runtimeRoot: resolve(root, "tunnel", profileId),
  };
}

export function tunnelClientPath(installation = loadInstallation()) {
  const override = process.env.WORKFORGE_TUNNEL_CLIENT_PATH;
  if (override && !isAbsolute(override)) throw new Error("WORKFORGE_TUNNEL_CLIENT_PATH must be absolute.");
  return resolve(override ?? resolve(installation.root, "runtimes", "tunnel-client", `v${TUNNEL_VERSION}`, "tunnel-client"));
}

export function runtimePaths(installation) {
  return {
    desiredPath: resolve(installation.runtimeRoot, "desired-running"),
    stopPath: resolve(installation.runtimeRoot, "stop-request"),
    supervisorPath: resolve(installation.runtimeRoot, "supervisor.json"),
    tunnelPidPath: resolve(installation.runtimeRoot, "tunnel.pid"),
    healthUrlPath: resolve(installation.runtimeRoot, "health.url"),
    statusPath: resolve(installation.runtimeRoot, "status.json"),
    supervisorLogPath: resolve(installation.runtimeRoot, "supervisor.log"),
    tunnelLogPath: resolve(installation.runtimeRoot, "tunnel.log"),
    tunnelStdoutPath: resolve(installation.runtimeRoot, "tunnel.stdout.log"),
    tunnelStderrPath: resolve(installation.runtimeRoot, "tunnel.stderr.log"),
  };
}

export function atomicWrite(path, value, mode = 0o600) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = openSync(temporaryPath, "wx", mode);
  try { writeFileSync(handle, value); } finally { closeSync(handle); }
  renameSync(temporaryPath, path);
}

export function readControlPlaneKey(profileId) {
  const environmentKey = process.env.CONTROL_PLANE_API_KEY;
  if (environmentKey) return environmentKey;
  const key = execFileSync("/usr/bin/security", [
    "find-generic-password", "-a", profileId, "-s", KEYCHAIN_SERVICE, "-w",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (!key || key.length > 4096 || !/^[\x21-\x7e]+$/u.test(key)) throw new Error("Keychain Runtime API Key is invalid.");
  return key;
}

export function readPidRecord(path) {
  try { return readJson(path, "WorkForge process record"); } catch { return undefined; }
}

export function processMatches(record, requiredFragments) {
  if (!record || !Number.isInteger(record.pid) || record.pid <= 0) return false;
  try { process.kill(record.pid, 0); } catch { return false; }
  try {
    const command = execFileSync("/bin/ps", ["-p", String(record.pid), "-o", "command="], { encoding: "utf8" });
    return requiredFragments.every((fragment) => command.includes(fragment));
  } catch { return false; }
}

export const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
