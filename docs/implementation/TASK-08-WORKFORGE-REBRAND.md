# TASK-08: Establish the WorkForge product identity

Status: **Completed on 2026-08-06**

## Goal

Turn the clean source copy in `workforge-mcp` into an independent WorkForge repository while preserving the verified workstation MCP behavior.

The result must be able to coexist with the predecessor installation on the same Windows account without sharing profile paths, runtime evidence, registry environment variables, process mutexes, shortcuts, or release artifact names.

## Product decisions

| Surface | WorkForge value |
|---|---|
| Repository and npm package | `workforge-mcp` |
| Product and connector display name | `WorkForge` |
| Default profile root | `%USERPROFILE%\WorkForge` |
| Profile configuration directory | `tools\workforge-mcp` |
| Runtime evidence directory | `artifacts\workforge-mcp` |
| Registry environment variable | `WORKFORGE_MCP_PROFILE_REGISTRY` |
| Process environment prefix | `WORKFORGE_MCP_` |
| Windows mutex and Job Object prefix | `WorkForgeMcp` |
| Control launcher | `WorkForge Control.cmd` |
| Desktop shortcut | `WorkForge Control.lnk` |
| Release archive | `WorkForge-v<version>-win-x64.zip` |
| Identity marker literal | `identity=workforge-workstation` |

The default profile ID remains `workstation` because it describes the profile role rather than the product. Product-specific paths, environment variables, mutexes, and display names provide the isolation boundary.

## Scope

1. Rebrand public documentation, command wrappers, installer output, diagnostics, release metadata, package metadata, and test fixtures.
2. Rename the control launcher and every reference to it.
3. Replace product-specific profile and runtime paths.
4. Replace product-specific PowerShell function names, TypeScript environment variables, Job Object class names, and Windows mutex names.
5. Preserve the existing security model:
   - no Windows startup persistence;
   - no credential logging or command-line key transport;
   - SHA-guarded writes and profile hashing;
   - connection-owned PowerShell jobs;
   - bounded tunnel recovery with no command replay;
   - current-user Windows ACL and UAC boundary.
6. Preserve source-only repository hygiene. Do not copy `.git` history, runtime credentials, generated registry files, logs, `node_modules`, `dist`, or release archives from the predecessor directory.
7. Add or update automated assertions so legacy product-specific runtime identifiers cannot silently return.

## Non-goals

- Creating or publishing the GitHub remote.
- Installing a portable Node.js, Git, or ripgrep runtime.
- Starting, stopping, or replacing the currently connected workstation tunnel.
- Reusing credentials or tunnel configuration from another installation.
- Creating a Windows service, scheduled task, startup entry, or automatic elevation path.

## Implementation sequence

1. Verify that the target source tree is an exact secret-free copy.
2. Apply ordered text replacements and explicit semantic corrections.
3. Rename the control launcher.
4. Add WorkForge-specific isolation checks to the security invariant test.
5. Parse every PowerShell script and build TypeScript with the existing verified development toolchain.
6. Run unit, installer, setup, control, security, recovery, smoke, and release-package tests.
7. Scan the repository and generated release for credentials, personal absolute paths, legacy product-specific runtime identifiers, and forbidden generated content.
8. Record the final result and remaining deferred work in this document.

## Acceptance criteria

- `package.json` and `package-lock.json` use `workforge-mcp`.
- Public executable code contains no predecessor product name or predecessor-specific runtime identifier.
- WorkForge uses its own profile configuration directory, evidence directory, registry environment variable, Job Object class, and mutex namespace.
- `WorkForge Control.cmd` replaces the old launcher name in source and release packaging.
- All automated tests pass without touching the active predecessor tunnel.
- The target repository contains no credential file, tunnel profile, generated registry, log, dependency directory, build directory, or release archive.
- Git remains local with no remote configured until the owner creates the new GitHub repository.

## Verification record

- Compared the clean target against the current predecessor working tree before rebranding: 64 source files matched, with zero missing, extra, or changed files.
- Rebranded package metadata, public documentation, wrappers, installer output, profile paths, runtime paths, environment variables, Job Object class names, Windows mutexes, shortcuts, test fixtures, and release artifact names.
- Assigned the default WorkForge profile HTTP metadata port `2198`, distinct from the predecessor default.
- Added executable-surface assertions for the WorkForge profile directory, runtime evidence directory, registry environment variable, shell environment prefix, Job Object class, mutex namespace, launcher, server name, and identity marker.
- Parsed every PowerShell script successfully.
- Built the TypeScript MCP server successfully.
- Passed 31 TypeScript tests across five test files.
- Passed platform detection, Install/Repair/Upgrade, Setup flow, Control UX, security invariant, and tunnel recovery policy regressions.
- Production dependency audit completed with zero reported vulnerabilities at the configured high-severity gate.
- Passed an isolated stdio smoke test for all 12 MCP tools while the predecessor connector remained active, including WorkForge `shell_start`, status, output, process containment, and credential scrubbing.
- Built and validated temporary release archive `WorkForge-v1.1.0-win-x64.zip`: 4,773,088 bytes, SHA-256 `c3d599847cf9634ed41a5de4d18f213eced61de2e0e4b246b70f8efc3780ecf2`. The temporary archive and checksum were removed after validation.
- Final source audit: 65 authored files, zero legacy brand matches, zero current-user absolute-path matches, zero concrete tunnel IDs, zero forbidden generated files, and zero forbidden generated directories.
- Removed validation-only `node_modules` and `dist` directories after all tests.
- Confirmed local branch `main` has zero commits and zero remotes. No commit, push, GitHub repository creation, tunnel restart, credential migration, or external publication was performed.
