import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isPathWithinOrEqual, isSamePath, normalizePathForComparison } from "./path-policy.js";

const MAX_PROFILE_BYTES = 256 * 1024;
const MAX_REGISTRY_BYTES = 256 * 1024;
const MAX_MARKER_BYTES = 1024 * 1024;
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENGINE_ROOT = resolve(MODULE_DIRECTORY, "..");
const PROJECT_CONFIG_DIRECTORY = "workforge-mcp";
const PROJECT_TOOLS_DIRECTORY = "tools";
const REGISTRY_ENVIRONMENT_KEY = "WORKFORGE_MCP_PROFILE_REGISTRY";

const workForgeContractSchema = z.object({
  schemaVersion: z.literal(1),
  profileRegistry: z.object({
    schemaVersion: z.literal(1),
    maxProfiles: z.number().int().min(1).max(1024),
  }).strict(),
  profile: z.object({
    idPattern: z.string().min(1).max(512),
    maxIdLength: z.number().int().min(1).max(128),
    maxDisplayNameLength: z.number().int().min(1).max(512),
  }).strict(),
}).strict();

const WORKFORGE_CONTRACT = workForgeContractSchema.parse(JSON.parse(
  readFileSync(resolve(DEFAULT_ENGINE_ROOT, "workforge-contract.json"), "utf8"),
) as unknown);
const PROFILE_ID_PATTERN = new RegExp(WORKFORGE_CONTRACT.profile.idPattern, "u");
const MAX_PROFILE_ID_LENGTH = WORKFORGE_CONTRACT.profile.maxIdLength;
const MAX_PROFILE_DISPLAY_NAME_LENGTH = WORKFORGE_CONTRACT.profile.maxDisplayNameLength;
const MAX_PROFILES = WORKFORGE_CONTRACT.profileRegistry.maxProfiles;

function isValidProfileId(value: string): boolean {
  return value.length <= MAX_PROFILE_ID_LENGTH && PROFILE_ID_PATTERN.test(value);
}

const profileRelativePathSchema = z.string().trim().min(1).max(1024);

const profileSchema = z.object({
  id: z.string().max(MAX_PROFILE_ID_LENGTH).regex(PROFILE_ID_PATTERN),
  displayName: z.string().trim().min(1).max(MAX_PROFILE_DISPLAY_NAME_LENGTH),
  appName: z.string().trim().min(1).max(MAX_PROFILE_DISPLAY_NAME_LENGTH),
  serverName: z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/),
  defaultWorkingDirectoryRelative: profileRelativePathSchema,
  httpPort: z.number().int().min(1024).max(65_535).optional(),
  bootstrapFiles: z.array(profileRelativePathSchema).max(32),
  identityMarkers: z.array(z.object({
    relativePath: profileRelativePathSchema,
    expectedLiteral: z.string().min(1).max(4096),
  }).strict()).min(1).max(8),
}).strict();

const registryEntrySchema = z.object({
  id: z.string().max(MAX_PROFILE_ID_LENGTH).regex(PROFILE_ID_PATTERN),
  profilePath: z.string().min(1).max(2048),
  profileSha256: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

const registrySchema = z.object({
  version: z.literal(WORKFORGE_CONTRACT.profileRegistry.schemaVersion),
  profiles: z.array(registryEntrySchema).min(1).max(MAX_PROFILES),
}).strict();

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type ProjectProfile = DeepReadonly<z.infer<typeof profileSchema> & { primaryRoot: string }>;

export interface ManagedProjectRoot {
  readonly profileId: string;
  readonly primaryRoot: string;
}

export interface ProjectContext {
  readonly profile: ProjectProfile;
  readonly primaryRoot: string;
  readonly defaultWorkingDirectory: string;
  readonly engineRoot: string;
  readonly managedProjectRoots: readonly ManagedProjectRoot[];
}

export interface ProfileLoadOptions {
  readonly registryPath?: string;
  readonly engineRoot?: string;
}

function normalizeProfileRelativePath(rawPath: string, allowCurrentDirectory = false): string {
  const normalized = rawPath.replaceAll("\\", "/");
  if (allowCurrentDirectory && normalized === ".") return normalized;
  if (
    rawPath.trim() !== rawPath ||
    normalized.length === 0 ||
    normalized.includes("\0") ||
    isAbsolute(rawPath) ||
    /^[A-Za-z]:/.test(rawPath) ||
    normalized.startsWith("/")
  ) {
    throw new Error(`Profile path is not a normalized relative path: ${rawPath}`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Profile path is not a normalized relative path: ${rawPath}`);
  }
  return segments.join("/");
}

function assertUnique(values: readonly string[], label: string): void {
  const normalized = values.map((value) => value.toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): DeepReadonly<T> {
  if (value === null || typeof value !== "object") return value as DeepReadonly<T>;
  if (seen.has(value)) return value as DeepReadonly<T>;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value) as DeepReadonly<T>;
}

interface TrustedRegistryEntry {
  readonly id: string;
  readonly profilePath: string;
  readonly profileSha256: string;
  readonly primaryRoot: string;
}

interface TrustedRegistry {
  readonly engineRoot: string;
  readonly entries: readonly TrustedRegistryEntry[];
}

function defaultRegistryPath(engineRoot: string): string {
  return resolve(engineRoot, "runtime", "profile_registry.json");
}

async function readBoundedJsonFile(path: string, maxBytes: number, label: string): Promise<{ bytes: Buffer; value: unknown }> {
  const info = await lstat(path).catch(() => undefined);
  if (!info || !info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > maxBytes) {
    throw new Error(`${label} is missing or unsafe.`);
  }
  const bytes = await readFile(path);
  if (bytes.includes(0)) throw new Error(`${label} is not UTF-8 text.`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { bytes, value: JSON.parse(text) as unknown };
}

async function loadTrustedRegistry(options: ProfileLoadOptions): Promise<TrustedRegistry> {
  const engineRoot = await realpath(resolve(options.engineRoot ?? DEFAULT_ENGINE_ROOT));
  const configuredRegistryPath = options.registryPath ?? process.env[REGISTRY_ENVIRONMENT_KEY];
  if (configuredRegistryPath !== undefined && !isAbsolute(configuredRegistryPath)) {
    throw new Error(`${REGISTRY_ENVIRONMENT_KEY} must be an absolute path.`);
  }
  const requestedRegistryPath = resolve(configuredRegistryPath ?? defaultRegistryPath(engineRoot));
  const { value } = await readBoundedJsonFile(requestedRegistryPath, MAX_REGISTRY_BYTES, "Project profile registry");
  const parsed = registrySchema.parse(value);
  assertUnique(parsed.profiles.map((entry) => entry.id), "profile registry ids");
  assertUnique(parsed.profiles.map((entry) => entry.profilePath), "profile registry paths");

  const entries = await Promise.all(parsed.profiles.map(async (entry) => {
    if (!isAbsolute(entry.profilePath)) throw new Error(`Profile registry path must be absolute: ${entry.id}`);
    const profilePath = resolve(entry.profilePath);
    const primaryRoot = await realpath(derivePrimaryRoot(profilePath, entry.id));
    return deepFreeze({
      id: entry.id,
      profilePath,
      profileSha256: entry.profileSha256.toLocaleLowerCase("en-US"),
      primaryRoot,
    });
  }));
  assertUnique(entries.map((entry) => entry.primaryRoot), "profile registry project roots");
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex]!;
      const right = entries[rightIndex]!;
      if (isPathWithinOrEqual(left.primaryRoot, right.primaryRoot) || isPathWithinOrEqual(right.primaryRoot, left.primaryRoot)) {
        throw new Error(`Managed project roots must not overlap: ${left.id}, ${right.id}`);
      }
    }
  }
  return deepFreeze({ engineRoot, entries });
}

function derivePrimaryRoot(profilePath: string, profileId: string): string {
  const configDirectory = dirname(profilePath);
  const toolsDirectory = dirname(configDirectory);
  if (
    normalizePathForComparison(basename(configDirectory)) !== normalizePathForComparison(PROJECT_CONFIG_DIRECTORY) ||
    normalizePathForComparison(basename(toolsDirectory)) !== normalizePathForComparison(PROJECT_TOOLS_DIRECTORY) ||
    normalizePathForComparison(basename(profilePath)) !== normalizePathForComparison("profile.json")
  ) {
    throw new Error(`Project profile ${profileId} must live at tools/${PROJECT_CONFIG_DIRECTORY}/profile.json.`);
  }
  return dirname(toolsDirectory);
}

async function readRegisteredProfile(
  profileId: string,
  registry: TrustedRegistry,
): Promise<{ parsed: z.infer<typeof profileSchema>; primaryRoot: string }> {
  if (!isValidProfileId(profileId)) throw new Error(`Invalid project profile id: ${profileId}`);
  const entry = registry.entries.find((candidate) => candidate.id === profileId);
  if (!entry) throw new Error(`Unknown project profile: ${profileId}`);

  const requestedProfilePath = resolve(entry.profilePath);
  const { bytes, value } = await readBoundedJsonFile(
    requestedProfilePath,
    MAX_PROFILE_BYTES,
    `Project profile ${profileId}`,
  );
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  if (actualSha256 !== entry.profileSha256) throw new Error(`Project profile SHA-256 mismatch: ${profileId}`);

  const profilePath = await realpath(requestedProfilePath);
  const primaryRoot = await realpath(derivePrimaryRoot(profilePath, profileId));
  if (!isSamePath(primaryRoot, entry.primaryRoot)) {
    throw new Error(`Project profile ${profileId} no longer matches its registered project root.`);
  }
  const expectedProfilePath = resolve(primaryRoot, PROJECT_TOOLS_DIRECTORY, PROJECT_CONFIG_DIRECTORY, "profile.json");
  if (!isSamePath(profilePath, expectedProfilePath)) {
    throw new Error(`Project profile ${profileId} escaped its canonical project-local path.`);
  }
  const parsed = profileSchema.parse(value);
  if (parsed.id !== profileId) throw new Error(`Profile file id does not match requested id ${profileId}.`);
  return { parsed, primaryRoot };
}

export function parseProfileId(argv: readonly string[]): string {
  let selected: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    let value: string;
    if (argument === "--profile") {
      value = argv[index + 1] ?? "";
      index += 1;
    } else if (argument.startsWith("--profile=")) {
      value = argument.slice("--profile=".length);
    } else {
      throw new Error(`Unknown MCP bridge argument: ${argument}`);
    }
    if (selected !== undefined) throw new Error("Specify exactly one --profile option.");
    if (!isValidProfileId(value)) throw new Error(`Invalid project profile id: ${value || "<empty>"}`);
    selected = value;
  }
  if (selected === undefined) throw new Error("Specify exactly one --profile option.");
  return selected;
}

export async function listKnownProfileIds(options: ProfileLoadOptions = {}): Promise<readonly string[]> {
  const registry = await loadTrustedRegistry(options);
  return Object.freeze(registry.entries.map((entry) => entry.id).sort((left, right) => left.localeCompare(right, "en")));
}

export async function loadProjectProfile(profileId: string, options: ProfileLoadOptions = {}): Promise<ProjectContext> {
  const registry = await loadTrustedRegistry(options);
  const { parsed, primaryRoot } = await readRegisteredProfile(profileId, registry);
  const defaultRelative = normalizeProfileRelativePath(parsed.defaultWorkingDirectoryRelative, true);
  const defaultWorkingDirectory = await realpath(resolve(primaryRoot, ...defaultRelative.split("/")));
  const defaultInfo = await stat(defaultWorkingDirectory);
  if (!defaultInfo.isDirectory() || !isPathWithinOrEqual(primaryRoot, defaultWorkingDirectory)) {
    throw new Error(`Project profile ${profileId} has an invalid default working directory.`);
  }

  const bootstrapFiles = parsed.bootstrapFiles.map((path) => normalizeProfileRelativePath(path));
  assertUnique(bootstrapFiles, "bootstrapFiles");
  const identityMarkers = [] as Array<{ relativePath: string; expectedLiteral: string }>;
  for (const marker of parsed.identityMarkers) {
    const relativePath = normalizeProfileRelativePath(marker.relativePath);
    const absolutePath = await realpath(resolve(primaryRoot, ...relativePath.split("/")));
    if (!isPathWithinOrEqual(primaryRoot, absolutePath)) throw new Error(`Identity marker escapes project root: ${relativePath}`);
    const markerInfo = await stat(absolutePath);
    if (!markerInfo.isFile() || markerInfo.size > MAX_MARKER_BYTES) {
      throw new Error(`Identity marker is not a bounded file: ${relativePath}`);
    }
    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) throw new Error(`Identity marker is not UTF-8 text: ${relativePath}`);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.includes(marker.expectedLiteral)) throw new Error(`Identity marker mismatch for ${profileId}: ${relativePath}`);
    identityMarkers.push({ relativePath, expectedLiteral: marker.expectedLiteral });
  }
  assertUnique(identityMarkers.map((marker) => marker.relativePath), "identityMarkers");

  const profile = deepFreeze({
    ...parsed,
    primaryRoot,
    defaultWorkingDirectoryRelative: defaultRelative,
    bootstrapFiles,
    identityMarkers,
  }) as ProjectProfile;
  const managedProjectRoots = registry.entries.map((entry) => ({
    profileId: entry.id,
    primaryRoot: entry.primaryRoot,
  }));
  return deepFreeze({
    profile,
    primaryRoot,
    defaultWorkingDirectory,
    engineRoot: registry.engineRoot,
    managedProjectRoots,
  }) as ProjectContext;
}

export async function loadProjectContextFromArgv(
  argv: readonly string[] = process.argv.slice(2),
  options: ProfileLoadOptions = {},
): Promise<ProjectContext> {
  return await loadProjectProfile(parseProfileId(argv), options);
}
