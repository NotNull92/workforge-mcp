import { snapshotSecrets, loadRedactionRules } from "./redaction.js";

const secretSnapshot = snapshotSecrets(process.env);
if (secretSnapshot.skipped > 0) console.error(`WorkForge redaction snapshot: ${secretSnapshot.skipped} values exceeded collection limits.`);
// tunnel-client needs its control-plane key, but the MCP server does not.
// Remove that one connector secret before importing server or project code.
for (const key of Object.keys(process.env)) {
  if (key.toLowerCase() === "control_plane_api_key") delete process.env[key];
}

const [{ StdioServerTransport }, { createServer, parseReadOnlyMode, enabledToolNames }, { loadProjectContextFromArgv, parseBridgeArguments }, { cancelActiveShellJobs }] = await Promise.all([
  import("@modelcontextprotocol/sdk/server/stdio.js"),
  import("./server.js"),
  import("./profile.js"),
  import("./shell.js"),
]);

const context = await loadProjectContextFromArgv();
const { readOnlyFlag } = parseBridgeArguments(process.argv.slice(2));
const envReadOnly = parseReadOnlyMode(process.env.WORKFORGE_MCP_READ_ONLY);
const readOnly = readOnlyFlag || envReadOnly;
const toolModeSource = readOnlyFlag ? "argv" : envReadOnly ? "env" : "default";
const tools = process.env.WORKFORGE_MCP_TOOLS;
const rules = loadRedactionRules(process.env.WORKFORGE_MCP_REDACTION_RULES, secretSnapshot.values);
const entropyValue = process.env.WORKFORGE_MCP_REDACT_ENTROPY;
if (entropyValue !== undefined && entropyValue !== "0" && entropyValue !== "1") throw new Error("WORKFORGE_MCP_REDACT_ENTROPY must be unset, 0, or 1.");
const redactLogsValue = process.env.WORKFORGE_MCP_REDACT_SHELL_LOGS;
if (redactLogsValue !== undefined && redactLogsValue !== "0" && redactLogsValue !== "1") throw new Error("WORKFORGE_MCP_REDACT_SHELL_LOGS must be unset, 0, or 1.");
const redaction = process.env.WORKFORGE_MCP_REDACTION ?? "on";
const readOnlyExtrasValue = process.env.WORKFORGE_MCP_READ_ONLY_EXTRAS;
if (readOnlyExtrasValue !== undefined && readOnlyExtrasValue !== "0" && readOnlyExtrasValue !== "1") throw new Error("WORKFORGE_MCP_READ_ONLY_EXTRAS must be unset, 0, or 1.");
const readOnlyExtras = readOnlyExtrasValue === "1";
const multiFileEditValue = process.env.WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT;
if (multiFileEditValue !== undefined && multiFileEditValue !== "0" && multiFileEditValue !== "1") throw new Error("WORKFORGE_MCP_ENABLE_MULTI_FILE_EDIT must be unset, 0, or 1.");
const multiFileEdit = multiFileEditValue === "1";
if (redaction !== "on" && redaction !== "off") throw new Error("WORKFORGE_MCP_REDACTION must be unset, on, or off.");
if (redaction === "off") console.error("WorkForge MCP redaction: off");
if (readOnlyFlag && process.env.WORKFORGE_MCP_READ_ONLY === "0") console.error("WorkForge --read-only overrides WORKFORGE_MCP_READ_ONLY=0.");
console.error(`WorkForge MCP tool mode: ${readOnly ? "read_only" : "read_write"}`);
const server = createServer(context, { readOnly, toolModeSource, tools, knownSecrets: rules.knownSecrets,
  redaction, redactLogs: redactLogsValue === "1", readOnlyExtras, multiFileEdit,
  customLiterals: rules.customLiterals, redactionOptions: { extraKeyNames: rules.extraKeyNames, entropy: entropyValue === "1" },
  onSessionLock: posture => console.error(`WorkForge MCP posture: ${JSON.stringify(posture)}`) });
console.error(`WorkForge MCP posture: ${JSON.stringify({ toolMode: readOnly ? "read_only" : "read_write", toolModeSource, redaction, tools: enabledToolNames(readOnly, tools, { readOnlyExtras, multiFileEdit }).length })}`);
const transport = new StdioServerTransport();

await server.connect(transport);

let shutdownPromise: Promise<void> | undefined;
const shutdown = (): Promise<void> => {
  shutdownPromise ??= (async () => {
    cancelActiveShellJobs(context);
    await Promise.allSettled([transport.close(), server.close()]);
    process.exitCode = 0;
  })();
  return shutdownPromise;
};

// The tunnel owns stdin. If that exact tunnel connection disappears, fail the
// profile's in-flight shell work instead of leaving it detached during recovery.
process.stdin.once("end", () => void shutdown());
process.stdin.once("close", () => void shutdown());
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
