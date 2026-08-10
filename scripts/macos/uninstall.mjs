import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

if (process.platform !== "darwin") throw new Error("This uninstall entrypoint supports macOS only.");
const profileIndex = process.argv.indexOf("--profile");
const profileId = profileIndex >= 0 ? process.argv[profileIndex + 1] : "workstation";
if (!profileId || !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u.test(profileId)) throw new Error("Invalid profile id.");
const configuredSupportRoot = process.env.WORKFORGE_MACOS_STATE_ROOT;
if (configuredSupportRoot && !isAbsolute(configuredSupportRoot)) throw new Error("WORKFORGE_MACOS_STATE_ROOT must be absolute.");
const supportState = resolve(configuredSupportRoot ?? resolve(homedir(), "Library", "Application Support", "WorkForge"), "current.json");
const state = JSON.parse(readFileSync(supportState, "utf8"));
const registry = JSON.parse(readFileSync(state.registryPath, "utf8"));
registry.profiles = registry.profiles.filter((candidate) => candidate.id !== profileId);
if (registry.profiles.length === 0) {
  rmSync(state.registryPath, { force: true });
  rmSync(supportState, { force: true });
} else {
  writeFileSync(state.registryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
}
console.log(`WorkForge macOS profile unregistered: ${profileId}`);
console.log("Project-local tools/workforge-mcp files were preserved.");
