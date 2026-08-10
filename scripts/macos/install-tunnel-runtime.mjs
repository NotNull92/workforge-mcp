import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  loadInstallation,
  resolveTunnelRuntimeDescriptor,
  tunnelClientPath,
} from "./tunnel-common.mjs";

if (process.platform !== "darwin") throw new Error("This tunnel runtime installer supports macOS only.");
const profileIndex = process.argv.indexOf("--profile");
const profileId = profileIndex >= 0 ? process.argv[profileIndex + 1] : "workstation";
const installation = loadInstallation(profileId);
const runtime = resolveTunnelRuntimeDescriptor(installation);
const targetBinary = tunnelClientPath(installation);
const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const response = await fetch(runtime.url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`Tunnel runtime download failed: HTTP ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== runtime.sha256) throw new Error("Tunnel runtime SHA-256 mismatch.");

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "workforge-tunnel-runtime-"));
let stagingRoot = null;
try {
  const archivePath = resolve(temporaryRoot, runtime.archiveName);
  const extractedPath = resolve(temporaryRoot, "extracted");
  writeFileSync(archivePath, archive, { mode: 0o600 });
  mkdirSync(extractedPath, { mode: 0o700 });
  execFileSync("/usr/bin/ditto", ["-x", "-k", archivePath, extractedPath]);
  const stagedBinary = resolve(extractedPath, "tunnel-client");
  const stagedCloudflared = resolve(extractedPath, "cloudflared");
  chmodSync(stagedBinary, 0o755);
  chmodSync(stagedCloudflared, 0o755);
  execFileSync(stagedBinary, ["--version"], { stdio: "ignore" });
  const targetRoot = dirname(targetBinary);
  const runtimeManifest = {
    version: runtime.version,
    architecture: runtime.architecture,
    archiveName: runtime.archiveName,
    archiveSha256: digest,
    tunnelClientSha256: sha256File(stagedBinary),
    cloudflaredSha256: sha256File(stagedCloudflared),
    source: runtime.url,
  };
  if (existsSync(targetBinary)) {
    const installedCloudflared = resolve(targetRoot, "cloudflared");
    if (
      sha256File(targetBinary) !== runtimeManifest.tunnelClientSha256
      || sha256File(installedCloudflared) !== runtimeManifest.cloudflaredSha256
    ) {
      throw new Error("Installed tunnel runtime differs from the verified OpenAI release asset.");
    }
    writeFileSync(resolve(targetRoot, "workforge-runtime.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`, { mode: 0o600 });
    console.log(`Tunnel runtime already installed and verified: ${targetBinary}`);
    process.exit(0);
  }
  mkdirSync(dirname(targetRoot), { recursive: true, mode: 0o700 });
  stagingRoot = `${targetRoot}.${randomUUID()}.tmp`;
  cpSync(extractedPath, stagingRoot, { recursive: true, errorOnExist: true, force: false });
  chmodSync(resolve(stagingRoot, "tunnel-client"), 0o755);
  chmodSync(resolve(stagingRoot, "cloudflared"), 0o755);
  renameSync(stagingRoot, targetRoot);
  stagingRoot = null;
  writeFileSync(resolve(targetRoot, "workforge-runtime.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`, { mode: 0o600 });
} finally {
  if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
  rmSync(temporaryRoot, { recursive: true, force: true });
}
console.log(`Tunnel runtime installed and verified: ${targetBinary}`);
