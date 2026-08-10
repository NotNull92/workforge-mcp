import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

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
  if (!entry || !isAbsolute(entry.profilePath) || !/^[a-f0-9]{64}$/u.test(entry.profileSha256 ?? "")) {
    throw new Error(`Unknown or invalid WorkForge profile: ${profileId}`);
  }
  const profileDocument = readJson(entry.profilePath, `WorkForge profile ${profileId}`);
  if (profileDocument.id !== profileId) throw new Error(`WorkForge profile identity mismatch: ${profileId}`);
  const profileBytes = readFileSync(entry.profilePath);
  const profileSha256 = createHash("sha256").update(profileBytes).digest("hex");
  if (profileSha256 !== entry.profileSha256) throw new Error(`WorkForge profile hash mismatch: ${profileId}`);
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

export function resolveTunnelRuntimeDescriptor(installation = loadInstallation(), architecture = process.arch) {
  if (!new Set(["arm64", "x64"]).has(architecture)) throw new Error(`Unsupported macOS architecture: ${architecture}`);
  const lock = readJson(resolve(installation.engineRoot, "runtime-lock.json"), "WorkForge runtime lock");
  if (lock.schemaVersion !== 1 || lock.product !== "WorkForge") throw new Error("WorkForge runtime lock is invalid.");
  const runtime = lock.runtimes?.tunnelClientMacos;
  const archive = runtime?.archives?.[architecture];
  if (!runtime || !/^\d+\.\d+\.\d+$/u.test(runtime.version ?? "") || !archive) {
    throw new Error(`WorkForge runtime lock does not support macOS ${architecture}.`);
  }
  const platformArch = architecture === "x64" ? "amd64" : "arm64";
  const expectedArchiveName = `tunnel-client-v${runtime.version}-darwin-${platformArch}.zip`;
  const expectedUrl = `https://github.com/openai/tunnel-client/releases/download/v${runtime.version}/${expectedArchiveName}`;
  if (
    archive.archiveName !== expectedArchiveName
    || archive.url !== expectedUrl
    || !/^[a-f0-9]{64}$/u.test(archive.sha256 ?? "")
  ) {
    throw new Error(`WorkForge macOS tunnel runtime lock is invalid for ${architecture}.`);
  }
  return {
    version: runtime.version,
    archiveName: archive.archiveName,
    url: archive.url,
    sha256: archive.sha256,
    license: runtime.license,
    licenseUrl: runtime.licenseUrl,
    architecture,
  };
}

export function tunnelClientPath(installation = loadInstallation()) {
  const override = process.env.WORKFORGE_TUNNEL_CLIENT_PATH;
  if (override && !isAbsolute(override)) throw new Error("WORKFORGE_TUNNEL_CLIENT_PATH must be absolute.");
  if (override) return resolve(override);
  const runtime = resolveTunnelRuntimeDescriptor(installation);
  return resolve(installation.root, "runtimes", "tunnel-client", `v${runtime.version}`, "tunnel-client");
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

export function validateControlPlaneKey(key) {
  if (!key || key.length > 4096 || !/^[\x21-\x7e]+$/u.test(key)) {
    throw new Error("Runtime API Key is invalid.");
  }
  return key;
}

export function scrubControlPlaneEnvironment(environment = process.env) {
  const scrubbed = { ...environment };
  delete scrubbed.CONTROL_PLANE_API_KEY;
  return scrubbed;
}

export function hasStoredControlPlaneKey(profileId) {
  assertProfileId(profileId);
  const result = spawnSync("/usr/bin/security", [
    "find-generic-password", "-a", profileId, "-s", KEYCHAIN_SERVICE,
  ], { env: scrubControlPlaneEnvironment(), stdio: "ignore" });
  return result.status === 0;
}

export function readStoredControlPlaneKey(profileId) {
  assertProfileId(profileId);
  const key = execFileSync("/usr/bin/security", [
    "find-generic-password", "-a", profileId, "-s", KEYCHAIN_SERVICE, "-w",
  ], {
    encoding: "utf8",
    env: scrubControlPlaneEnvironment(),
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return validateControlPlaneKey(key);
}

export function storeControlPlaneKey(profileId, key) {
  assertProfileId(profileId);
  const value = validateControlPlaneKey(key);
  const stored = spawnSync("/usr/bin/security", [
    "add-generic-password",
    "-a", profileId,
    "-s", KEYCHAIN_SERVICE,
    "-l", `WorkForge ${profileId} Runtime API Key`,
    "-U",
    "-w",
  ], {
    input: `${value}\n`,
    encoding: "utf8",
    env: scrubControlPlaneEnvironment(),
    stdio: ["pipe", "ignore", "ignore"],
  });
  if (stored.status !== 0) throw new Error("Runtime API Key was not stored in Keychain.");
}

export function deleteStoredControlPlaneKey(profileId) {
  assertProfileId(profileId);
  const deleted = spawnSync("/usr/bin/security", [
    "delete-generic-password", "-a", profileId, "-s", KEYCHAIN_SERVICE,
  ], { env: scrubControlPlaneEnvironment(), stdio: "ignore" });
  return deleted.status === 0;
}

export function tunnelDoctor(installation, key, stdio = "ignore") {
  const result = spawnSync(tunnelClientPath(installation), [
    "doctor", "--profile-file", installation.tunnelConfigPath,
  ], {
    env: { ...scrubControlPlaneEnvironment(), CONTROL_PLANE_API_KEY: validateControlPlaneKey(key) },
    stdio,
  });
  return result.status === 0;
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
