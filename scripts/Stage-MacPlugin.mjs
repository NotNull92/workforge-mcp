import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "plugins", "workforge");
const outputIndex = process.argv.indexOf("--output");
const output = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : resolve(root, "release", "workforge-plugin-macos"));
if (output === source || output === root) throw new Error("Refusing to overwrite the plugin source or repository root.");

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(source, output, { recursive: true });
const mac = JSON.parse(readFileSync(resolve(source, "mcp.macos.json"), "utf8"));
const server = mac.mcpServers?.workforge;
if (server?.command !== "node" || !Array.isArray(server.args)) throw new Error("macOS MCP adapter is invalid.");
writeFileSync(resolve(output, ".mcp.json"), `${JSON.stringify({
  mcpServers: { workforge: { command: server.command, args: server.args } },
}, null, 2)}\n`, "utf8");
console.log(output);
