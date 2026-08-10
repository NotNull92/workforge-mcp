#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

let profileId = "workstation";
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--profile" || argument === "-ProfileId") profileId = process.argv[++index] ?? "";
  else throw new Error(`Unknown WorkForge launcher argument: ${argument}`);
}
if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/u.test(profileId)) throw new Error("ProfileId is invalid.");
const configuredSupportRoot = process.env.WORKFORGE_MACOS_STATE_ROOT;
if (configuredSupportRoot && !isAbsolute(configuredSupportRoot)) throw new Error("WORKFORGE_MACOS_STATE_ROOT must be absolute.");
const statePath = resolve(configuredSupportRoot ?? resolve(homedir(), "Library", "Application Support", "WorkForge"), "current.json");
const state = JSON.parse(readFileSync(statePath, "utf8"));
const environment = { ...process.env, WORKFORGE_MCP_PROFILE_REGISTRY: state.registryPath };
if (state.ripgrepPath) environment.WORKFORGE_RIPGREP_PATH = state.ripgrepPath;
for (const key of Object.keys(environment)) if (key.toLowerCase() === "control_plane_api_key") delete environment[key];
const child = spawn(state.nodePath, [resolve(state.engineRoot, "dist", "stdio.js"), "--profile", profileId], {
  env: environment,
  stdio: "inherit",
  shell: false,
});
child.once("error", (error) => { throw error; });
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
