import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertSupportedNodeRuntime } from "./node-runtime.mjs";

if (process.platform !== "darwin") throw new Error("This doctor entrypoint supports macOS only.");
const configuredSupportRoot = process.env.WORKFORGE_MACOS_STATE_ROOT;
if (configuredSupportRoot && !isAbsolute(configuredSupportRoot)) throw new Error("WORKFORGE_MACOS_STATE_ROOT must be absolute.");
const statePath = resolve(configuredSupportRoot ?? resolve(homedir(), "Library", "Application Support", "WorkForge"), "current.json");
const state = JSON.parse(readFileSync(statePath, "utf8"));
for (const [label, path] of Object.entries({ engineRoot: state.engineRoot, registryPath: state.registryPath, nodePath: state.nodePath, ripgrepPath: state.ripgrepPath })) {
  if (typeof path !== "string" || (label === "engineRoot" ? !statSync(path).isDirectory() : !statSync(path).isFile())) throw new Error(`${label} is missing or invalid.`);
}
const engineRoot = realpathSync(state.engineRoot);
const nodePath = realpathSync(state.nodePath);
const nodeVersion = assertSupportedNodeRuntime(nodePath, engineRoot);
execFileSync(nodePath, [
  "--input-type=module",
  "-e",
  `const { listKnownProfileIds } = await import(${JSON.stringify(pathToFileURL(resolve(engineRoot, "dist", "profile.js")).href)}); if ((await listKnownProfileIds()).length < 1) process.exit(2);`,
], {
  env: { ...process.env, WORKFORGE_MCP_PROFILE_REGISTRY: state.registryPath },
  timeout: 5_000,
  stdio: "ignore",
});
console.log(`WORKFORGE_MACOS_DOCTOR_OK (${process.arch}, Node.js ${nodeVersion})`);
