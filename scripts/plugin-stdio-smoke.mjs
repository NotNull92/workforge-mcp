import { enabledToolNames } from "../dist/server.js";
import { strict as assert } from "node:assert";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const pluginRoot = resolve(process.argv[2] ?? "plugins/workforge");
const profileId = process.argv[3] ?? "workstation";
const expectedTools = enabledToolNames(process.env.WORKFORGE_MCP_READ_ONLY === "1", process.env.WORKFORGE_MCP_TOOLS, { readOnlyExtras: process.env.WORKFORGE_MCP_READ_ONLY_EXTRAS === "1", multiFileEdit: process.env.WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT === "1" });
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
  if (process.platform === "win32") console.log("Plugin smoke checks the portable engine selected by the launcher, not this source checkout. Use node scripts/test-isolated-stdio.mjs to test the built source in isolation.");
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
