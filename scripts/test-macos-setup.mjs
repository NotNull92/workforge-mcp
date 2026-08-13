import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseWorkForgeContract,
  registerProfile,
  validateDisplayName,
} from "./macos/setup-support.mjs";

const fixture = mkdtempSync(resolve(tmpdir(), "workforge-macos-setup-test-"));
const registryPath = resolve(fixture, "profile_registry.json");
const supportUrl = pathToFileURL(resolve(import.meta.dirname, "macos", "setup-support.mjs")).href;
const hash = "a".repeat(64);

function entry(id) {
  return {
    id,
    profilePath: resolve(fixture, id, "tools", "workforge-mcp", "profile.json"),
    profileSha256: hash,
  };
}

function runRegistration(id) {
  const workerPath = resolve(fixture, "register-worker.mjs");
  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(process.execPath, [
      workerPath,
      registryPath,
      id,
      entry(id).profilePath,
      hash,
    ], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", rejectWorker);
    child.once("exit", code => {
      if (code === 0) resolveWorker();
      else rejectWorker(new Error(`Concurrent registration ${id} failed with ${code}: ${stderr}`));
    });
  });
}

try {
  const contract = {
    schemaVersion: 1,
    profileRegistry: { schemaVersion: 1, maxProfiles: 128 },
    profile: {
      idPattern: "^[a-z0-9]+$",
      maxIdLength: 32,
      maxDisplayNameLength: 80,
    },
  };
  assert.deepEqual(parseWorkForgeContract(contract), {
    registryVersion: 1,
    maximumProfiles: 128,
    maximumProfileIdLength: 32,
    maximumDisplayNameLength: 80,
    profileIdPattern: "^[a-z0-9]+$",
  });
  assert.throws(
    () => parseWorkForgeContract({ ...contract, schemaVersion: 2 }),
    /WorkForge contract is invalid/u,
  );
  assert.throws(
    () => parseWorkForgeContract({
      ...contract,
      profile: { ...contract.profile, maxIdLength: 129 },
    }),
    /WorkForge contract is invalid/u,
  );

  assert.equal(validateDisplayName("WorkForge Project"), "WorkForge Project");
  assert.equal(validateDisplayName("x".repeat(80)), "x".repeat(80));
  for (const invalid of ["", "   ", " leading", "trailing ", "line\nbreak", "x".repeat(81)]) {
    assert.throws(() => validateDisplayName(invalid), /display name is invalid/iu);
  }

  const malformedPath = resolve(fixture, "malformed-registry.json");
  const malformedBytes = Buffer.from("{ not-json\n", "utf8");
  writeFileSync(malformedPath, malformedBytes);
  assert.throws(() => registerProfile(malformedPath, entry("gamma")), /profile registry is invalid/iu);
  assert.deepEqual(readFileSync(malformedPath), malformedBytes);

  const invalidPath = resolve(fixture, "invalid-registry.json");
  const invalidBytes = Buffer.from('{"version":1,"profiles":[{"id":"alpha"}]}\n', "utf8");
  writeFileSync(invalidPath, invalidBytes);
  assert.throws(() => registerProfile(invalidPath, entry("gamma")), /profile registry is invalid/iu);
  assert.deepEqual(readFileSync(invalidPath), invalidBytes);

  writeFileSync(registryPath, `${JSON.stringify({
    version: 1,
    profiles: [entry("alpha"), entry("beta")],
  }, null, 2)}\n`);
  const registryBeforeLockedSetup = readFileSync(registryPath);
  const lockPath = `${registryPath}.lock`;
  writeFileSync(lockPath, '{"pid":2147483647}\n');
  assert.throws(
    () => registerProfile(registryPath, entry("gamma")),
    /Another WorkForge setup is updating the profile registry/u,
  );
  assert.deepEqual(readFileSync(registryPath), registryBeforeLockedSetup);
  assert.equal(readFileSync(lockPath, "utf8"), '{"pid":2147483647}\n');
  rmSync(lockPath);

  writeFileSync(resolve(fixture, "register-worker.mjs"), `
    import { registerProfile } from ${JSON.stringify(supportUrl)};
    const [, , registryPath, id, profilePath, profileSha256] = process.argv;
    registerProfile(registryPath, { id, profilePath, profileSha256 });
  `);

  const concurrentIds = Array.from({ length: 12 }, (_, index) => `profile-${index}`);
  await Promise.all(concurrentIds.map(runRegistration));

  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  assert.deepEqual(
    registry.profiles.map(candidate => candidate.id).sort(),
    ["alpha", "beta", ...concurrentIds].sort(),
  );
  assert.deepEqual(
    readdirSync(fixture).filter(name => name.startsWith("profile_registry.json.")),
    [],
    "Registry update left a lock or temporary file behind.",
  );

  console.log("MACOS_SETUP_TEST_OK");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
