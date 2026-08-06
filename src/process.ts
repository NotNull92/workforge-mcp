import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const SAFE_ENV_KEYS = new Set([
  "ALLUSERSPROFILE",
  "APPDATA",
  "ComSpec",
  "HOMEDRIVE",
  "HOMEPATH",
  "LOCALAPPDATA",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "SystemDrive",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "windir",
].map((key) => key.toLowerCase()));

export function makeSafeEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && SAFE_ENV_KEYS.has(key.toLowerCase())) {
      environment[key] = value;
    }
  }
  return { ...environment, ...extra };
}

const PRIVATE_CHILD_ENVIRONMENT_KEYS = new Set([
  "control_plane_api_key",
]);

export function makeWorkstationEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !PRIVATE_CHILD_ENVIRONMENT_KEYS.has(key.toLowerCase())) {
      environment[key] = value;
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && !PRIVATE_CHILD_ENVIRONMENT_KEYS.has(key.toLowerCase())) {
      environment[key] = value;
    }
  }
  return environment;
}

export interface ProcessResult {
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
}

export interface RunProcessOptions {
  cwd: string;
  stdin?: Buffer | string;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  env?: NodeJS.ProcessEnv;
}

function appendBounded(
  current: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike>,
  limit: number,
): { buffer: Buffer<ArrayBufferLike>; truncated: boolean } {
  if (current.byteLength >= limit) {
    return { buffer: current, truncated: true };
  }
  const remaining = limit - current.byteLength;
  if (chunk.byteLength <= remaining) {
    return { buffer: Buffer.concat([current, chunk]), truncated: false };
  }
  return { buffer: Buffer.concat([current, chunk.subarray(0, remaining)]), truncated: true };
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) {
    return;
  }
  if (process.platform === "win32") {
    const killer = spawn(
      resolveSystemExecutable("taskkill.exe"),
      ["/pid", String(child.pid), "/t", "/f"],
      { windowsHide: true, shell: false, stdio: "ignore", env: makeSafeEnvironment() },
    );
    killer.unref();
  } else {
    child.kill("SIGTERM");
  }
}

export function resolveSystemExecutable(name: "cmd.exe" | "taskkill.exe"): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  return `${systemRoot}\\System32\\${name}`;
}

export function resolvePowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  return `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

export async function runProcess(
  executable: string,
  args: readonly string[],
  options: RunProcessOptions,
): Promise<ProcessResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxStdoutBytes = options.maxStdoutBytes ?? 1024 * 1024;
  const maxStderrBytes = options.maxStderrBytes ?? 512 * 1024;

  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      env: options.env ?? makeSafeEnvironment(),
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let truncated = false;
    let timedOut = false;

    child.stdout.on("data", (raw: Buffer | string) => {
      const appended = appendBounded(stdout, Buffer.from(raw), maxStdoutBytes);
      stdout = appended.buffer;
      truncated ||= appended.truncated;
    });
    child.stderr.on("data", (raw: Buffer | string) => {
      const appended = appendBounded(stderr, Buffer.from(raw), maxStderrBytes);
      stderr = appended.buffer;
      truncated ||= appended.truncated;
    });

    child.once("error", reject);
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, timeoutMs);

    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        command: [executable, ...args].join(" "),
        exitCode,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        truncated,
      });
    });

    if (options.stdin === undefined) {
      child.stdin.end();
    } else {
      child.stdin.end(options.stdin);
    }
  });
}

export function killProcessTree(child: ChildProcessWithoutNullStreams): void {
  terminateProcessTree(child);
}
