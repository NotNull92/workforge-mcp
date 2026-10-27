import { open, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { ProjectContext } from "./profile.js";
import { resolveAuthorizedWorkstationPath } from "./workstation.js";

export async function readTextStream(input: { context: ProjectContext; path: string; startLine?: number;
  maxLines?: number; maxCharacters?: number; maxScanBytes?: number; signal?: AbortSignal }) {
  const startLine = input.startLine ?? 1, maxLines = input.maxLines ?? 200;
  const maxCharacters = input.maxCharacters ?? 30000, maxScanBytes = input.maxScanBytes ?? 64 * 1024 * 1024;
  for (const [value, min, max] of [[startLine, 1, 100000000], [maxLines, 1, 2000], [maxCharacters, 1024, 100000], [maxScanBytes, 65536, 256 * 1024 * 1024]]) {
    if (!Number.isInteger(value) || value! < min! || value! > max!) throw new Error("Invalid streaming read limits.");
  }
  input.signal?.throwIfAborted();
  const path = await resolveAuthorizedWorkstationPath(input.context, input.path);
  const handle = await open(path, "r");
  let scannedBytes = 0, line = 1, endLine = startLine - 1, characters = 0;
  let reachedEof = false, characterLimited = false, done = false, skipLf = false;
  const pieces: string[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const consume = (text: string) => {
    for (const character of text) {
      if (skipLf && character === "\n") { skipLf = false; continue; }
      skipLf = false;
      if (line >= startLine) {
        if (endLine < line) {
          if (endLine >= startLine) {
            if (characters >= maxCharacters) { characterLimited = true; done = true; break; }
            pieces.push("\n"); characters++;
          }
          endLine = line;
        }
        if (character !== "\r" && character !== "\n") {
          if (characters + character.length > maxCharacters) { characterLimited = true; done = true; break; }
          pieces.push(character); characters += character.length;
        }
      }
      if (character === "\r" || character === "\n") {
        skipLf = character === "\r";
        line++;
        if (line >= startLine + maxLines) { done = true; break; }
      }
    }
  };
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Streaming read requires a regular file.");
    while (!done && scannedBytes < maxScanBytes) {
      input.signal?.throwIfAborted();
      const buffer = Buffer.alloc(Math.min(65536, maxScanBytes - scannedBytes));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) { reachedEof = true; consume(decoder.decode()); break; }
      scannedBytes += bytesRead;
      let start = 0;
      while (start < bytesRead && !done) {
        const newline = buffer.indexOf(10, start);
        const end = newline < 0 || newline >= bytesRead ? bytesRead : newline + 1;
        consume(decoder.decode(buffer.subarray(start, end), { stream: true }));
        start = end;
      }
    }
    if (reachedEof && !done && line >= startLine && endLine < line) {
      if (endLine >= startLine && characters < maxCharacters) pieces.push("\n");
      else if (endLine >= startLine) characterLimited = true;
      endLine = line;
    }
  } finally { await handle.close(); }
  const scanLimited = !done && !reachedEof && scannedBytes >= maxScanBytes;
  const text = pieces.join("").replace(/[\uD800-\uDBFF]$/u, "");
  return { path, text, startLine, endLine, characterLimited, scannedBytes, reachedEof, scanLimited,
    nextStartLine: characterLimited || scanLimited ? Math.max(startLine, line) : reachedEof ? null : line,
    hashAvailable: false as const, editable: false as const };
}

export async function suggestRelatedFiles(input: { context: ProjectContext; path: string; maxSuggestions?: number }) {
  const limit = input.maxSuggestions ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Invalid maxSuggestions.");
  const path = await resolveAuthorizedWorkstationPath(input.context, input.path);
  if (!(await stat(path)).isFile()) throw new Error("Expected a file.");
  const directory = dirname(path), extension = extname(path), stem = basename(path, extension);
  const candidates: Array<{ path: string; reason: "test_pair" | "relative_import" | "same_basename" }> = [];
  const add = (path: string, reason: (typeof candidates)[number]["reason"]) => candidates.push({ path, reason });
  const base = stem.replace(/\.(test|spec)$/u, "");
  for (const location of [directory, resolve(directory, "tests"), resolve(directory, "__tests__"), resolve(directory, "..", "tests"), resolve(directory, "..", "src")]) {
    for (const suffix of ["", ".test", ".spec"]) add(resolve(location, `${base}${suffix}${extension}`), "test_pair");
  }
  if ([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py"].includes(extension)) {
    const handle = await open(path, "r");
    let text;
    try {
      const buffer = Buffer.alloc(256 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead), { stream: bytesRead === buffer.length });
    } finally { await handle.close(); }
    const imports = extension === ".py" ? [...text.matchAll(/\bfrom\s+\.(\w+(?:\.\w+)*)\s+import/gu)].map(match => `./${match[1]!.replaceAll(".", "/")}`)
      : [...text.matchAll(/\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](\.{1,2}\/[^"'\r\n]{1,1024})["']/gu)].map(match => match[1]!);
    for (const relative of imports.slice(0, 256)) {
      const target = resolve(directory, relative);
      const bare = target.replace(/\.(?:js|mjs|cjs)$/u, "");
      for (const candidate of [target, ...[".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", "/index.ts", "/index.js"].map(suffix => bare + suffix)]) add(candidate, "relative_import");
    }
  }
  for (const suffix of [".css", ".md", ".ts", ".tsx", ".js", ".json", ".html"]) add(resolve(directory, stem + suffix), "same_basename");
  const suggestions: typeof candidates = [];
  const seen = new Set([path]);
  for (const candidate of candidates) {
    try {
      const authorized = await resolveAuthorizedWorkstationPath(input.context, candidate.path);
      if (seen.has(authorized) || !(await stat(authorized)).isFile()) continue;
      seen.add(authorized);
      suggestions.push({ path: authorized, reason: candidate.reason });
      if (suggestions.length > limit) break;
    } catch { /* Nonexistent or unauthorized suggestions are omitted. */ }
  }
  return { suggestions: suggestions.slice(0, limit), truncated: suggestions.length > limit };
}
