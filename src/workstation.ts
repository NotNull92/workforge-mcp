import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type { ProjectContext } from "./profile.js";

export const WORKSTATION_CAPABILITY = "workstation_full" as const;
export type WorkstationPathScope = "exact" | "tree";
const MAX_BOOTSTRAP_FILE_BYTES = 128 * 1024;
const MAX_BOOTSTRAP_TOTAL_BYTES = 256 * 1024;

export interface BootstrapEntry {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly content: string;
}

function normalizeForComparison(path: string): string {
  return process.platform === "win32" ? path.toLocaleLowerCase("en-US") : path;
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  const fromRoot = relative(normalizeForComparison(root), normalizeForComparison(candidate));
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function loadBootstrapEntries(context: ProjectContext): Promise<readonly BootstrapEntry[]> {
  const entries: BootstrapEntry[] = [];
  let totalBytes = 0;
  for (const relativePath of context.profile.bootstrapFiles) {
    const absolutePath = resolve(context.primaryRoot, relativePath);
    const canonicalPath = await realpath(absolutePath).catch(() => {
      throw new Error(`Configured bootstrap file is missing: ${relativePath}`);
    });
    if (!isWithinOrEqual(context.primaryRoot, canonicalPath)) {
      throw new Error(`Configured bootstrap file resolves outside the project root: ${relativePath}`);
    }
    const info = await lstat(absolutePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Configured bootstrap path is not a regular file: ${relativePath}`);
    }
    if (info.size > MAX_BOOTSTRAP_FILE_BYTES) {
      throw new Error(`Configured bootstrap file exceeds ${MAX_BOOTSTRAP_FILE_BYTES} bytes: ${relativePath}`);
    }
    totalBytes += info.size;
    if (totalBytes > MAX_BOOTSTRAP_TOTAL_BYTES) {
      throw new Error(`Configured bootstrap files exceed ${MAX_BOOTSTRAP_TOTAL_BYTES} bytes in total.`);
    }
    const bytes = await readFile(absolutePath);
    totalBytes += bytes.byteLength - info.size;
    if (bytes.byteLength > MAX_BOOTSTRAP_FILE_BYTES || totalBytes > MAX_BOOTSTRAP_TOTAL_BYTES) {
      throw new Error(`Configured bootstrap files changed while they were being read: ${relativePath}`);
    }
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    entries.push(Object.freeze({
      relativePath,
      absolutePath,
      byteLength: bytes.byteLength,
      sha256: sha256(bytes),
      content,
    }));
  }
  return Object.freeze(entries);
}

function revisionFor(profileId: string, entries: readonly BootstrapEntry[]): string {
  return sha256(JSON.stringify({
    profileId,
    files: entries.map((entry) => ({ relativePath: entry.relativePath, sha256: entry.sha256 })),
  }));
}

export async function getBootstrapContext(context: ProjectContext) {
  const entries = await loadBootstrapEntries(context);
  return {
    contextRevision: revisionFor(context.profile.id, entries),
    bootstrapEntries: entries,
  } as const;
}

export async function assertCurrentContextRevision(context: ProjectContext, suppliedRevision: string): Promise<void> {
  const current = await getBootstrapContext(context);
  if (suppliedRevision !== current.contextRevision) {
    throw new Error(
      "Project bootstrap context is missing or stale. Call workstation_context, review every bootstrapEntries item, then retry with its contextRevision.",
    );
  }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function canonicalizeExistingAncestor(path: string): Promise<string> {
  let current = path;
  const missingSegments: string[] = [];
  while (true) {
    try {
      return resolve(await realpath(current), ...missingSegments);
    } catch (error) {
      const code = errorCode(error);
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = dirname(current);
      if (parent === current) return path;
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

function assertManagedProjectBoundary(
  context: ProjectContext,
  candidate: string,
  scope: WorkstationPathScope,
): void {
  for (const managed of context.managedProjectRoots) {
    if (managed.profileId === context.profile.id) continue;
    const targetsForeignRoot = isWithinOrEqual(managed.primaryRoot, candidate);
    const treeContainsForeignRoot = scope === "tree" && isWithinOrEqual(candidate, managed.primaryRoot);
    if (targetsForeignRoot || treeContainsForeignRoot) {
      throw new Error(
        `Cross-profile path denied: ${context.profile.id} cannot access managed project ${managed.profileId}. `
        + `Use the ${managed.profileId} connector instead.`,
      );
    }
  }
}

export function resolveWorkstationPath(context: ProjectContext, rawPath = "."): string {
  if (rawPath.length === 0 || rawPath.includes("\0")) {
    throw new Error("path must be non-empty and must not contain NUL characters.");
  }
  let expanded = rawPath;
  if (rawPath === "~" || rawPath.startsWith("~/") || rawPath.startsWith("~\\")) {
    const userProfile = process.env.USERPROFILE ?? process.env.HOME;
    if (!userProfile) throw new Error("The current Windows user profile directory is unavailable.");
    expanded = rawPath === "~" ? userProfile : resolve(userProfile, rawPath.slice(2));
  }
  return resolve(isAbsolute(expanded) ? expanded : resolve(context.defaultWorkingDirectory, expanded));
}

export async function resolveAuthorizedWorkstationPath(
  context: ProjectContext,
  rawPath = ".",
  scope: WorkstationPathScope = "exact",
): Promise<string> {
  const requestedPath = resolveWorkstationPath(context, rawPath);
  assertManagedProjectBoundary(context, requestedPath, scope);
  const canonicalPath = await canonicalizeExistingAncestor(requestedPath);
  assertManagedProjectBoundary(context, canonicalPath, scope);
  return requestedPath;
}

export async function getWorkstationContext(context: ProjectContext) {
  const bootstrap = await getBootstrapContext(context);
  return {
    capability: WORKSTATION_CAPABILITY,
    profileId: context.profile.id,
    displayName: context.profile.displayName,
    appName: context.profile.appName,
    primaryRoot: context.primaryRoot,
    defaultWorkingDirectory: context.defaultWorkingDirectory,
    engineRoot: context.engineRoot,
    bootstrapFiles: [...context.profile.bootstrapFiles],
    ...bootstrap,
    platform: `${process.platform}-${process.arch}`,
    accessBoundary: "current_windows_user",
  } as const;
}
