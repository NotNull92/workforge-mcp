import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  TUNNEL_ARCHIVE_SHA256,
  TUNNEL_ARCHIVE_URL,
  TUNNEL_VERSION,
  loadInstallation,
  tunnelClientPath,
} from "./tunnel-common.mjs";

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("This preview supports macOS arm64 only.");
const installation = loadInstallation(process.argv[process.argv.indexOf("--profile") + 1] ?? "workstation");
const targetBinary = tunnelClientPath(installation);
const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const response = await fetch(TUNNEL_ARCHIVE_URL, { redirect: "follow" });
if (!response.ok) throw new Error(`Tunnel runtime download failed: HTTP ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== TUNNEL_ARCHIVE_SHA256) throw new Error("Tunnel runtime SHA-256 mismatch.");

const temporaryRoot = mkdtempSync(resolve(tmpdir(), "workforge-tunnel-runtime-"));
try {
  const archivePath = resolve(temporaryRoot, "runtime.zip");
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
    version: TUNNEL_VERSION,
    archiveSha256: digest,
    tunnelClientSha256: sha256File(stagedBinary),
    cloudflaredSha256: sha256File(stagedCloudflared),
    source: TUNNEL_ARCHIVE_URL,
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
  const stagingRoot = `${targetRoot}.${randomUUID()}.tmp`;
  renameSync(extractedPath, stagingRoot);
  renameSync(stagingRoot, targetRoot);
  writeFileSync(resolve(targetRoot, "workforge-runtime.json"), `${JSON.stringify(runtimeManifest, null, 2)}\n`, { mode: 0o600 });
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
console.log(`Tunnel runtime installed and verified: ${targetBinary}`);
