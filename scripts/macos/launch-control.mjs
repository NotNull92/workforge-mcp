import { closeSync, mkdirSync, openSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { delay, loadInstallation, scrubControlPlaneEnvironment } from "./tunnel-common.mjs";

if (process.platform !== "darwin") throw new Error("This Control launcher supports macOS only.");

const profileIndex = process.argv.indexOf("--profile");
const profileId = profileIndex >= 0 ? process.argv[profileIndex + 1] : "workstation";
const noBrowser = process.argv.includes("--no-browser");
const installation = loadInstallation(profileId);
const toolRoot = realpathSync(resolve(fileURLToPath(new URL(".", import.meta.url)), "..", ".."));
if (installation.engineRoot !== toolRoot) {
  throw new Error("This WorkForge release is not the active macOS engine. Run npm run setup:macos from this release first.");
}

const serverPath = resolve(toolRoot, "scripts", "control-server.mjs");
const controlRoot = resolve(installation.root, "control");
const logPath = resolve(controlRoot, `${profileId}.log`);
mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
const logHandle = openSync(logPath, "a", 0o600);
const argumentsList = [serverPath, "--profile", profileId];
if (noBrowser) argumentsList.push("--no-browser");

const child = spawn(installation.nodePath, argumentsList, {
  cwd: toolRoot,
  detached: true,
  env: scrubControlPlaneEnvironment(),
  shell: false,
  stdio: ["ignore", logHandle, logHandle],
});
closeSync(logHandle);
let spawnError;
child.on("error", (error) => { spawnError = error; });

await delay(700);
if (spawnError) throw new Error(`Could not launch WorkForge Control: ${spawnError.message}`);
if (child.exitCode !== null) {
  const detail = readFileSync(logPath, "utf8").slice(-12_000).trim();
  throw new Error(detail || `WorkForge Control exited with code ${child.exitCode}.`);
}
child.unref();
console.log("WorkForge Control dashboard launched.");
console.log(`Log: ${logPath}`);
