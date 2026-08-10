# TASK-16 — v0.2.0 Architecture Cleanup

## Goal

Move WorkForge from the hardened v0.1.x release line to a cleaner v0.2.0 internal architecture without modifying or invalidating installed v0.1.0 engines, user-owned workspace files, tunnel credentials, or existing profile registrations.

## Compatibility boundary

- The published `v0.1.0` tag and release assets remain immutable.
- Portable engines stay side-by-side under `versions/<version>`; source work does not modify the active installed v0.1.0 engine.
- v0.2.0 continues to read valid v1 profiles containing deprecated `httpPort` metadata.
- The deprecated installer `-Force` alias remains a non-destructive Repair compatibility path.
- Portable install-manifest schema 1 remains readable so an existing v0.1.0 engine can remain a rollback target.
- Release-root lifecycle wrappers continue to delegate runtime actions to the active installed engine.

## Architecture changes

### Shared profile contract

`workforge-contract.json` is the canonical profile-limit contract consumed by TypeScript and Windows PowerShell. It defines registry schema version, profile-count limit, profile ID syntax, and display-name limits so the two runtimes no longer maintain divergent constants.

### Windows lifecycle module boundary

`scripts/profile-registry.ps1` remains the compatibility entry point used by existing lifecycle scripts, but it is now a thin facade.

- `WorkForge.ProfileRuntime.ps1` owns profile registry, profile identity, credential ACL/file handling, and stdio runtime validation.
- `WorkForge.TunnelRuntime.ps1` owns tunnel executable/runtime paths, operation locking, process identity verification, health URL parsing, and recovery decisions.
- `WorkForge.Contract.ps1` loads the shared immutable contract.

This keeps the public/lifecycle call surface stable while separating profile concerns from tunnel process management.

### Operating workspace is not a project repository

Windows Install/Repair/Upgrade no longer runs `git init` in `%USERPROFILE%\WorkForge` merely because Git is available. The operating workspace remains a normal local folder. Existing `.git` metadata from older installations is preserved, not deleted. Git Enhanced Mode applies to the actual target passed to `project_resume(path)`.

### Platform quality gates

The package scripts now distinguish:

- `check:core` — platform-neutral TypeScript and plugin tests.
- `check:windows` — core plus portable runtime, prerequisite, installer, control UI, uninstall, privacy, security, recovery, and audit gates.
- `check:macos` — core plus macOS setup/doctor/uninstall/plugin smoke and audit.

GitHub has separate Windows and macOS quality workflows with Node.js 20 and 24 matrices.

### File edit correctness

`replace_text` performs literal slicing rather than JavaScript replacement-string interpretation, so `$&`, `$1`, `$'`, and `$`` remain literal user text. It also accepts LF text returned by `read_text_file` when the underlying file uses CRLF and preserves the file's line-ending convention.

## Privacy history note

A GitHub-generated PR merge commit was already published with non-noreply author metadata before the commit-metadata rule was enforced on that merge path. The privacy gate grandfathering is pinned to that exact immutable commit hash only. New non-noreply commit metadata continues to fail closed, and all historical file blobs remain scanned.

## Validation

Focused validation completed during implementation:

- PowerShell parser checks for facade/modules/install/release/security scripts.
- TypeScript test suite including replacement-token and CRLF regression coverage.
- Multi-profile profile-loading tests.
- Install/Repair/Upgrade tests with an assertion that new WorkForge operating workspaces are not Git repositories.
- Uninstall fixtures using the same facade/module runtime composition as the product.
- Explicit portable compatibility path: v0.1.0 schema-1 engine → v0.2.0 side-by-side upgrade → preserved v0.1.0 rollback target → verified rollback.
- Privacy, security, and recovery invariant tests.
- Production dependency audit with no high-severity findings.

Final acceptance completed with `npm run check` and an isolated `Build-Release.ps1 -ValidationBuild` package validation for v0.2.0. Public tag creation and GitHub Release publication remain separate approval gates.
