import { lstat, open } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

export function parseModeEvidence(text: string, observedAt: string, running = false, startedAt?: string) {
  const empty = { evidence: "none", toolMode: "unknown", redaction: "unknown", tools: null as number | null,
    observedAt: null as string | null, source: "tunnel_log" };
  const lines = text.split(/\r?\n/u).reverse();
  const posture = lines.find(line => line.startsWith("WorkForge MCP posture: "));
  let toolMode = "unknown";
  let redaction = "unknown";
  let tools: number | null = null;
  if (posture) {
    try {
      const value = JSON.parse(posture.slice("WorkForge MCP posture: ".length));
      if (!["read_only", "read_write"].includes(value.toolMode) || !["on", "off"].includes(value.redaction)
        || !Number.isInteger(value.tools) || value.tools < 0 || value.tools > 1000) return empty;
      ({ toolMode, redaction, tools } = value);
    } catch { return empty; }
  } else {
    const mode = lines.find(line => /^WorkForge MCP tool mode: (read_only|read_write)$/u.test(line));
    if (!mode) return empty;
    toolMode = mode.slice("WorkForge MCP tool mode: ".length);
  }
  const current = running && startedAt !== undefined && Number.isFinite(Date.parse(startedAt))
    && Date.parse(observedAt) >= Date.parse(startedAt);
  return { evidence: current ? "log" : "stale", toolMode, redaction, tools, observedAt, source: "tunnel_log" };
}

export async function readModeEvidence(path: string, running = false, startedAt?: string) {
  if (!isAbsolute(path)) throw new Error("MODE_LOG_UNSAFE");
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("MODE_LOG_UNSAFE");
    if (dirname(parent) === parent) break;
  }
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error("MODE_LOG_UNSAFE");
  const handle = await open(path, "r");
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink > 1 || opened.dev !== info.dev || opened.ino !== info.ino) throw new Error("MODE_LOG_UNSAFE");
    const offset = Math.max(0, opened.size - 256 * 1024);
    const buffer = Buffer.alloc(Math.min(opened.size, 256 * 1024));
    let count = 0;
    while (count < buffer.length) {
      const result = await handle.read(buffer, count, buffer.length - count, offset + count);
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    let text = buffer.subarray(0, count).toString("utf8");
    if (offset) text = text.includes("\n") ? text.slice(text.indexOf("\n") + 1) : "";
    return parseModeEvidence(text, opened.mtime.toISOString(), running, startedAt);
  } finally { await handle.close(); }
}
