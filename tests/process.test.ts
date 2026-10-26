import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeWorkstationEnvironment, runProcess } from "../src/process.js";

const temporaryRoots: string[] = [];
const originalRipgrepPath = process.env["WORKFORGE_RIPGREP_PATH"];

describe("bounded subprocess execution", { timeout: 15_000 }, () => {
  it("stops a live process when the callback has enough output", async () => {
    let pid = 0;
    const startedAt = Date.now();
    const result = await runProcess(process.execPath, ["-e", "console.log(process.pid); setInterval(()=>console.log('more'),20)"], {
      cwd: tmpdir(), timeoutMs: 10_000,
      onStdoutChunk: (chunk) => { pid = Number(chunk.toString().split("\n")[0]); return true; },
    });
    expect(result.stopReason).toBe("callback");
    expect(result.stdout).toBe("");
    expect(result.timedOut).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("caps callback bytes and gives an in-budget callback stop priority", async () => {
    let received = "";
    const result = await runProcess(process.execPath, ["-e", "process.stdout.write('abcdefgh'); setInterval(()=>{},1000)"], {
      cwd: tmpdir(), maxStdoutBytes: 4, stopOnOutputLimit: true,
      onStdoutChunk: (chunk) => { received += chunk.toString(); return true; },
    });
    expect(received).toBe("abcd");
    expect(result.stopReason).toBe("callback");
    expect(result.truncated).toBe(true);
    const capped = await runProcess(process.execPath, ["-e", "process.stderr.write('abcdefgh'); setInterval(()=>{},1000)"], {
      cwd: tmpdir(), maxStderrBytes: 4, stopOnOutputLimit: true,
    });
    expect(capped.stopReason).toBe("output_limit");
    expect(capped.stderr).toBe("abcd");
  });

  it("settles callback exceptions and aborts without leaving their children alive", async () => {
    let pid = 0;
    await expect(runProcess(process.execPath, ["-e", "console.log(process.pid); setInterval(()=>{},1000)"], {
      cwd: tmpdir(), onStdoutChunk: (chunk) => { pid = Number(chunk.toString().trim()); throw new Error("callback failed"); },
    })).rejects.toThrow("callback failed");
    expect(() => process.kill(pid, 0)).toThrow();
    await expect(runProcess(process.execPath, ["-e", "console.log('ready')"], {
      cwd: tmpdir(), onStdoutChunk: () => { throw undefined; },
    })).rejects.toThrow("Process output callback failed");
    const controller = new AbortController();
    await expect(runProcess(process.execPath, ["-e", "console.log(process.pid); setInterval(()=>{},1000)"], {
      cwd: tmpdir(), signal: controller.signal, onStdoutChunk: (chunk) => { pid = Number(chunk.toString().trim()); controller.abort(); return false; },
    })).rejects.toThrow();
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("reports a timeout and preserves ordinary capture behavior", async () => {
    const timeout = await runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { cwd: tmpdir(), timeoutMs: 100 });
    expect(timeout).toMatchObject({ timedOut: true, stopReason: "timeout" });
    const normal = await runProcess(process.execPath, ["-e", "console.log('normal')"], { cwd: tmpdir() });
    expect(normal).toMatchObject({ stdout: "normal\n", exitCode: 0, stopReason: null, killConfirmed: true });
    await expect(runProcess("workforge-nonexistent-test-executable", [], { cwd: tmpdir() })).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")("bounds settlement when SIGTERM is ignored", async () => {
    const result = await runProcess(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"], {
      cwd: tmpdir(), onStdoutChunk: () => true, timeoutMs: 10_000,
    });
    expect(result.stopReason).toBe("callback");
    expect(result.killConfirmed).toBe(false);
  });
});

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
