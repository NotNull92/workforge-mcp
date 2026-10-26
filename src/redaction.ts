import { isAbsolute } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";
import { readBoundedArchiveFile } from "./archive.js";

export const REDACTION_MARKER = "[WORKFORGE_REDACTED]";

export interface RedactionOptions { extraKeyNames?: readonly string[]; entropy?: boolean }

export function createLineRedactor(redact: ReturnType<typeof createRedactor>) {
  const decoder = new StringDecoder("utf8");
  let pending = "", bytes = 0, pem = false, oversized = false;
  let suppressedLongLines = 0;
  const transform = (chunk: Buffer, final = false) => {
    const output: string[] = [];
    const flush = () => {
      const begins = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/u.test(pending);
      const ends = /-----END (?:[A-Z]+ )*PRIVATE KEY-----/u.test(pending);
      if (oversized) { if (pending.endsWith("\n")) output.push("\n"); }
      else output.push(pem || begins ? pending.replace(/[^\r\n]+/gu, REDACTION_MARKER) : redact(pending).value);
      pem = (pem || begins) && !ends;
      pending = ""; bytes = 0; oversized = false;
    };
    for (const character of decoder.write(chunk) + (final ? decoder.end() : "")) {
      if (!oversized) { pending += character; bytes += Buffer.byteLength(character); }
      if (bytes > 65536) {
        suppressedLongLines++;
        // Oversized lines are suppressed completely so forced boundaries cannot leak split tokens.
        pem ||= /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/u.test(pending);
        output.push(REDACTION_MARKER); pending = ""; bytes = 0; oversized = true;
      }
      if (character === "\n") { if (oversized) pending = "\n"; flush(); }
    }
    if (final && (pending || oversized)) flush();
    return Buffer.from(output.join(""), "utf8");
  };
  return Object.assign(transform, { getSuppressedLongLines: () => suppressedLongLines });
}

export function loadRedactionRules(path: string | undefined, knownSecrets: readonly string[]) {
  if (path === undefined) return { knownSecrets: [...knownSecrets], extraKeyNames: [], customLiterals: 0 };
  try {
    if (!isAbsolute(path)) throw new Error("absolute path required");
    const rule = z.object({ version: z.literal(1), literals: z.array(z.string().min(8).max(4096)).max(256),
      keyNames: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{1,63}$/u)).max(64) }).strict()
      .parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(readBoundedArchiveFile(path, 65536, "Redaction rules"))));
    const combined = [...new Set([...knownSecrets, ...rule.literals])];
    createRedactor(combined, { extraKeyNames: rule.keyNames });
    return { knownSecrets: combined, extraKeyNames: [...new Set(rule.keyNames)], customLiterals: new Set(rule.literals).size };
  } catch { throw new Error("WORKFORGE_MCP_REDACTION_RULES must name an absolute, safe UTF-8 rules file within the configured limits."); }
}

export function snapshotSecrets(environment: NodeJS.ProcessEnv) {
  const values = new Set<string>();
  let bytes = 0;
  let skipped = 0;
  for (const [name, value] of Object.entries(environment)) {
    if (!/(?:^|_)(?:TOKEN|SECRET|PASSWORD|PASSWD|KEY|PAT|CREDENTIALS?|AUTH)(?:_|$)/iu.test(name)
      || /_(?:PATH|DIR|FILE|HOME|SOCK)$/iu.test(name) || !value || value.length < 8
      || /^(?:[/\\]|~[/\\]|[a-z]:[/\\])/iu.test(value) || values.has(value)) continue;
    const length = Buffer.byteLength(value, "utf8");
    if (values.size >= 256 || value.length > 4096 || bytes + length > 64 * 1024) { skipped += 1; continue; }
    values.add(value);
    bytes += length;
  }
  return { values: [...values], skipped };
}

export function containsRedactionMarker(value: unknown): boolean {
  if (typeof value === "string") return value.includes(REDACTION_MARKER);
  if (value && typeof value === "object") return Object.values(value).some(containsRedactionMarker);
  return false;
}

export function createRedactor(knownSecrets: readonly string[] = [], options: RedactionOptions = {}) {
  const keys = options.extraKeyNames ?? [];
  if (keys.length > 64 || keys.some(key => !/^[A-Za-z][A-Za-z0-9_-]{1,63}$/u.test(key))) throw new Error("Invalid custom redaction key names.");
  const customAssignments = keys.length ? new RegExp(`(\\b(?:${keys.join("|")})["']?[ \\t]*[:=][ \\t]*)("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|[^\\s,;}\\]]+)`, "giu") : undefined;
  const secrets = [...new Set(knownSecrets)].filter((value) => value.length >= 8).sort((a, b) => b.length - a.length);
  if (secrets.length > 256 || secrets.some((value) => value.length > 4096)
    || secrets.reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0) > 64 * 1024) {
    throw new Error("Known-secret snapshot exceeds its bounded size.");
  }
  const exact = secrets.length ? new RegExp(secrets.map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|"), "gu") : undefined;
  return function redact<T>(value: T): { value: T; redactionCount: number } {
    let redactionCount = 0;
    const mask = (text: string) => {
      if (text === REDACTION_MARKER) return text;
      redactionCount += 1;
      return REDACTION_MARKER;
    };
    const maskLines = (text: string) => text.replace(/[^\r\n]+/gu, mask);
    const text = (raw: string): string => {
      let result = raw.replace(/-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )*PRIVATE KEY-----|$)/gu, maskLines);
      result = result.replace(/^[\s\S]*?-----END (?:[A-Z]+ )*PRIVATE KEY-----/u, maskLines);
      if (exact) result = result.replace(exact, mask);
      // shortcut: only known-value boundary fragments are detectable; arbitrary middle pages need source-level scanning.
      for (const secret of secrets) {
        const maximum = Math.min(secret.length - 1, result.length);
        for (let length = maximum; length >= 6; length -= 1) {
          if (result.endsWith(secret.slice(0, length))) { result = result.slice(0, -length) + mask(secret.slice(0, length)); break; }
        }
        for (let length = Math.min(secret.length - 1, result.length); length >= 6; length -= 1) {
          if (result.startsWith(secret.slice(-length))) { result = mask(secret.slice(-length)) + result.slice(length); break; }
        }
      }
      result = result.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|glpat-[A-Za-z0-9_-]{16,}|sk-(?:ant-)?[A-Za-z0-9_-]{16,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/gu, mask);
      result = result.replace(/\b(Bearer[ \t]+)([^\s"',;]+)/giu, (whole, prefix: string, token: string) => token.includes(REDACTION_MARKER) ? whole : prefix + mask(token));
      result = result.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:)([^@\s/]+)(@)/giu,
        (whole, prefix: string, password: string, suffix: string) => password.includes(REDACTION_MARKER) ? whole : prefix + mask(password) + suffix);
      result = result.replace(/(\b(?:[a-z0-9]+[_-])*(?:password|passwd|token|secret|api[_-]?key|credential|credentials)["']?[ \t]*[:=][ \t]*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/giu,
        (whole, prefix: string, secret: string) => secret.includes(REDACTION_MARKER) ? whole : prefix + mask(secret));
      if (customAssignments) result = result.replace(customAssignments,
        (whole, prefix: string, secret: string) => secret.includes(REDACTION_MARKER) ? whole : prefix + mask(secret));
      if (options.entropy) result = result.replace(/(\b[A-Za-z_][A-Za-z0-9_.-]{0,63}[ \t]*[:=][ \t]*["']?)([A-Za-z0-9+/_=-]{24,512})(?![A-Za-z0-9+/_=-])/gu,
        (whole, prefix: string, value: string) => {
          if (/^(?:[a-f0-9]{40}|[a-f0-9]{64}|shell_[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/iu.test(value)) return whole;
          const counts = new Map<string, number>();
          for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
          const entropy = [...counts.values()].reduce((sum, count) => { const p = count / value.length; return sum - p * Math.log2(p); }, 0);
          return entropy >= 4 ? prefix + mask(value) : whole;
        });
      return result;
    };
    const visit = (item: unknown): unknown => {
      if (typeof item === "string") return text(item);
      if (Array.isArray(item)) return item.map(visit);
      if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
      return item;
    };
    return { value: visit(value) as T, redactionCount };
  };
}
