# Release output

`npm run release` validates the repository, builds the MCP server, creates an isolated Windows runtime staging directory, installs production npm dependencies only, writes a release identity manifest, and produces a ZIP plus SHA-256 file here.

The WorkForge 1.2 runtime ZIP includes:

- `dist` and production `node_modules`;
- Setup, Install, Configure Tunnel, Control, and Uninstall entry points;
- a local HTML Control Dashboard served only on `127.0.0.1`, with the terminal Control path retained as a fallback;
- ForgeUI, plain-mode rendering, and the consent-gated missing-prerequisite bootstrap;
- the detached uninstall finalizer;
- `.workforge-release.json`, generated only in release staging;
- uninstall, troubleshooting, privacy, and security documentation.

An end user does not run npm, TypeScript, Vitest, or the repository test suite during setup. Node.js and ripgrep are the required system-level components until the portable-runtime milestone is completed. Git for Windows is optional: WorkForge installs and reloads profiles in Local Folder Mode without it and enables Git Enhanced Mode when it is available. `Setup.cmd` detects all three, leaves compatible installations untouched, offers missing required components through WinGet after consent, and offers Git separately. In automation, `-InstallMissingPrerequisites` covers required components while `-InstallGit` explicitly opts into Git. An incompatible existing Node.js is never automatically layered over. Tunnel configuration persists the exact Node.js and compiled stdio paths validated by the release instead of a relative runtime command.

Generated release artifacts remain ignored by Git and must be reviewed before upload. Release validation rejects runtime credentials, tunnel YAML, profile registries, JSONL logs, uninstall receipts, development dependencies, personal absolute paths, and nested release archives.

A source checkout never contains the release identity manifest and is therefore protected from automatic self-removal.
