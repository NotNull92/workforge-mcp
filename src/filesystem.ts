import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  link,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { ProjectContext } from "./profile.js";
import { makeWorkstationEnvironment, resolveToolExecutable, runProcess } from "./process.js";
import { resolveAuthorizedWorkstationPath } from "./workstation.js";
import { canonicalizeExistingAncestor, isSamePath, normalizePathForComparison } from "./path-policy.js";

const MAX_TEXT_BYTES = 64 * 1024 * 1024;
const MAX_WRITE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_SEARCH_OUTPUT_BYTES = 4 * 1024 * 1024;

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

function compilePathQuery(query: string): (value: string) => boolean {
  const needle = query.toLocaleLowerCase("en-US");
  return (value) => value.toLocaleLowerCase("en-US").includes(needle);
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
  timeoutMs?: number;
  sort?: "none" | "path";
  match?: "path" | "basename";
  lineFormat?: "json" | "columns";
  includeStats?: boolean;
  signal?: AbortSignal;
}) {
  const startedAt = performance.now();
  if (input.sort !== undefined && !["none", "path"].includes(input.sort)) throw new Error("Invalid sort.");
  if (input.match !== undefined && !["path", "basename"].includes(input.match)) throw new Error("Invalid match.");
  if (input.lineFormat !== undefined && !["json", "columns"].includes(input.lineFormat)) throw new Error("Invalid lineFormat.");
  if (input.includeStats !== undefined && typeof input.includeStats !== "boolean") throw new Error("Invalid includeStats.");
  if (input.mode === "content" && input.match === "basename") throw new Error("basename requires path mode.");
  if (input.mode === "path" && input.lineFormat === "columns") throw new Error("columns requires content mode.");
  const root = await resolveAuthorizedWorkstationPath(input.context, input.path, "tree");
  const rootInfo = await stat(root);
  const cwd = rootInfo.isDirectory() ? root : dirname(root);
  const target = rootInfo.isDirectory() ? "." : basename(root);
  const pathRegex = input.mode === "path" && input.regex;
  const matchesQuery = input.mode === "path" && !input.regex ? compilePathQuery(input.query) : undefined;
  const columns = input.lineFormat === "columns";
  const args = input.mode === "path" ? ["--no-config", "--files", "--null"] : columns
    ? ["--no-config", "--null", "--with-filename", "--line-number", "--column", "--no-heading", "--color", "never", "--max-columns", "1024", "--max-columns-preview"]
    : ["--no-config", "--json", "--line-number", "--column", "--color", "never"];
  if (input.sort === "path") args.push("--sort", "path");
  if (input.includeStats && input.mode === "content" && !columns) args.push("--stats");
  if (input.mode === "path" && input.match === "basename" && !input.regex) args.push("--iglob", `**/*${input.query.replace(/[\\*?\[\]{}!]/gu, "\\$&")}*`);
  if (input.includeHidden) args.push("--hidden");
  if (!input.respectIgnoreFiles) args.push("--no-ignore");
  for (const glob of input.globs) args.push("--glob", glob);
  if (input.mode === "content" && !input.regex) args.push("--fixed-strings");
  args.push("--", ...(input.mode === "content" ? [input.query] : []), target);
  const matches: Array<{ path: string; line: number | null; column: number | null; text: string | null }> = [];
  const candidatePaths: string[] = [];
  const delimiter = input.mode === "path" ? 0 : 10;
  let pending: Buffer[] = [];
  let stats: { searches: number; searchesWithMatch: number; bytesSearched: number; matchedLines: number } | null = null;
  const consumeRecord = (record: string): boolean => {
    let match: (typeof matches)[number];
    if (input.mode === "path") {
      if (!record) return false;
      const path = resolve(cwd, record);
      if (pathRegex) { candidatePaths.push(path); return false; }
      if (!matchesQuery!(input.match === "basename" ? basename(path) : path)) return false;
      match = { path, line: null, column: null, text: null };
    } else if (columns) {
      const split = record.indexOf("\0");
      if (split < 0) return false;
      const fields = /^(\d+):(\d+):(.*)$/u.exec(record.slice(split + 1));
      if (!fields) return false;
      match = { path: resolve(cwd, record.slice(0, split)), line: Number(fields[1]), column: Number(fields[2]), text: fields[3]!.replace(/\r$/u, "").slice(0, 1024) };
    } else {
      let event: unknown;
      try { event = JSON.parse(record) as unknown; } catch { return false; }
      if (!event || typeof event !== "object") return false;
      const data = (event as { data?: Record<string, unknown> }).data;
      if (input.includeStats && (event as { type?: unknown }).type === "summary") {
        const value = data?.stats as Record<string, unknown> | undefined;
        const numbers = [value?.searches, value?.searches_with_match, value?.bytes_searched, value?.matched_lines];
        if (numbers.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
          stats = { searches: numbers[0] as number, searchesWithMatch: numbers[1] as number,
            bytesSearched: numbers[2] as number, matchedLines: numbers[3] as number };
        }
      }
      if ((event as { type?: unknown }).type !== "match") return false;
      const pathText = (data?.path as { text?: unknown } | undefined)?.text;
      const lineText = (data?.lines as { text?: unknown } | undefined)?.text;
      const lineNumber = data?.line_number;
      const submatches = data?.submatches;
      const firstStart = Array.isArray(submatches) && submatches.length > 0 ? (submatches[0] as { start?: unknown }).start : 0;
      if (typeof pathText !== "string" || typeof lineText !== "string" || typeof lineNumber !== "number") return false;
      match = { path: resolve(cwd, pathText), line: lineNumber,
        column: typeof firstStart === "number" ? firstStart + 1 : 1,
        text: lineText.replace(/[\r\n]+$/u, "").slice(0, 1024) };
    }
    if (matches.length >= input.maxResults) return true;
    matches.push(match);
    return false;
  };
  let result = await runProcess(resolveToolExecutable("rg"), args, {
    cwd, timeoutMs: input.timeoutMs ?? 10_000,
    maxStdoutBytes: MAX_SEARCH_OUTPUT_BYTES, maxStderrBytes: 512 * 1024,
    env: makeWorkstationEnvironment(), stopOnOutputLimit: true, signal: input.signal,
    onStdoutChunk: (chunk) => {
      let start = 0;
      let end: number;
      while ((end = chunk.indexOf(delimiter, start)) >= 0) {
        pending.push(chunk.subarray(start, end));
        const record = Buffer.concat(pending).toString("utf8");
        pending = [];
        if (consumeRecord(record)) return true;
        start = end + 1;
      }
      if (start < chunk.length) pending.push(chunk.subarray(start));
      return false;
    },
  });
  const firstResult = result;
  if (pathRegex && (result.exitCode === 0 || result.exitCode === 1 || result.stopReason === "output_limit")) {
    const remaining = (input.timeoutMs ?? 10_000) - (performance.now() - startedAt);
    if (remaining <= 0) result = { ...result, stopReason: "timeout", timedOut: true };
    else {
      let partial = Buffer.alloc(0);
      result = await runProcess(resolveToolExecutable("rg"), ["--no-config", "--null-data", "--line-number", "--ignore-case", "--color", "never", "--no-heading", "-e", input.query, "-"], {
        cwd, timeoutMs: remaining, maxStdoutBytes: MAX_SEARCH_OUTPUT_BYTES * 2, maxStderrBytes: 512 * 1024,
        env: makeWorkstationEnvironment(), stopOnOutputLimit: true, signal: input.signal,
        stdin: Buffer.from(candidatePaths.map(path => input.match === "basename" ? basename(path) : path).join("\0") + (candidatePaths.length ? "\0" : "")),
        onStdoutChunk: chunk => {
          partial = Buffer.concat([partial, chunk]);
          let end: number;
          while ((end = partial.indexOf(0)) >= 0) {
            const record = partial.subarray(0, end).toString("utf8");
            partial = partial.subarray(end + 1);
            const index = Number(record.slice(0, record.indexOf(":"))) - 1;
            if (!Number.isInteger(index) || index < 0 || index >= candidatePaths.length) continue;
            if (matches.length >= input.maxResults) return true;
            matches.push({ path: candidatePaths[index]!, line: null, column: null, text: null });
          }
          return false;
        },
      });
      if (firstResult.stopReason === "output_limit" && result.stopReason === null && (result.exitCode === 0 || result.exitCode === 1)) {
        result = { ...result, stopReason: "output_limit", truncated: true };
      }
    }
  }
  // rg terminates every path/JSON record; an unterminated tail is never a match.
  const stoppedBecause = result.stopReason === "callback" ? "result_limit" as const
    : result.stopReason === "timeout" ? "timeout" as const
    : result.stopReason === "output_limit" ? "output_limit" as const
    : result.exitCode === 0 || result.exitCode === 1 ? "complete" as const : "error" as const;
  let warning = stoppedBecause === "timeout" ? "Search time budget reached; matches are partial."
    : stoppedBecause === "output_limit" ? "Search output budget reached; a very long JSON line may produce no complete matches."
    : stoppedBecause === "error" ? result.stderr.slice(0, 4096) || `rg exited with ${result.exitCode}` : null;
  if (!result.killConfirmed) warning = `${warning ?? "Search stopped."} Process termination could not be confirmed.`;
  return { path: root, mode: input.mode, query: input.query, matches, warning,
    sorted: input.sort === "path", stats,
    truncated: stoppedBecause !== "complete", stoppedBecause, elapsedMs: Math.round(performance.now() - startedAt) };
}

interface TextReadBudget { remainingBytes: number }

async function readTextBytes(path: string, budget?: TextReadBudget, signal?: AbortSignal): Promise<{ bytes: Buffer; text: string; hasBom: boolean; sha256: string }> {
  signal?.throwIfAborted();
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Not a file: ${path}`);
  if (info.size > MAX_TEXT_BYTES) throw new Error(`Text file exceeds the ${MAX_TEXT_BYTES}-byte tool limit; use shell tools for a bounded alternative.`);
  const limit = Math.min(MAX_TEXT_BYTES, budget?.remainingBytes ?? MAX_TEXT_BYTES);
  const limitError = () => budget && limit < MAX_TEXT_BYTES
    ? Object.assign(new Error("SOURCE_BUDGET_EXCEEDED: insufficient batch source budget; read this file separately with read_text_file."), { code: "SOURCE_BUDGET_EXCEEDED" })
    : new Error(`Text file exceeds the ${MAX_TEXT_BYTES}-byte tool limit; use shell tools for a bounded alternative.`);
  if (info.size > limit) throw limitError();
  const handle = await open(path, "r");
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile()) throw new Error(`Not a file: ${path}`);
    if (openedInfo.size > limit) throw limitError();
    while (true) {
      signal?.throwIfAborted();
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limit - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (budget) budget.remainingBytes = Math.max(0, budget.remainingBytes - bytesRead);
      if (total > limit) throw limitError();
      chunks.push(chunk.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  signal?.throwIfAborted();
  const bytes = Buffer.concat(chunks, total);
  const decoded = decodeUtf8(bytes);
  return { bytes, ...decoded, sha256: sha256(bytes) };
}

export async function readTextFile(input: {
  context: ProjectContext;
  path: string;
  startLine: number;
  maxLines: number;
  maxCharacters?: number;
  sourceBudget?: TextReadBudget;
  ifSha256Differs?: string;
  signal?: AbortSignal;
}) {
  const path = await resolveAuthorizedWorkstationPath(input.context, input.path);
  const maxCharacters = input.maxCharacters ?? 60_000;
  if (input.ifSha256Differs !== undefined && !/^[a-f0-9]{64}$/u.test(input.ifSha256Differs)) throw new Error("Invalid ifSha256Differs.");
  const current = await readTextBytes(path, input.sourceBudget, input.signal);
  return selectRange(current, { ...input, maxCharacters }, path);
}

function selectRange(current: Awaited<ReturnType<typeof readTextBytes>> & { lines?: string[] }, input: Parameters<typeof readTextFile>[0], path: string) {
  const maxCharacters = input.maxCharacters ?? 60_000;
  const unchanged = current.sha256 === input.ifSha256Differs;
  const lines = current.lines ?? current.text.split(/\r\n|\n|\r/u);
  const startIndex = Math.min(input.startLine - 1, lines.length);
  const selected = lines.slice(startIndex, startIndex + input.maxLines);
  const selectedText = selected.join("\n");
  const text = selectedText.slice(0, maxCharacters).replace(/[\uD800-\uDBFF]$/u, "");
  const endLine = selected.length === 0 ? input.startLine - 1 : startIndex + selected.length;
  const characterLimited = text.length < selectedText.length;
  const nextStartLine = selected.length === 0 ? null : characterLimited
    ? input.startLine + (text.match(/\n/gu)?.length ?? 0)
    : endLine < lines.length ? endLine + 1 : null;
  return {
    path,
    text: unchanged ? "" : text,
    unchanged,
    sha256: current.sha256,
    byteLength: current.bytes.byteLength,
    startLine: input.startLine,
    endLine,
    totalLines: lines.length,
    characterLimited: unchanged ? false : characterLimited,
    nextStartLine: unchanged ? null : nextStartLine,
    truncated: !unchanged && (startIndex > 0 || endLine < lines.length || text.length < selectedText.length),
  };
}

type BatchReadResult =
  | { requestedPath: string; status: "read"; file: Awaited<ReturnType<typeof readTextFile>> }
  | { requestedPath: string; status: "error"; error: string; code: string | null }
  | { requestedPath: string; status: "skipped"; reason: "budget_exhausted" | "source_budget_exhausted" };

export async function readTextFiles(input: {
  context: ProjectContext;
  files?: readonly { path: string; startLine?: number; maxLines?: number; maxCharacters?: number; ifSha256Differs?: string }[];
  select?: { root: string; globs: readonly string[]; maxFiles?: number };
  maxTotalCharacters?: number;
  signal?: AbortSignal;
}) {
  const maxTotalCharacters = input.maxTotalCharacters ?? 60_000;
  const inRange = (value: number, minimum: number, maximum: number) => Number.isInteger(value) && value >= minimum && value <= maximum;
  if ((input.files === undefined) === (input.select === undefined)) throw new Error("Provide either files or select, never both.");
  let requested = input.files;
  let selection: { matched: number; truncated: boolean; stoppedBecause: string } | null = null;
  if (input.select) {
    const { root, globs } = input.select;
    const maxFiles = input.select.maxFiles ?? 10;
    if (typeof root !== "string" || !root || !Array.isArray(globs) || globs.length < 1 || globs.length > 8
      || globs.some(glob => typeof glob !== "string" || !glob || glob.length > 1024) || !inRange(maxFiles, 1, 20)) throw new Error("Invalid file selection.");
    const found = await searchFiles({ context: input.context, path: root, query: "", mode: "path", regex: false,
      globs, includeHidden: true, respectIgnoreFiles: true, maxResults: maxFiles, sort: "path", signal: input.signal });
    requested = found.matches.map(match => ({ path: match.path }));
    selection = { matched: requested.length, truncated: found.truncated, stoppedBecause: found.stoppedBecause };
  }
  if (!requested || requested.length > 20 || (!input.select && requested.length < 1)) throw new Error("Select between 1 and 20 files.");
  if (!inRange(maxTotalCharacters, 1024, 200_000)) throw new Error("maxTotalCharacters must be between 1024 and 200000.");
  const files = requested.map((file) => ({
    path: file.path, startLine: file.startLine ?? 1, maxLines: file.maxLines ?? 400, maxCharacters: file.maxCharacters ?? 60_000,
    ifSha256Differs: file.ifSha256Differs,
  }));
  for (const file of files) {
    if (typeof file.path !== "string" || file.path.length < 1 || file.path.length > 32_768
      || !inRange(file.startLine, 1, 100_000_000) || !inRange(file.maxLines, 1, 5000) || !inRange(file.maxCharacters, 1024, 200_000)) {
      throw new Error("Invalid batch file path or read range.");
    }
  }
  const sourceBudget = { remainingBytes: MAX_TEXT_BYTES };
  let returnedCharacters = 0;
  const results: BatchReadResult[] = [];
  const cache = new Map<string, { source: Awaited<ReturnType<typeof readTextBytes>> & { lines: string[] }; stamp: string }>();
  for (const file of files) {
    input.signal?.throwIfAborted();
    const remaining = maxTotalCharacters - returnedCharacters;
    if (remaining === 0 || (sourceBudget.remainingBytes === 0 && cache.size === 0)) {
      results.push({ requestedPath: file.path, status: "skipped", reason: remaining === 0 ? "budget_exhausted" : "source_budget_exhausted" });
      continue;
    }
    try {
      if (file.ifSha256Differs !== undefined && !/^[a-f0-9]{64}$/u.test(file.ifSha256Differs)) throw new Error("Invalid ifSha256Differs.");
      const path = await resolveAuthorizedWorkstationPath(input.context, file.path);
      const key = normalizePathForComparison(path);
      if (sourceBudget.remainingBytes === 0 && !cache.has(key)) {
        results.push({ requestedPath: file.path, status: "skipped", reason: "source_budget_exhausted" });
        continue;
      }
      const stampFor = async () => { const info = await stat(path); return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}`; };
      const stamp = await stampFor();
      const cached = cache.get(key);
      let source;
      if (cached?.stamp === stamp) source = cached.source;
      else {
        if (sourceBudget.remainingBytes === 0) {
          results.push({ requestedPath: file.path, status: "skipped", reason: "source_budget_exhausted" });
          continue;
        }
        const loaded = await readTextBytes(path, sourceBudget, input.signal);
        source = { ...loaded, lines: loaded.text.split(/\r\n|\n|\r/u) };
        if (await stampFor() === stamp) cache.set(key, { source, stamp });
        else cache.delete(key);
      }
      const result = selectRange(source, { ...file, context: input.context, maxCharacters: Math.min(file.maxCharacters, remaining) }, path);
      returnedCharacters += result.text.length;
      results.push({ requestedPath: file.path, status: "read", file: result });
    } catch (error) {
      input.signal?.throwIfAborted();
      results.push({ requestedPath: file.path, status: "error", error: errorMessage(error).slice(0, 1000), code: errorCode(error) ?? null });
    }
  }
  return {
    results,
    selection,
    returnedCharacters,
    truncated: results.some((result) => result.status === "skipped" || (result.status === "read" && result.file.characterLimited)),
    hasErrors: results.some((result) => result.status === "error"),
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
  const parent = await canonicalizeExistingAncestor(dirname(path));
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

export async function deleteFileWithCas(input: { context: ProjectContext; path: string; expectedSha256: string }) {
  if (!/^[a-f0-9]{64}$/u.test(input.expectedSha256)) throw new Error("Invalid expectedSha256.");
  const path = await resolveAuthorizedWorkstationPath(input.context, input.path);
  if ((await lstat(path)).isSymbolicLink()) throw new Error("Redirected deletion is not supported.");
  const target = await resolveWriteTarget(path);
  return withTargetWriteLease(input.context, target.actualPath, async () => {
    const current = await lstat(path);
    if (!current.isFile() || current.isSymbolicLink() || current.nlink > 1) throw new Error("Unsafe deletion target.");
    if ((await readTextBytes(path)).sha256 !== input.expectedSha256) throw new Error("CHECKPOINT_CONFLICT");
    await rm(path);
  });
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
    if (process.platform !== "win32") await chmod(temporaryPath, (await stat(path)).mode & 0o7777);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function matchCrlf(currentText: string, text: string): string {
  return currentText.includes("\r\n") && !/(?<!\r)\n|\r(?!\n)/u.test(currentText) ? text.replace(/(?<!\r)\n/gu, "\r\n") : text;
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
    const updatedBytes = encodeUtf8(matchCrlf(current.text, input.content), current.hasBom);
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

function replacementForCurrentText(
  currentText: string,
  oldText: string,
  newText: string,
  expectedCount = 1,
): Array<{ start: number; end: number; replacement: string }> {
  let found = 0;
  const locate = (needle: string, replacement: string) => {
    const matches = [];
    let start = currentText.indexOf(needle);
    while (start >= 0 && matches.length <= expectedCount) {
      if (matches.length && start < matches[matches.length - 1]!.end) {
        throw new Error(expectedCount === 1 ? "oldText matches multiple locations." : "overlapping occurrences");
      }
      matches.push({ start, end: start + needle.length, replacement });
      start = currentText.indexOf(needle, start + 1);
    }
    found = Math.max(found, matches.length);
    if (expectedCount === 1 && matches.length > 1) throw new Error("oldText matches multiple locations.");
    return matches.length === expectedCount ? matches : undefined;
  };
  const exact = locate(oldText, matchCrlf(currentText, newText));
  if (exact) return exact;
  if (oldText.includes("\n") && !oldText.includes("\r\n") && currentText.includes("\r\n")) {
    const normalized = locate(oldText.replaceAll("\n", "\r\n"), newText.replace(/\r\n|\r|\n/gu, "\r\n"));
    if (normalized) return normalized;
  }
  if (oldText.includes("\r\n")) {
    const normalized = locate(oldText.replaceAll("\r\n", "\n"), newText.replace(/\r\n|\r/gu, "\n"));
    if (normalized) return normalized;
  }
  throw new Error(expectedCount === 1 ? "oldText not found." : `expected ${expectedCount} occurrences, found ${found}`);
}

async function replaceTextInternal(input: {
  context: ProjectContext;
  path: string;
  expectedSha256: string;
  oldText?: string;
  newText?: string;
  expectedCount?: number;
  dryRun?: boolean;
  edits?: Array<{ oldText: string; newText: string; expectedCount?: number }>;
}, capture?: (bytes: Buffer) => void) {
  const batch = input.edits !== undefined;
  if (batch ? input.oldText !== undefined || input.newText !== undefined || input.expectedCount !== undefined
    : input.oldText === undefined || input.newText === undefined) {
    throw new Error("Provide either oldText/newText or edits, never both.");
  }
  if (input.dryRun !== undefined && typeof input.dryRun !== "boolean") throw new Error("dryRun must be boolean.");
  const edits = batch ? input.edits! : [{ oldText: input.oldText!, newText: input.newText!, expectedCount: input.expectedCount }];
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > 100) throw new Error("edits must contain 1 to 100 items.");
  const textLimit = (batch ? 1 : 4) * 1024 * 1024;
  let payloadBytes = 0;
  for (const [index, edit] of edits.entries()) {
    if (edit?.expectedCount !== undefined && (!Number.isInteger(edit.expectedCount) || edit.expectedCount < 1 || edit.expectedCount > 1000)) {
      throw new Error(`edits[${index}]: expectedCount must be from 1 to 1000.`);
    }
    if (!edit || typeof edit.oldText !== "string" || !edit.oldText || edit.oldText.length > textLimit
      || typeof edit.newText !== "string" || edit.newText.length > textLimit) {
      throw new Error(`edits[${index}]: invalid oldText/newText or text limit exceeded.`);
    }
    payloadBytes += Buffer.byteLength(edit.oldText, "utf8") + Buffer.byteLength(edit.newText, "utf8");
    if (batch && payloadBytes > MAX_WRITE_BYTES) throw new Error("Replacement payload exceeds the 16 MiB UTF-8 limit.");
  }
  const requestedPath = await resolveAuthorizedWorkstationPath(input.context, input.path);
  const target = await resolveWriteTarget(requestedPath);
  if (!target.exists) throw new Error(`File does not exist: ${requestedPath}`);
  const apply = async () => {
    const current = await readTextBytes(target.actualPath);
    if (current.sha256 !== input.expectedSha256) throw new Error("The file changed after it was read; no write was applied.");
    const ranges = edits.flatMap((edit, index) => {
      try {
        return replacementForCurrentText(current.text, edit.oldText, edit.newText, edit.expectedCount).map(range => ({ ...range, index }));
      } catch (error) {
        if (!batch && (edit.expectedCount ?? 1) === 1) throw new Error("oldText must occur exactly once in the current file.");
        throw new Error(`edits[${index}]: ${error instanceof Error ? error.message : "invalid replacement"}`);
      }
    }).sort((a, b) => a.start - b.start);
    const pieces: string[] = [];
    const positions: Array<{ index: number; start: number; length: number }> = [];
    let offset = 0;
    let delta = 0;
    let resultBytes = current.hasBom ? 3 : 0;
    for (const [index, range] of ranges.entries()) {
      if (range.start < offset) throw new Error(`edits[${ranges[index - 1]!.index}] overlaps edits[${range.index}].`);
      const gap = current.text.slice(offset, range.start);
      resultBytes += Buffer.byteLength(gap, "utf8") + Buffer.byteLength(range.replacement, "utf8");
      if (resultBytes > MAX_WRITE_BYTES) throw new Error(`Edited file exceeds the ${MAX_WRITE_BYTES}-byte tool limit.`);
      pieces.push(gap, range.replacement);
      positions.push({ index: range.index, start: range.start + delta, length: range.replacement.length });
      delta += range.replacement.length - (range.end - range.start);
      offset = range.end;
    }
    pieces.push(current.text.slice(offset));
    const updated = pieces.join("");
    const updatedBytes = encodeUtf8(updated, current.hasBom);
    if (updatedBytes.byteLength > MAX_WRITE_BYTES) throw new Error(`Edited file exceeds the ${MAX_WRITE_BYTES}-byte tool limit.`);
    let cursor = 0;
    let line = 1;
    const lineAt = (position: number) => {
      while (cursor < position) {
        if (updated[cursor] === "\n" || (updated[cursor] === "\r" && updated[cursor + 1] !== "\n")) line++;
        cursor++;
      }
      return line;
    };
    const outputRanges = positions.map(position => {
      const startLine = lineAt(position.start);
      return { index: position.index, startLine, endLine: position.length ? lineAt(position.start + position.length - 1) : startLine - 1 };
    }).sort((a, b) => a.index - b.index);
    if (!input.dryRun) await atomicReplace(target.actualPath, updatedBytes, input.expectedSha256);
    capture?.(updatedBytes);
    return {
      path: requestedPath,
      previousSha256: input.expectedSha256,
      sha256: sha256(updatedBytes),
      byteLength: updatedBytes.byteLength,
      editsApplied: edits.length,
      replacementsApplied: ranges.length,
      ranges: outputRanges,
      dryRun: input.dryRun ?? false,
    };
  };
  return input.dryRun ? apply() : withTargetWriteLease(input.context, target.actualPath, apply);
}

export function replaceText(input: Parameters<typeof replaceTextInternal>[0]) {
  return replaceTextInternal(input);
}

export type MultiEditFile = { path: string; expectedSha256: string; edits?: NonNullable<Parameters<typeof replaceTextInternal>[0]["edits"]>; content?: string };
export async function replaceTextMulti(input: { context: ProjectContext; files: readonly MultiEditFile[]; createParents?: boolean }) {
  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 10) throw new Error("Select 1 to 10 files.");
  let payload = 0;
  const targets: Array<Awaited<ReturnType<typeof resolveWriteTarget>> & { index: number; file: MultiEditFile }> = [];
  const seen = new Set<string>();
  const files: readonly MultiEditFile[] = input.files;
  for (const [index, file] of files.entries()) {
    if (!/^(?:absent|[a-f0-9]{64})$/u.test(file.expectedSha256)) throw new Error(`files[${index}]: invalid expectedSha256`);
    if (file.expectedSha256 === "absent" ? typeof file.content !== "string" || file.edits !== undefined : file.content !== undefined || !Array.isArray(file.edits)) throw new Error(`files[${index}]: invalid edit form`);
    payload += file.content === undefined ? file.edits!.reduce((sum, edit) => sum + Buffer.byteLength(edit.oldText) + Buffer.byteLength(edit.newText), 0) : Buffer.byteLength(file.content);
    if (payload > MAX_WRITE_BYTES) throw new Error("Multi-edit payload exceeds 16 MiB.");
    const path = await resolveAuthorizedWorkstationPath(input.context, file.path);
    const target = await resolveWriteTarget(path);
    const key = normalizePathForComparison(target.actualPath);
    if (seen.has(key)) throw new Error("Duplicate actual file path.");
    seen.add(key);
    targets.push({ ...target, index, file });
  }
  targets.sort((a, b) => normalizePathForComparison(a.actualPath).localeCompare(normalizePathForComparison(b.actualPath)));
  const operationId = randomUUID();
  const run = async () => {
    const plans = [];
    for (const target of targets) {
      let bytes: Buffer | undefined;
      let original: Buffer | undefined;
      let result;
      try {
        if (target.file.expectedSha256 === "absent") {
          if ((await resolveWriteTarget(target.actualPath)).exists) throw new Error("File already exists.");
          bytes = Buffer.from(target.file.content!, "utf8");
          result = { path: target.requestedPath, previousSha256: null, sha256: sha256(bytes), byteLength: bytes.length, editsApplied: 0, replacementsApplied: 0, ranges: [] };
        } else {
          result = await replaceTextInternal({ context: input.context, path: target.actualPath, expectedSha256: target.file.expectedSha256,
            edits: target.file.edits, dryRun: true }, value => { bytes = value; });
          original = (await readTextBytes(target.actualPath)).bytes;
          if (sha256(original) !== target.file.expectedSha256) throw new Error("File changed during preparation.");
        }
      } catch (error) { throw new Error(`files[${target.index}]: ${errorMessage(error)}`); }
      if (!bytes || bytes.length > MAX_WRITE_BYTES) throw new Error("Prepared file exceeds the write limit.");
      plans.push({ ...target, bytes, original, result, temporaryPath: resolve(dirname(target.actualPath), `.workforge-multi-${operationId}-${target.index}.tmp`) });
    }
    let journalRoot = input.context.engineRoot;
    for (const segment of ["runtime", "multi-edit", operationId]) {
      journalRoot = resolve(journalRoot, segment);
      try { await mkdir(journalRoot); } catch (error) { if (errorCode(error) !== "EEXIST") throw error; }
      const info = await lstat(journalRoot);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe multi-edit journal directory.");
    }
    const applied: typeof plans = [];
    const createdDirectories: string[] = [];
    let committed = false;
    const publicationWarnings: Array<{ path: string; code: "exclusive_write_fallback" }> = [];
    try {
      for (const plan of plans) {
        if (plan.original) await writeFile(resolve(journalRoot, `${plan.index}.orig`), plan.original, { flag: "wx", mode: 0o600 });
      }
      await writeFile(resolve(journalRoot, "journal.json"), JSON.stringify(plans.map(plan => ({ index: plan.index, path: plan.actualPath,
        previousSha256: plan.result.previousSha256, sha256: plan.result.sha256 }))), { flag: "wx", mode: 0o600 });
      if (input.createParents) for (const plan of plans.filter(plan => !plan.original)) {
        const parent = dirname(plan.actualPath);
        const missing: string[] = [];
        let current = parent;
        while (!(await lstat(current).catch(error => { if (errorCode(error) === "ENOENT") return undefined; throw error; }))) {
          missing.push(current);
          const next = dirname(current);
          if (next === current) throw new Error("Cannot resolve patch parent directory.");
          current = next;
        }
        for (const directory of missing.reverse()) {
          try { await mkdir(directory); createdDirectories.push(directory); }
          catch (error) { if (errorCode(error) !== "EEXIST") throw error; }
        }
        if (!isSamePath(await realpath(dirname(plan.requestedPath)), parent)) throw new Error("Patch parent changed during creation.");
        await resolveAuthorizedWorkstationPath(input.context, plan.requestedPath);
      }
      for (const plan of plans) {
        const handle = await open(plan.temporaryPath, "wx", 0o600);
        try { await handle.writeFile(plan.bytes); await handle.sync(); } finally { await handle.close(); }
        if (plan.original && process.platform !== "win32") await chmod(plan.temporaryPath, (await stat(plan.actualPath)).mode & 0o7777);
      }
      for (const plan of plans) {
        if (plan.original) {
          if ((await readTextBytes(plan.actualPath)).sha256 !== plan.file.expectedSha256) throw new Error("File changed before commit.");
        } else if ((await resolveWriteTarget(plan.actualPath)).exists) throw new Error("New file appeared before commit.");
      }
      for (const plan of plans) {
        if (plan.original) {
          if ((await readTextBytes(plan.actualPath)).sha256 !== plan.file.expectedSha256) throw new Error("File changed during commit.");
          await rename(plan.temporaryPath, plan.actualPath);
        } else {
          // Exclusive creation avoids rename overwriting a file created by another process.
          try { await link(plan.temporaryPath, plan.actualPath); }
          catch (error) {
            if (!["EPERM", "ENOTSUP", "EXDEV", "EOPNOTSUPP"].includes(errorCode(error) ?? "")) throw error;
            await writeNewFileExclusive(plan.actualPath, plan.bytes);
            publicationWarnings.push({ path: plan.requestedPath, code: "exclusive_write_fallback" });
          }
          applied.push(plan);
          await rm(plan.temporaryPath);
          continue;
        }
        applied.push(plan);
      }
      committed = true;
    } catch (error) {
      let rollback = "complete";
      for (const plan of applied.reverse()) {
        try {
          if (plan.original) await atomicReplace(plan.actualPath, plan.original, plan.result.sha256);
          else {
            if ((await readTextBytes(plan.actualPath)).sha256 !== plan.result.sha256) throw new Error("New file changed.");
            await rm(plan.actualPath);
          }
        } catch { rollback = "failed"; }
      }
      throw new Error(`MULTI_EDIT_FAILED: rollback=${rollback}; journal=${journalRoot}; ${errorMessage(error)}. After inspection, remove any leftover .workforge-multi-*.tmp link to restore nlink=1; never replay automatically.`);
    } finally {
      for (const plan of plans) await rm(plan.temporaryPath, { force: true }).catch(() => undefined);
      if (!committed) for (const directory of createdDirectories.reverse()) await rmdir(directory).catch(() => undefined);
    }
    let cleanupWarning: string | null = null;
    try { await rm(journalRoot, { recursive: true }); }
    catch { cleanupWarning = "journal_cleanup_failed"; }
    return { operationId, cleanupWarning, journalPath: cleanupWarning ? journalRoot : null, publicationWarnings,
      files: plans.sort((a, b) => a.index - b.index).map(({ result }) => {
      const { path, previousSha256, sha256, byteLength, editsApplied, replacementsApplied, ranges } = result;
      return { path, previousSha256, sha256, byteLength, editsApplied, replacementsApplied, ranges };
    }) };
  };
  const lease = (index: number): ReturnType<typeof run> => index === targets.length ? run()
    : withTargetWriteLease(input.context, targets[index]!.actualPath, () => lease(index + 1));
  return lease(0);
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
