import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSupportedNodeVersion } from "./node-runtime.mjs";
import { registerProfile, validateDisplayName } from "./setup-support.mjs";

if (process.platform !== "darwin") throw new Error("This setup entrypoint supports macOS only.");

const engineRoot = realpathSync(resolve(fileURLToPath(new URL(".", import.meta.url)), "..", ".."));
assertSupportedNodeVersion(process.versions.node, engineRoot, process.execPath);
const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || !value) throw new Error("Usage: setup.mjs --project <path> [--profile <id>] [--display-name <name>]");
  argumentsMap.set(key, value);
}
const projectArgument = argumentsMap.get("--project");
if (!projectArgument) throw new Error("--project is required.");
const profileId = argumentsMap.get("--profile") ?? "workstation";
if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u.test(profileId)) throw new Error("Invalid profile id.");
const projectRoot = realpathSync(resolve(projectArgument));
const displayName = validateDisplayName(argumentsMap.get("--display-name") ?? basename(projectRoot));
const configRoot = resolve(projectRoot, "tools", "workforge-mcp");
const markerPath = resolve(configRoot, "project.identity");
const profilePath = resolve(configRoot, "profile.json");
mkdirSync(configRoot, { recursive: true, mode: 0o700 });

let identity;
try {
  identity = readFileSync(markerPath, "utf8").trim();
} catch {
  identity = `workforge-project-${randomUUID()}`;
  writeFileSync(markerPath, `${identity}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}
if (!/^workforge-project-[0-9a-f-]{36}$/u.test(identity)) throw new Error("Existing project.identity is invalid.");

let profileBytes;
try {
  profileBytes = readFileSync(profilePath);
  const existingProfile = JSON.parse(profileBytes.toString("utf8"));
  if (existingProfile.id !== profileId) throw new Error(`Existing profile id is ${existingProfile.id}, not ${profileId}.`);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") throw error;
  const profile = {
    id: profileId,
    displayName,
    appName: displayName,
    serverName: `workforge-${profileId}`,
    defaultWorkingDirectoryRelative: ".",
    bootstrapFiles: [],
    identityMarkers: [{ relativePath: "tools/workforge-mcp/project.identity", expectedLiteral: identity }],
  };
  profileBytes = Buffer.from(`${JSON.stringify(profile, null, 2)}\n`, "utf8");
  writeFileSync(profilePath, profileBytes, { mode: 0o600, flag: "wx" });
}

const configuredRuntimeRoot = process.env.WORKFORGE_RUNTIME_ROOT;
if (configuredRuntimeRoot && !isAbsolute(configuredRuntimeRoot)) throw new Error("WORKFORGE_RUNTIME_ROOT must be absolute.");
const runtimeRoot = resolve(configuredRuntimeRoot ?? resolve(engineRoot, "runtime"));
const registryPath = resolve(runtimeRoot, "profile_registry.json");
mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
const entry = {
  id: profileId,
  profilePath,
  profileSha256: createHash("sha256").update(profileBytes).digest("hex"),
};
registerProfile(registryPath, entry);

const configuredSupportRoot = process.env.WORKFORGE_MACOS_STATE_ROOT;
if (configuredSupportRoot && !isAbsolute(configuredSupportRoot)) throw new Error("WORKFORGE_MACOS_STATE_ROOT must be absolute.");
const supportRoot = resolve(configuredSupportRoot ?? resolve(homedir(), "Library", "Application Support", "WorkForge"));
mkdirSync(supportRoot, { recursive: true, mode: 0o700 });
const ripgrepPath = execFileSync("/usr/bin/which", ["rg"], { encoding: "utf8" }).trim();
const state = { version: 1, engineRoot, registryPath, nodePath: process.execPath, ripgrepPath };
writeFileSync(resolve(supportRoot, "current.json"), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

console.log(`WorkForge macOS profile registered: ${profileId}`);
console.log(`Project: ${projectRoot}`);
console.log(`Registry: ${registryPath}`);
