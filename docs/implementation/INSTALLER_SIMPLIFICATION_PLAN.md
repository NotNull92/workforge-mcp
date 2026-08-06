# Installer Simplification Implementation Plan

Status: **Implemented for v1.1; TASK-07 deferred**
Target milestone: **v1.1 setup-flow hardening**
Scope owner: WorkForge repository

## 1. Problem statement

The MCP runtime has strong context, file-integrity, credential, and process-lifetime safeguards, but the distribution currently exposes its internal build and tunnel-management steps directly to end users. A first-time user must run three command wrappers, install development prerequisites, build TypeScript, execute tests, configure a tunnel, start the tunnel, and then finish the ChatGPT connection manually.

The implementation goal is to reduce the local workflow to one entry point without weakening any security invariant.

## 2. Target user experience

The supported beginner path becomes:

1. Extract the Windows release.
2. Double-click `Setup.cmd`.
3. Create or select an OpenAI Secure MCP Tunnel when the setup opens the official page.
4. Enter the tunnel ID and runtime key in the protected console prompts.
5. Let setup install, validate, configure, and start the tunnel.
6. Use the opened ChatGPT connector page to attach the same tunnel.

A reboot must still leave the tunnel stopped. Setup may start the tunnel only as a direct consequence of the user's current setup command.

## 3. Non-negotiable invariants

- Do not register a Windows service, scheduled task, startup item, or Run key.
- Do not elevate privileges or silently install system software.
- Never place the runtime API key in command-line arguments, logs, Git, release archives, or profile files.
- Preserve `contextRevision`, SHA-guarded writes, profile-root separation, Job Object containment, and no-command-replay behavior.
- Repair and upgrade must not overwrite user-authored profile policy files.
- Release archives must exclude credentials, generated tunnel YAML, registries, logs, and machine-specific paths.
- Failures must remain visible and actionable instead of closing the console immediately.

## 4. Delivery slices

| Task | Name | Dependency | Deliverable |
|---|---|---|---|
| TASK-01 | Control error UX | none | Durable console errors and actionable diagnostics |
| TASK-02 | Safe install modes | TASK-01 | Install, Repair, and Upgrade semantics with profile preservation |
| TASK-03 | Unified setup entry point | TASK-02 | `Setup.cmd` and resumable `Setup.ps1` orchestration |
| TASK-04 | Prebuilt release package | TASK-02, TASK-03 | Release ZIP containing built MCP output and production dependencies |
| TASK-05 | Validation and security gates | TASK-01 through TASK-04 | Regression tests, production audit gate, archive checks |
| TASK-06 | Public documentation | TASK-01 through TASK-05 | One-entry quick start and operator documentation |
| TASK-07 | Portable runtime and Setup EXE | future | Remove remaining Node/ripgrep prerequisites and add signed installer |

## 5. Release architecture for this milestone

The v1.1 ZIP remains a portable, user-owned folder. It includes `dist/` and production `node_modules/`, so a release user does not run TypeScript compilation or tests. A source checkout may still bootstrap itself with npm when the prebuilt runtime is absent.

This milestone deliberately does not copy the application into Program Files or LocalAppData and does not bundle Node.js, Git, or ripgrep. Those changes require a separate runtime manifest, redistribution review, update policy, and installer-signing work covered by TASK-07.

## 6. State ownership

- Engine and release files: extracted repository directory.
- Engine runtime registry and verified tunnel-client: `<engine>\runtime`.
- Durable workstation profile: `%USERPROFILE%\WorkForge` by default.
- Tunnel configuration: `<profile>\tools\workforge-mcp\tunnel.local.yaml`.
- Protected runtime key: `<engine>\runtime\.env.local`.
- Operational logs and PIDs: `<profile>\artifacts\workforge-mcp`.

## 7. Rollback strategy

Every task is independently reviewable. No migration deletes user data. If setup orchestration fails, the existing advanced commands remain available. Repair only restores generated engine assets and missing profile templates. Existing policy files, tunnel configuration, credentials, and logs remain untouched.

## 8. Completion criteria

The milestone is complete when:

- `Setup.cmd` is the documented beginner entry point.
- Existing users can run Repair or Upgrade without losing policy customizations.
- Control failures remain on screen with the failing stage and relevant log locations.
- The release ZIP includes `dist/` and production runtime dependencies.
- Release users do not require npm, TypeScript, or Vitest.
- Build, unit, PowerShell regression, release-package, and production audit checks pass.
- No startup persistence is created.
## 9. Delivered result

Tasks 01 through 06 are implemented in the working tree. The beginner path is now
`Setup.cmd`; existing profiles are repaired without policy replacement; runtime releases
contain `dist/` and production npm dependencies; control failures remain visible; the
release archive is reopened and inspected; production audit currently reports zero known
vulnerabilities; and public setup, architecture, security, and troubleshooting documents
reflect the new flow.

TASK-07 remains intentionally deferred. The v1.1 runtime ZIP still requires system Node.js,
Git, and ripgrep and is not yet a signed Setup EXE installed into a stable LocalAppData path.
