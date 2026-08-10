import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeWorkstationEnvironment } from "../src/process.js";

const temporaryRoots: string[] = [];
const originalRipgrepPath = process.env["WORKFORGE_RIPGREP_PATH"];

afterEach(async () => {
  if (originalRipgrepPath === undefined) {
    delete process.env["WORKFORGE_RIPGREP_PATH"];
  } else {
    process.env["WORKFORGE_RIPGREP_PATH"] = originalRipgrepPath;
  }
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workstation process environment", () => {
  it("puts the verified portable ripgrep directory first on PATH", async () => {
    const root = await mkdtemp(join(tmpdir(), "workforge-process-"));
    temporaryRoots.push(root);
    const ripgrepPath = join(root, "rg.exe");
    await writeFile(ripgrepPath, "fixture", "utf8");
    process.env["WORKFORGE_RIPGREP_PATH"] = ripgrepPath;

    const environment = makeWorkstationEnvironment();

    expect(environment.PATH?.split(delimiter)[0]).toBe(dirname(ripgrepPath));
  });

  it("rejects a missing portable ripgrep executable", () => {
    process.env["WORKFORGE_RIPGREP_PATH"] = join(tmpdir(), "missing-workforge-rg.exe");

    expect(() => makeWorkstationEnvironment()).toThrow("WORKFORGE_RIPGREP_PATH");
  });
});
