import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { lstat, opendir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { normalizePathForComparison } from "./path-policy.js";
import type { ProjectContext } from "./profile.js";

export function assertSafeRuntimeRoot(context: ProjectContext, runtimeRoot: string): string {
  const primaryCanonical = realpathSync(context.primaryRoot);
  for (const directory of [
    resolve(context.primaryRoot, "artifacts"),
    resolve(context.primaryRoot, "artifacts", "workforge-mcp"),
    runtimeRoot,
  ]) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error("Runtime archive contains a redirected directory segment.");
    }
  }
  const runtimeCanonical = realpathSync(runtimeRoot);
  const runtimeFromPrimary = relative(normalizePathForComparison(primaryCanonical), normalizePathForComparison(runtimeCanonical));
  if (runtimeFromPrimary === "" || runtimeFromPrimary.startsWith("..") || isAbsolute(runtimeFromPrimary)) {
    throw new Error("Runtime archive escaped the registered project root.");
  }
  return runtimeCanonical;
}

export function readBoundedArchiveFile(path: string, maxBytes: number, label: string): Buffer {
  const pathInfo = lstatSync(path);
  if (!pathInfo.isFile() || pathInfo.isSymbolicLink() || pathInfo.nlink > 1 || pathInfo.size > maxBytes) {
    throw new Error(`${label} is missing or unsafe.`);
  }
  const handle = openSync(path, "r");
  try {
    const info = fstatSync(handle);
    if (!info.isFile() || info.nlink > 1 || info.size !== pathInfo.size || info.size > maxBytes) {
      throw new Error(`${label} changed while it was being opened.`);
    }
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(handle, bytes, offset, bytes.byteLength - offset, offset);
      if (count === 0) throw new Error(`${label} changed while it was being read.`);
      offset += count;
    }
    const after = fstatSync(handle);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) {
      throw new Error(`${label} changed while it was being read.`);
    }
    return bytes;
  } finally {
    closeSync(handle);
  }
}

export async function recentArchiveEntries(context: ProjectContext, root: string, pattern: RegExp,
  kind: "file" | "directory", limit: number, signal?: AbortSignal, keep = limit * 2) {
  if (!Number.isInteger(keep) || keep < 1 || keep > 2000) throw new Error("Invalid archive candidate limit.");
  const result = { entries: [] as Array<{ name: string; mtimeMs: number }>, scannedEntries: 0,
    candidateCount: 0, scanLimited: false, unsafeNames: [] as string[], errorsTruncated: false };
  signal?.throwIfAborted();
  try { assertSafeRuntimeRoot(context, root); }
  catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return result;
    throw error;
  }
  for await (const entry of await opendir(root)) {
    signal?.throwIfAborted();
    if (result.scannedEntries === 20_000) { result.scanLimited = true; break; }
    result.scannedEntries += 1;
    if (!pattern.test(entry.name)) continue;
    result.candidateCount += 1;
    try {
      const info = await lstat(resolve(root, entry.name));
      if (info.isSymbolicLink() || (kind === "directory" ? !info.isDirectory() : !info.isFile() || info.nlink > 1)) throw new Error("Unsafe archive entry.");
      result.entries.push({ name: entry.name, mtimeMs: info.mtimeMs });
      result.entries.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
      if (result.entries.length > keep) result.entries.pop();
    } catch {
      if (result.unsafeNames.length < 100) result.unsafeNames.push(entry.name);
      else result.errorsTruncated = true;
    }
  }
  return result;
}

