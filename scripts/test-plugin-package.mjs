import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pluginRoot = resolve(root, "plugins", "workforge");

execFileSync(process.execPath, [resolve(root, "scripts", "Generate-Plugin.mjs"), "--check"], {
  cwd: root,
  stdio: "inherit",
});

const canonical = JSON.parse(readFileSync(resolve(pluginRoot, "plugin.json"), "utf8"));
const agentMcp = JSON.parse(readFileSync(resolve(pluginRoot, "mcp.json"), "utf8"));
const codex = JSON.parse(readFileSync(resolve(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
const codexMcp = JSON.parse(readFileSync(resolve(pluginRoot, ".mcp.json"), "utf8"));
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

if (canonical.name !== "workforge" || canonical.version !== packageManifest.version) {
  throw new Error("Canonical plugin identity does not match package.json.");
}
if (agentMcp.mcpServers?.workforge?.command !== "./bin/workforge-stdio.cmd") {
  throw new Error("Canonical Agent Plugins MCP entrypoint is invalid.");
}
if (codex.mcpServers !== "./.mcp.json" || codex.skills !== "./skills/") {
  throw new Error("Generated Codex manifest does not reference bundled components.");
}
if (codexMcp.mcpServers?.workforge?.command !== "./bin/workforge-stdio.cmd") {
  throw new Error("Generated Codex MCP adapter is invalid.");
}

const authored = [canonical, agentMcp, codex, codexMcp].map((value) => JSON.stringify(value)).join("\n");
if (/CONTROL_PLANE_API_KEY|tunnel_id|[A-Z]:\\Users\\/iu.test(authored)) {
  throw new Error("Plugin package contains runtime credentials or an absolute user path.");
}

console.log("PLUGIN_PACKAGE_TEST_OK");
