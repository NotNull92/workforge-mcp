// tunnel-client needs its control-plane key, but the MCP server does not.
// Remove that one connector secret before importing server or project code.
for (const key of Object.keys(process.env)) {
  if (key.toLowerCase() === "control_plane_api_key") delete process.env[key];
}

const [{ StdioServerTransport }, { createServer }, { loadProjectContextFromArgv }, { cancelActiveShellJobs }] = await Promise.all([
  import("@modelcontextprotocol/sdk/server/stdio.js"),
  import("./server.js"),
  import("./profile.js"),
  import("./shell.js"),
]);

const context = await loadProjectContextFromArgv();
const server = createServer(context);
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
