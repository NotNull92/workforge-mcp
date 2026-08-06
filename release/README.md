# Release output

`npm run release` validates the repository, builds the MCP server, creates an
isolated Windows runtime staging directory, installs production npm dependencies
only, and writes a ZIP plus SHA-256 file here.

The Windows runtime ZIP includes `dist/` and production `node_modules/`, so an
end user does not run npm, TypeScript, Vitest, or the repository test suite.
Generated release artifacts remain ignored by Git and must still be reviewed
before upload. Node.js, Git, and ripgrep remain external prerequisites until the
portable-runtime work described in `docs/implementation/TASK-07-PORTABLE-RUNTIME-SETUP-EXE.md` is completed.
