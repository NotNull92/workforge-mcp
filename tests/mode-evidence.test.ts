import { mkdtemp, writeFile, symlink, rm, link, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseModeEvidence, readModeEvidence } from "../src/mode-evidence.js";

it("distinguishes current, stale and absent mode evidence without guessing", () => {
  const text = 'WorkForge MCP posture: {"toolMode":"read_only","redaction":"on","tools":12}\n';
  const time = "2026-10-26T10:00:00.000Z";
  expect(parseModeEvidence(text, time, true, time)).toMatchObject({ evidence: "log", tools: 12 });
  expect(parseModeEvidence(text, time, true)).toMatchObject({ evidence: "stale" });
  expect(parseModeEvidence(text, time, false, time)).toMatchObject({ evidence: "stale" });
  expect(parseModeEvidence(text, time, true, "2026-10-27T10:00:00.000Z")).toMatchObject({ evidence: "stale" });
  expect(parseModeEvidence(text + "WorkForge MCP posture: invalid", time)).toMatchObject({ evidence: "none", toolMode: "unknown" });
  expect(parseModeEvidence("WorkForge MCP tool mode: read_write", time)).toMatchObject({ toolMode: "read_write", redaction: "unknown", evidence: "stale" });
});

it("reads only a bounded tail and rejects redirected logs", async () => {
  // Ancestors must not be symlinks; macOS tmpdir lives under the /var -> /private/var link.
  const root = await realpath(await mkdtemp(join(tmpdir(), "workforge-mode-log-")));
  try {
    const path = join(root, "tunnel.stderr.log");
    await writeFile(path, "x".repeat(300000) + '\nWorkForge MCP posture: {"toolMode":"read_write","redaction":"off","tools":19}\n');
    expect(await readModeEvidence(path)).toMatchObject({ evidence: "stale", redaction: "off" });
    const redirected = join(root, "redirected.log");
    if (process.platform === "win32") await link(path, redirected);
    else await symlink(path, redirected);
    await expect(readModeEvidence(redirected)).rejects.toThrow("MODE_LOG_UNSAFE");
  } finally { await rm(root, { recursive: true, force: true }); }
});
