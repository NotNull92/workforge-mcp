# TASK-07: Portable Runtime and Signed Setup EXE

Status: **Portable ZIP completed by TASK-15; signed Setup EXE deferred**
Priority: **P2**

## Objective

Remove the remaining release-user Node.js and ripgrep prerequisites and install
the engine into a stable per-user location. A signed Windows installer remains
a later release-track deliverable.

## Why this is separate

Bundling third-party executables introduces version manifests, redistribution obligations, checksum maintenance, update policy, installer signing, uninstall semantics, and a larger release attack surface. It should not be folded casually into the setup-orchestration patch.

## Proposed design

- Stable engine root: `%LOCALAPPDATA%\Programs\WorkForge`.
- Mutable shared state: `%LOCALAPPDATA%\WorkForge\runtime`.
- Durable profile remains `%USERPROFILE%\WorkForge`.
- Pinned `runtime-manifest.json` for Node.js, ripgrep, and tunnel-client URLs, versions, hashes, licenses, and supported architectures.
- Engine executable resolution prefers bundled tools and never silently falls back across architecture boundaries.
- Git remains optional; `project_resume` reports unavailable when Git is absent.
- TASK-15 uses the existing ZIP plus `Setup.cmd` to stage versioned engines and
  provide Install, Repair, Upgrade, and rollback behavior.
- Inno Setup or WiX remains optional future work for a signed Setup EXE.
- Program removal preserves the profile and credentials by default; destructive cleanup requires a separate explicit choice.
- Authenticode signing and clean-machine validation are release gates.

## Acceptance criteria

A clean Windows x64 release install needs no prior Node.js, npm, TypeScript,
Vitest, ripgrep, or Git. This criterion is implemented and covered by isolated
portable-install QA. Public distribution still requires the explicit
third-party license, Authenticode/signing, and release approval gates.
