import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalizeExistingAncestor,
  isPathWithinOrEqual,
  isSamePath,
  normalizePathForComparison,
} from "../src/path-policy.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("path policy", () => {
  it("distinguishes children from sibling paths that only share a prefix", async () => {
    const root = await mkdtemp(join(tmpdir(), "workforge-path-policy-"));
    temporaryRoots.push(root);
    expect(isPathWithinOrEqual(root, join(root, "child", "file.txt"))).toBe(true);
    expect(isPathWithinOrEqual(root, `${root}-backup`)).toBe(false);
  });

  it("uses Windows case-insensitive comparison semantics", () => {
    if (process.platform === "win32") {
      expect(normalizePathForComparison("C:\\WorkForge\\Project")).toBe(normalizePathForComparison("c:\\workforge\\project"));
      expect(isSamePath("C:\\WorkForge\\Project", "c:\\workforge\\project")).toBe(true);
    }
  });

  it("canonicalizes the existing ancestor while preserving missing descendants", async () => {
    const root = await mkdtemp(join(tmpdir(), "workforge-path-policy-"));
    temporaryRoots.push(root);
    const canonicalRoot = await realpath(root);
    const requested = join(root, "missing", "future.txt");
    expect(await canonicalizeExistingAncestor(requested)).toBe(join(canonicalRoot, "missing", "future.txt"));
  });
});
