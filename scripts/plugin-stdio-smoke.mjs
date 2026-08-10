import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pluginRoot = resolve(process.argv[2] ?? "plugins/workforge");
const profileId = process.argv[3] ?? "workstation";
const expectedTools = [
  "list_directory", "project_resume", "read_image", "read_text_file", "replace_text",
  "search_files", "shell_cancel", "shell_output", "shell_start", "shell_status",
  "workstation_context", "write_text_file",
];
const client = new Client({ name: "workforge-plugin-stdio-smoke", version: "1.0.0" });
const command = process.platform === "win32"
  ? resolve(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : process.execPath;
const args = process.platform === "win32"
  ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve(pluginRoot, "bin", "workforge-stdio.ps1"), "-ProfileId", profileId]
  : [resolve(pluginRoot, "bin", "workforge-stdio.mjs"), "--profile", profileId];
const transport = new StdioClientTransport({
  command,
  args,
  cwd: pluginRoot,
  env: { ...process.env, CONTROL_PLANE_API_KEY: "plugin-smoke-sentinel" },
  stderr: "inherit",
});

try {
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), expectedTools);
  const result = await client.callTool({ name: "workstation_context", arguments: {} });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const text = result.content.find((part) => part.type === "text")?.text;
  assert.equal(typeof text, "string");
  const context = JSON.parse(text);
  assert.equal(context.profileId, profileId);
  assert.match(context.contextRevision, /^[a-f0-9]{64}$/u);
  console.log(`WorkForge plugin stdio smoke passed: ${expectedTools.length} tools.`);
} finally {
  await client.close().catch(() => undefined);
}
