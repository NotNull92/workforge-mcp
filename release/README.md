# Release output

`npm run release` validates the repository, builds the MCP server, creates an isolated Windows runtime staging directory, installs production npm dependencies only, writes a release identity manifest, and produces a ZIP plus SHA-256 file here.

The WorkForge 1.3 portable ZIP includes:

- `dist` and production `node_modules`;
- pinned Node.js, ripgrep, and tunnel-client Windows x64 executables plus
  upstream license texts;
- the canonical Agent Plugins package and generated Codex adapter;
- Setup, Install, Configure Tunnel, Control, and Uninstall entry points;
- a local HTML Control Dashboard served only on `127.0.0.1`, with the terminal Control path retained as a fallback;
- ForgeUI, plain-mode rendering, and the consent-gated missing-prerequisite bootstrap;
- the detached uninstall finalizer;
- `.workforge-release.json`, generated only in release staging;
- uninstall, troubleshooting, privacy, and security documentation.

An end user does not run npm, TypeScript, Vitest, or the repository test suite
during setup and needs no system Node.js or ripgrep. `Setup.cmd` stages the
verified engine under `%LOCALAPPDATA%\Programs\WorkForge`; mutable state stays
under `%LOCALAPPDATA%\WorkForge\runtime`. Git remains optional. The source
checkout retains the consent-gated WinGet prerequisite path.

Generated release artifacts remain ignored by Git and must be reviewed before upload. Release validation rejects runtime credentials, tunnel YAML, profile registries, JSONL logs, uninstall receipts, development dependencies, personal absolute paths, and nested release archives.

`npm run release` fails closed unless third-party license review is explicitly
acknowledged. `-ValidationBuild` is reserved for isolated non-public QA and
requires an explicit temporary output directory.

A source checkout never contains the release identity manifest and is therefore protected from automatic self-removal.
