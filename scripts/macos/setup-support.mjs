import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { atomicWrite } from "./tunnel-common.mjs";

const engineRoot = resolve(import.meta.dirname, "..", "..");
const maximumRegistryBytes = 256 * 1024;
const lockWaitMilliseconds = 5_000;
const lockPollMilliseconds = 20;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function hasExactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isIntegerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function parseWorkForgeContract(value) {
  const registry = value?.profileRegistry;
  const profile = value?.profile;
  if (
    !hasExactKeys(value, ["schemaVersion", "profileRegistry", "profile"])
    || value.schemaVersion !== 1
    || !hasExactKeys(registry, ["schemaVersion", "maxProfiles"])
    || registry.schemaVersion !== 1
    || !isIntegerInRange(registry.maxProfiles, 1, 1024)
    || !hasExactKeys(profile, ["idPattern", "maxIdLength", "maxDisplayNameLength"])
    || typeof profile.idPattern !== "string"
    || profile.idPattern.length < 1
    || profile.idPattern.length > 512
    || !isIntegerInRange(profile.maxIdLength, 1, 128)
    || !isIntegerInRange(profile.maxDisplayNameLength, 1, 512)
  ) {
    throw new Error("WorkForge contract is invalid.");
  }
  try {
    new RegExp(profile.idPattern, "u");
  } catch {
    throw new Error("WorkForge contract is invalid.");
  }
  return {
    registryVersion: registry.schemaVersion,
    maximumProfiles: registry.maxProfiles,
    maximumProfileIdLength: profile.maxIdLength,
    maximumDisplayNameLength: profile.maxDisplayNameLength,
    profileIdPattern: profile.idPattern,
  };
}

const contract = parseWorkForgeContract(JSON.parse(
  readFileSync(resolve(engineRoot, "workforge-contract.json"), "utf8"),
));
const {
  registryVersion,
  maximumProfiles,
  maximumProfileIdLength,
  maximumDisplayNameLength,
} = contract;
const profileIdPattern = new RegExp(contract.profileIdPattern, "u");

function hasCode(error, code) {
  return error && typeof error === "object" && "code" in error && error.code === code;
}

function invalidRegistry(cause) {
  return new Error("Existing profile registry is invalid.", { cause });
}

function validateEntry(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw invalidRegistry();
  }
  if (
    Object.keys(candidate).sort().join(",") !== "id,profilePath,profileSha256"
    || typeof candidate.id !== "string"
    || candidate.id.length > maximumProfileIdLength
    || !profileIdPattern.test(candidate.id)
    || typeof candidate.profilePath !== "string"
    || candidate.profilePath.length < 1
    || candidate.profilePath.length > 2048
    || !isAbsolute(candidate.profilePath)
    || typeof candidate.profileSha256 !== "string"
    || !/^[a-f0-9]{64}$/iu.test(candidate.profileSha256)
  ) {
    throw invalidRegistry();
  }
}

function validateRegistry(registry) {
  if (
    !registry
    || typeof registry !== "object"
    || Array.isArray(registry)
    || Object.keys(registry).sort().join(",") !== "profiles,version"
    || registry.version !== registryVersion
    || !Array.isArray(registry.profiles)
    || registry.profiles.length < 1
    || registry.profiles.length > maximumProfiles
  ) {
    throw invalidRegistry();
  }
  for (const candidate of registry.profiles) validateEntry(candidate);
  const ids = registry.profiles.map(candidate => candidate.id.toLocaleLowerCase("en-US"));
  const paths = registry.profiles.map(candidate => candidate.profilePath.toLocaleLowerCase("en-US"));
  if (new Set(ids).size !== ids.length || new Set(paths).size !== paths.length) {
    throw invalidRegistry();
  }
  return registry;
}

function readRegistry(registryPath) {
  let info;
  try {
    info = lstatSync(registryPath);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return { version: registryVersion, profiles: [] };
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > maximumRegistryBytes) {
    throw invalidRegistry();
  }
  const bytes = readFileSync(registryPath);
  if (bytes.includes(0)) throw invalidRegistry();
  try {
    return validateRegistry(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch (error) {
    if (error instanceof Error && error.message === "Existing profile registry is invalid.") throw error;
    throw invalidRegistry(error);
  }
}

function acquireRegistryLock(lockPath) {
  const deadline = Date.now() + lockWaitMilliseconds;
  while (true) {
    try {
      const handle = openSync(lockPath, "wx", 0o600);
      try {
        writeFileSync(handle, `${JSON.stringify({ pid: process.pid })}\n`);
        return handle;
      } catch (error) {
        closeSync(handle);
        rmSync(lockPath, { force: true });
        throw error;
      }
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      if (Date.now() >= deadline) {
        throw new Error("Another WorkForge setup is updating the profile registry.");
      }
      Atomics.wait(sleepBuffer, 0, 0, lockPollMilliseconds);
    }
  }
}

export function validateDisplayName(value) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximumDisplayNameLength
    || value.trim() !== value
    || [...value].some(character => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new Error("WorkForge display name is invalid.");
  }
  return value;
}

export function registerProfile(registryPath, entry) {
  validateEntry(entry);
  const lockPath = `${registryPath}.lock`;
  const lockHandle = acquireRegistryLock(lockPath);
  try {
    const registry = readRegistry(registryPath);
    const updated = {
      version: registryVersion,
      profiles: [...registry.profiles.filter(candidate => candidate.id !== entry.id), entry],
    };
    validateRegistry(updated);
    atomicWrite(registryPath, `${JSON.stringify(updated, null, 2)}\n`);
  } finally {
    try {
      closeSync(lockHandle);
    } finally {
      rmSync(lockPath, { force: true });
    }
  }
}
