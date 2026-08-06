# TASK-04: Prebuilt Runtime Release Package

Status: **Completed on 2026-08-06**
Priority: **P1**

## Objective

Move TypeScript compilation, unit tests, and npm production dependency installation from the end user's machine into the release build.

## Release build flow

1. Run `npm ci` in the development checkout.
2. Run the full repository check.
3. Build `dist/`.
4. Create an isolated staging directory.
5. Copy distributable scripts, source references, documentation, templates, package manifests, and `dist/`.
6. Run `npm ci --omit=dev --ignore-scripts` inside staging.
7. Verify direct production dependency versions.
8. Verify forbidden runtime and credential material is absent.
9. Scan for personal path and user-name leakage.
10. Create ZIP and SHA-256 output.
11. Re-open the ZIP and verify required and forbidden entries.

## Required archive entries

- `Setup.cmd`
- `Install.cmd`
- `Configure Tunnel.cmd`
- `WorkForge Control.cmd`
- `dist/stdio.js`
- `node_modules/@modelcontextprotocol/sdk/package.json`
- `node_modules/zod/package.json`
- `scripts/Setup.ps1`
- templates and public documentation

## Forbidden archive entries

- `runtime/`
- `.env.local`
- `tunnel.local.yaml`
- `profile_registry.json`
- `artifacts/`
- generated logs
- release archives nested inside the archive
- absolute user paths or user names

## Source checkout fallback

The public Git repository remains buildable from source. `Install.ps1` only invokes npm when the prebuilt runtime is absent or invalid.

## Files

- `scripts/Build-Release.ps1`
- `scripts/test-release-package.ps1`
- `release/README.md`
- `package.json`
- `.gitignore`

## Acceptance criteria

- Extracted release installation does not execute npm, TypeScript, or Vitest.
- Production `node_modules` contains no repository dev dependencies.
- Archive validation rejects credentials and generated runtime state.
- The generated checksum matches the ZIP.

## Implementation result

`scripts/Build-Release.ps1` now builds a versioned Windows runtime ZIP from isolated staging,
installs production dependencies only, excludes dev packages and runtime secrets, scans
for personal paths, writes SHA-256, and invokes `scripts/test-release-package.ps1` to reopen
the archive. A temporary v1.1.0 package was built and validated successfully; no generated
release artifact was left in Git.
