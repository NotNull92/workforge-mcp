# TASK-07: Portable Runtime and Signed Setup EXE

Status: **Deferred after v1.1**
Priority: **P2**

## Objective

Remove the remaining system Node.js and ripgrep prerequisites and install the engine into a stable per-user location through a signed Windows installer.

## Why this is separate

Bundling third-party executables introduces version manifests, redistribution obligations, checksum maintenance, update policy, installer signing, uninstall semantics, and a larger release attack surface. It should not be folded casually into the setup-orchestration patch.

## Proposed design

- Stable engine root: `%LOCALAPPDATA%\Programs\WorkForge`.
- Mutable shared state: `%LOCALAPPDATA%\WorkForge\runtime`.
- Durable profile remains `%USERPROFILE%\WorkForge`.
- Pinned `runtime-manifest.json` for Node.js, ripgrep, and tunnel-client URLs, versions, hashes, licenses, and supported architectures.
- Engine executable resolution prefers bundled tools and never silently falls back across architecture boundaries.
- Git remains optional; `project_resume` reports unavailable when Git is absent.
- Inno Setup or WiX produces Install, Repair, Upgrade, and Uninstall entries.
- Program removal preserves the profile and credentials by default; destructive cleanup requires a separate explicit choice.
- Authenticode signing and clean-machine validation are release gates.

## Acceptance criteria

A clean Windows x64 machine needs no prior Node.js, npm, TypeScript, Vitest, or ripgrep installation. The only manual actions are OpenAI tunnel creation and ChatGPT connector attachment.
