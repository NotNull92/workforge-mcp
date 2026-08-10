import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pluginRoot = resolve(root, "plugins", "workforge");
const checkOnly = process.argv.includes("--check");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function emit(relativePath, content) {
  const path = resolve(pluginRoot, relativePath);
  if (checkOnly) {
    if (readFileSync(path, "utf8") !== content) {
      throw new Error(`Generated plugin adapter is stale: ${relativePath}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

const canonical = readJson(resolve(pluginRoot, "plugin.json"));
const canonicalMcp = readJson(resolve(pluginRoot, "mcp.json"));
const packageManifest = readJson(resolve(root, "package.json"));
const extension = canonical.extensions?.["io.github.notnull92.workforge"];
if (canonical.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") {
  throw new Error("Canonical Agent Plugins schema is invalid.");
}
if (canonical.version !== packageManifest.version || !extension) {
  throw new Error("Canonical plugin metadata is inconsistent with the package.");
}
const server = canonicalMcp.mcpServers?.workforge;
if (server?.type !== "stdio" || server.command !== "./bin/workforge-stdio.cmd") {
  throw new Error("Canonical WorkForge MCP server is invalid.");
}

const codexManifest = {
  name: canonical.name,
  version: canonical.version,
  description: canonical.description,
  author: canonical.author,
  homepage: canonical.homepage,
  repository: canonical.repository,
  license: canonical.license,
  keywords: canonical.keywords,
  skills: "./skills/",
  mcpServers: "./.mcp.json",
  interface: {
    displayName: extension.displayName,
    shortDescription: extension.shortDescription,
    longDescription: canonical.description,
    developerName: canonical.author.name,
    category: extension.category,
    capabilities: extension.capabilities,
    websiteURL: canonical.homepage,
    defaultPrompt: ["Use WorkForge to inspect the selected workstation profile safely."],
  },
};
const codexMcp = {
  mcpServers: {
    workforge: {
      command: server.command,
      args: server.args ?? [],
    },
  },
};

emit(".codex-plugin/plugin.json", stableJson(codexManifest));
emit(".mcp.json", stableJson(codexMcp));
emit("bin/WorkForge.Portable.ps1", readFileSync(resolve(root, "scripts", "WorkForge.Portable.ps1"), "utf8"));

if (!checkOnly) console.log("PLUGIN_ADAPTERS_GENERATED");
