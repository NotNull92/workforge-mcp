import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { ProjectContext } from "./profile.js";
import { makeWorkstationEnvironment, runProcess } from "./process.js";
import { resolveAuthorizedWorkstationPath } from "./workstation.js";

const MAX_TEXT_BYTES = 64 * 1024 * 1024;
const MAX_WRITE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_SEARCH_OUTPUT_BYTES = 8 * 1024 * 1024;

export type DirectoryEntryKind = "file" | "directory" | "symlink" | "other";

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

interface FileLeaseOwner {
  readonly version: 1;
  readonly operationId: string;
  readonly processId: number;
  readonly targetPath: string;
  readonly createdAt: string;
}

async function withTargetWriteLease<T>(
  context: ProjectContext,
  targetPath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const leaseRoot = resolve(context.engineRoot, "runtime", "file-leases");
  const normalizedTarget = process.platform === "win32" ? targetPath.toLocaleLowerCase("en-US") : targetPath;
  const leasePath = resolve(leaseRoot, sha256(Buffer.from(normalizedTarget, "utf8")));
  const ownerPath = resolve(leasePath, "owner.json");
  await mkdir(leaseRoot, { recursive: true });

  let acquired = false;
  for (let attempt = 0; attempt < 3 && !acquired; attempt += 1) {
    try {
      await mkdir(leasePath);
      acquired = true;
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      const owner = await readFile(ownerPath, "utf8")
        .then((text): FileLeaseOwner | null => JSON.parse(text) as FileLeaseOwner)
        .catch(() => null);
      if (owner && Number.isInteger(owner.processId) && owner.processId > 0 && processIsAlive(owner.processId)) {
        throw new Error(
          `FILE_WRITE_LEASE_BUSY: target is being updated by operation ${owner.operationId} in process ${owner.processId}: ${targetPath}`,
        );
      }
      const leaseInfo = await stat(leasePath).catch(() => undefined);
      if (!owner && (!leaseInfo || Date.now() - leaseInfo.mtimeMs < 30_000)) {
        throw new Error(`FILE_WRITE_LEASE_UNCERTAIN: target lease owner is not yet verifiable: ${targetPath}`);
      }
      const stalePath = `${leasePath}.stale-${randomUUID()}`;
      try {
        await rename(leasePath, stalePath);
        await rm(stalePath, { recursive: true, force: true });
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
    }
  }
  if (!acquired) throw new Error(`FILE_WRITE_LEASE_BUSY: could not acquire target lease: ${targetPath}`);

  const owner: FileLeaseOwner = {
    version: 1,
    operationId: randomUUID(),
    processId: process.pid,
    targetPath,
    createdAt: new Date().toISOString(),
  };
  try {
    await writeFile(ownerPath, `${JSON.stringify(owner)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return await operation();
  } finally {
    await rm(leasePath, { recursive: true, force: true }).catch(() => undefined);
  }
}

function decodeUtf8(bytes: Buffer): { text: string; hasBom: boolean } {
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = hasBom ? bytes.subarray(3) : bytes;
  return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), hasBom };
}

function encodeUtf8(text: string, hasBom: boolean): Buffer {
  const body = Buffer.from(text, "utf8");
  return hasBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function listDirectory(input: {
  context: ProjectContext;
  path: string;
  depth: number;
  maxEntries: number;
}) {
  const root = await resolveAuthorizedWorkstationPath(input.context, input.path, "tree");
  const rootInfo = await stat(root);
  if (!rootInfo.isDirectory()) throw new Error(`Not a directory: ${root}`);
  const entries: Array<{
    path: string;
    name: string;
    kind: DirectoryEntryKind;
    size: number | null;
    modifiedAt: string | null;
  }> = [];
  const errors: Array<{ path: string; message: string }> = [];
  let truncated = false;

  const walk = async (directory: string, currentDepth: number): Promise<void> => {
    if (entries.length >= input.maxEntries) {
      truncated = true;
      return;
    }
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (errors.length < 100) errors.push({ path: directory, message: errorMessage(error) });
      return;
    }
    children.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children) {
      if (entries.length >= input.maxEntries) {
        truncated = true;
        return;
      }
      const childPath = resolve(directory, child.name);
      let info;
      try {
        info = await lstat(childPath);
      } catch (error) {
        if (errors.length < 100) errors.push({ path: childPath, message: errorMessage(error) });
        continue;
      }
      const kind: DirectoryEntryKind = info.isSymbolicLink()
        ? "symlink"
        : info.isDirectory()
          ? "directory"
          : info.isFile()
            ? "file"
            : "other";
      entries.push({
        path: childPath,
        name: child.name,
        kind,
        size: info.isFile() ? info.size : null,
        modifiedAt: Number.isFinite(info.mtimeMs) ? info.mtime.toISOString() : null,
      });
      if (kind === "directory" && currentDepth < input.depth) {
        await walk(childPath, currentDepth + 1);
      }
    }
  };

  await walk(root, 1);
  return { path: root, entries, errors, truncated };
}

function compilePathQuery(query: string, regex: boolean): (value: string) => boolean {
  if (!regex) {
    const needle = query.toLocaleLowerCase("en-US");
    return (value) => value.toLocaleLowerCase("en-US").includes(needle);
  }
  const expression = new RegExp(query, "iu");
  return (value) => expression.test(value);
}

export async function searchFiles(input: {
  context: ProjectContext;
  path: string;
  query: string;
  mode: "content" | "path";
  regex: boolean;
  globs: readonly string[];
  includeHidden: boolean;
  respectIgnoreFiles: boolean;
  maxResults: number;
}) {
  const root = await resolveAuthorizedWorkstationPath(input.context, input.path, "tree");
  const rootInfo = await stat(root);
  const cwd = rootInfo.isDirectory() ? root : dirname(root);
  const target = rootInfo.isDirectory() ? "." : basename(root);
  const commonArgs: string[] = [];
  if (input.includeHidden) commonArgs.push("--hidden");
  if (!input.respectIgnoreFiles) commonArgs.push("--no-ignore");
  for (const glob of input.globs) commonArgs.push("--glob", glob);

  if (input.mode === "path") {
    const result = await runProcess("rg.exe", ["--files", ...commonArgs, "--", target], {
      cwd,
      timeoutMs: 120_000,
      maxStdoutBytes: MAX_SEARCH_OUTPUT_BYTES,
      maxStderrBytes: 512 * 1024,
      env: makeWorkstationEnvironment(),
    });
    const matchesQuery = compilePathQuery(input.query, input.regex);
    const matches: Array<{ path: string; line: null; column: null; text: null }> = [];
    const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
    let overflow = false;
    for (const line of lines) {
      const absolutePath = resolve(cwd, line);
      if (!matchesQuery(absolutePath)) continue;
      if (matches.length >= input.maxResults) {
        overflow = true;
        break;
      }
      matches.push({ path: absolutePath, line: null, column: null, text: null });
    }
    return {
      path: root,
      mode: input.mode,
      query: input.query,
      matches,
      warning: result.exitCode !== 0 && result.exitCode !== 1 ? result.stderr.slice(0, 4096) || `rg exited with ${result.exitCode}` : null,
      truncated: result.truncated || overflow,
    };
  }

  const args = ["--json", "--line-number", "--column", "--color", "never", ...commonArgs];
  if (!input.regex) args.push("--fixed-strings");
  args.push("--", input.query, target);
  const result = await runProcess("rg.exe", args, {
    cwd,
    timeoutMs: 120_000,
    maxStdoutBytes: MAX_SEARCH_OUTPUT_BYTES,
    maxStderrBytes: 512 * 1024,
    env: makeWorkstationEnvironment(),
  });
  const matches: Array<{ path: string; line: number; column: number; text: string }> = [];
  let overflow = false;
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (!line) continue;
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    if (!event || typeof event !== "object" || (event as { type?: unknown }).type !== "match") continue;
    const data = (event as { data?: Record<string, unknown> }).data;
    const pathText = (data?.path as { text?: unknown } | undefined)?.text;
    const lineText = (data?.lines as { text?: unknown } | undefined)?.text;
    const lineNumber = data?.line_number;
    const submatches = data?.submatches;
    const firstStart = Array.isArray(submatches) && submatches.length > 0
      ? (submatches[0] as { start?: unknown }).start
      : 0;
    if (typeof pathText !== "string" || typeof lineText !== "string" || typeof lineNumber !== "number") continue;
    if (matches.length >= input.maxResults) {
      overflow = true;
      break;
    }
    matches.push({
      path: resolve(cwd, pathText),
      line: lineNumber,
      column: typeof firstStart === "number" ? firstStart + 1 : 1,
      text: lineText.replace(/[\r\n]+$/u, "").slice(0, 4096),
    });
  }
  return {
    path: root,
    mode: input.mode,
    query: input.query,
    matches,
    warning: result.exitCode !== 0 && result.exitCode !== 1 ? result.stderr.slice(0, 4096) || `rg exited with ${result.exitCode}` : null,
    truncated: result.truncated || overflow,
  };
}

async function readTextBytes(path: string): Promise<{ bytes: Buffer; text: string; hasBom: boolean; sha256: string }> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Not a file: ${path}`);
  if (info.size > MAX_TEXT_BYTES) throw new Error(`Text file exceeds the ${MAX_TEXT_BYTES}-byte tool limit; use shell tools for a bounded alternative.`);
  const bytes = await readFile(path);
  const decoded = decodeUtf8(bytes);
  return { bytes, ...decoded, sha256: sha256(bytes) };
}

export async function readTextFile(input: {
  context: ProjectContext;
  path: string;
  startLine: number;
  maxLines: number;
}) {
  const path = await resolveAuthorizedWorkstationPath(input.context, input.path);
  const current = await readTextBytes(path);
  const lines = current.text.split(/\r\n|\n|\r/u);
  const startIndex = Math.min(input.startLine - 1, lines.length);
  const selected = lines.slice(startIndex, startIndex + input.maxLines);
  const endLine = selected.length === 0 ? input.startLine - 1 : startIndex + selected.length;
  return {
    path,
    text: selected.join("\n"),
    sha256: current.sha256,
    byteLength: current.bytes.byteLength,
    startLine: input.startLine,
    endLine,
    totalLines: lines.length,
    truncated: startIndex > 0 || endLine < lines.length,
  };
}

async function resolveWriteTarget(path: string): Promise<{ requestedPath: string; actualPath: string; exists: boolean }> {
  const current = await lstat(path).catch(() => undefined);
  if (current) {
    const actualPath = await realpath(path);
    const info = await stat(actualPath);
    if (!info.isFile()) throw new Error(`Write target is not a file: ${path}`);
    if (info.nlink > 1) throw new Error(`Hardlinked text mutation is not supported; copy the file before editing: ${path}`);
    return { requestedPath: path, actualPath, exists: true };
  }
  const parent = await realpath(dirname(path));
  return { requestedPath: path, actualPath: resolve(parent, basename(path)), exists: false };
}

async function writeNewFileExclusive(path: string, bytes: Buffer): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(path, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();
}

async function atomicReplace(path: string, bytes: Buffer, expectedSha256: string): Promise<void> {
  const temporaryPath = resolve(dirname(path), `.chatgpt-workstation-${randomUUID()}.tmp`);
  const temporary = await open(temporaryPath, "wx", 0o600);
  try {
    await temporary.writeFile(bytes);
    await temporary.sync();
  } finally {
    await temporary.close();
  }
  try {
    const latest = await readTextBytes(path);
    if (latest.sha256 !== expectedSha256) throw new Error("The file changed after it was read; no write was applied.");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function writeTextFile(input: {
  context: ProjectContext;
  path: string;
  content: string;
  expectedSha256: string;
  createParents: boolean;
}) {
  const requestedPath = await resolveAuthorizedWorkstationPath(input.context, input.path);
  const contentBytes = Buffer.from(input.content, "utf8");
  if (contentBytes.byteLength > MAX_WRITE_BYTES) throw new Error(`Write exceeds the ${MAX_WRITE_BYTES}-byte tool limit.`);
  if (input.createParents) await mkdir(dirname(requestedPath), { recursive: true });
  const target = await resolveWriteTarget(requestedPath);

  if (input.expectedSha256 === "absent") {
    if (target.exists) throw new Error("The target already exists; no write was applied.");
    await writeNewFileExclusive(target.actualPath, contentBytes);
    return {
      path: requestedPath,
      previousSha256: null,
      sha256: sha256(contentBytes),
      byteLength: contentBytes.byteLength,
      created: true,
    };
  }

  if (!/^[a-f0-9]{64}$/u.test(input.expectedSha256)) throw new Error("expectedSha256 must be 'absent' or a lowercase SHA-256 hash.");
  if (!target.exists) throw new Error("The target no longer exists; no write was applied.");
  return await withTargetWriteLease(input.context, target.actualPath, async () => {
    const current = await readTextBytes(target.actualPath);
    if (current.sha256 !== input.expectedSha256) throw new Error("The file changed after it was read; no write was applied.");
    const updatedBytes = encodeUtf8(input.content, current.hasBom);
    if (updatedBytes.byteLength > MAX_WRITE_BYTES) throw new Error(`Write exceeds the ${MAX_WRITE_BYTES}-byte tool limit.`);
    await atomicReplace(target.actualPath, updatedBytes, input.expectedSha256);
    return {
      path: requestedPath,
      previousSha256: input.expectedSha256,
      sha256: sha256(updatedBytes),
      byteLength: updatedBytes.byteLength,
      created: false,
    };
  });
}

function countOccurrences(text: string, needle: string, cap = 2): number {
  let count = 0;
  let offset = 0;
  while (count < cap) {
    const foundAt = text.indexOf(needle, offset);
    if (foundAt < 0) break;
    count += 1;
    offset = foundAt + Math.max(needle.length, 1);
  }
  return count;
}

export async function replaceText(input: {
  context: ProjectContext;
  path: string;
  expectedSha256: string;
  oldText: string;
  newText: string;
}) {
  if (!input.oldText) throw new Error("oldText must not be empty.");
  const requestedPath = await resolveAuthorizedWorkstationPath(input.context, input.path);
  const target = await resolveWriteTarget(requestedPath);
  if (!target.exists) throw new Error(`File does not exist: ${requestedPath}`);
  return await withTargetWriteLease(input.context, target.actualPath, async () => {
    const current = await readTextBytes(target.actualPath);
    if (current.sha256 !== input.expectedSha256) throw new Error("The file changed after it was read; no write was applied.");
    if (countOccurrences(current.text, input.oldText) !== 1) throw new Error("oldText must occur exactly once in the current file.");
    const updated = current.text.replace(input.oldText, input.newText);
    const updatedBytes = encodeUtf8(updated, current.hasBom);
    if (updatedBytes.byteLength > MAX_WRITE_BYTES) throw new Error(`Edited file exceeds the ${MAX_WRITE_BYTES}-byte tool limit.`);
    await atomicReplace(target.actualPath, updatedBytes, input.expectedSha256);
    return {
      path: requestedPath,
      previousSha256: input.expectedSha256,
      sha256: sha256(updatedBytes),
      byteLength: updatedBytes.byteLength,
    };
  });
}

function imageMimeType(path: string, bytes: Buffer): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const extension = extname(path).toLocaleLowerCase("en-US");
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  throw new Error("Unsupported image format; use PNG, JPEG, GIF, or WebP.");
}

export async function readImageFile(context: ProjectContext, rawPath: string) {
  const path = await resolveAuthorizedWorkstationPath(context, rawPath);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Not a file: ${path}`);
  if (info.size > MAX_IMAGE_BYTES) throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES}-byte tool limit.`);
  const bytes = await readFile(path);
  return {
    result: { path, mimeType: imageMimeType(path, bytes), byteLength: bytes.byteLength, sha256: sha256(bytes) },
    bytes,
  };
}
