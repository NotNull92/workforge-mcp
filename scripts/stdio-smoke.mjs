import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expectedTools = [
  "list_directory", "project_resume", "read_image", "read_text_file", "replace_text",
  "search_files", "shell_cancel", "shell_output", "shell_start", "shell_status",
  "workstation_context", "write_text_file",
];

function payload(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  return JSON.parse(result.content.find((part) => part.type === "text").text);
}

async function waitForShell(client, id) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const status = payload(await client.callTool({ name: "shell_status", arguments: { id } }));
    if (status.status !== "running" && status.trackingState === "archived_terminal") return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Shell job did not finish: ${id}`);
}

const toolDirectory = fileURLToPath(new URL("..", import.meta.url));
const entrypoint = fileURLToPath(new URL("../dist/stdio.js", import.meta.url));
const profileId = process.argv[2] ?? "workstation";
const { loadProjectProfile } = await import("../dist/profile.js");
const context = await loadProjectProfile(profileId);
const tempRoot = await mkdtemp(join(tmpdir(), `workforge-stdio-${profileId}-`));
const outsidePath = join(tempRoot, ".env.fixture");
await writeFile(outsidePath, "fixture=true\n", "utf8");
const client = new Client({ name: `${profileId}-stdio-smoke`, version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entrypoint, "--profile", profileId],
  cwd: toolDirectory,
  env: { ...process.env, CONTROL_PLANE_API_KEY: "stdio-smoke-sentinel" },
  stderr: "inherit",
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), expectedTools);
  const workstation = payload(await client.callTool({ name: "workstation_context", arguments: {} }));
  assert.equal(workstation.profileId, profileId);
  assert.match(workstation.contextRevision, /^[a-f0-9]{64}$/u);
  assert.equal(workstation.engineRoot, resolve(toolDirectory));

  const outside = payload(await client.callTool({ name: "read_text_file", arguments: { path: outsidePath } }));
  assert.equal(outside.text, "fixture=true\n");

  const shell = payload(await client.callTool({
    name: "shell_start",
    arguments: {
      contextRevision: workstation.contextRevision,
      cwd: tempRoot,
      command: "if ($null -eq $env:CONTROL_PLANE_API_KEY) { Write-Output 'KEY_SCRUBBED' } else { Write-Output 'KEY_LEAKED' }",
      timeoutMs: 10_000,
    },
  }));
  const status = await waitForShell(client, shell.id);
  assert.equal(status.status, "completed");
  const output = payload(await client.callTool({ name: "shell_output", arguments: { id: shell.id } }));
  assert.match(output.stdout.text, /KEY_SCRUBBED/u);
  assert.doesNotMatch(output.stdout.text, /stdio-smoke-sentinel|KEY_LEAKED/u);
  console.log(`WorkForge stdio smoke passed: ${expectedTools.length} tools.`);
} finally {
  await client.close().catch(() => undefined);
  await rm(tempRoot, { recursive: true, force: true });
}
