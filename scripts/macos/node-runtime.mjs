import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseVersionParts(value, pattern, label) {
  const text = String(value ?? "").trim();
  const match = pattern.exec(text);
  if (!match) throw new Error(`${label} is invalid: ${text || "<empty>"}`);
  const parts = match.slice(1).map((part) => Number(part ?? 0));
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    throw new Error(`${label} is invalid: ${text}`);
  }
  return { text, parts };
}

export function readMinimumNodeVersion(engineRoot) {
  const packageDocument = JSON.parse(readFileSync(resolve(engineRoot, "package.json"), "utf8"));
  const requirement = packageDocument.engines?.node;
  const parsed = parseVersionParts(
    requirement,
    /^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$/u,
    "WorkForge Node.js engine requirement",
  );
  return { requirement: parsed.text, text: parsed.parts.join("."), parts: parsed.parts };
}

export function parseNodeVersion(version) {
  return parseVersionParts(
    version,
    /^v?(\d+)\.(\d+)\.(\d+)$/u,
    "Node.js version",
  );
}

export function compareNodeVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function assertSupportedNodeVersion(version, engineRoot, nodePath = "current runtime") {
  const observed = parseNodeVersion(version);
  const minimum = readMinimumNodeVersion(engineRoot);
  if (compareNodeVersions(observed.parts, minimum.parts) < 0) {
    throw new Error(
      `Node.js ${observed.text} at ${nodePath} is unsupported. `
      + `WorkForge requires Node.js ${minimum.text} or newer. `
      + "Upgrade Node.js and rerun macOS setup; reconfigure the tunnel if the Node.js path changed.",
    );
  }
  return observed.text;
}

export function readNodeVersion(nodePath) {
  try {
    return execFileSync(nodePath, ["-p", "process.versions.node"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(`Could not read the Node.js version from ${nodePath}.`);
  }
}

export function assertSupportedNodeRuntime(nodePath, engineRoot) {
  return assertSupportedNodeVersion(readNodeVersion(nodePath), engineRoot, nodePath);
}
