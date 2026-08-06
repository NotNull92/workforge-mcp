# TASK-06: Public Setup and Operator Documentation

Status: **Completed on 2026-08-06**
Priority: **P1**

## Objective

Replace the source-build-centered Quick Start with a one-entry beginner workflow while preserving advanced operational documentation.

## README changes

- Make `Setup.cmd` the primary path.
- Separate release-user requirements from source-development requirements.
- Explain that setup may start the tunnel once but never registers Windows startup.
- Explain Repair and Upgrade behavior.
- Keep the manual commands under an Advanced section.
- Use current terms for OpenAI tunnel management and ChatGPT connector settings.
- Correct broken text-encoding arrows in UI paths.

## Operator documentation

Add troubleshooting for:

- missing Node, Git, or ripgrep,
- invalid tunnel ID,
- runtime-key ACL failure,
- Control window closing in older releases,
- tunnel not ready,
- recovery budget exhausted,
- moving or deleting the extracted engine folder,
- stdio smoke lease conflicts.

## Release notes

Document the difference between:

- source archive: requires npm and development tooling,
- Windows runtime ZIP: includes `dist/` and production npm dependencies,
- future signed Setup EXE: TASK-07.

## Acceptance criteria

A first-time user can identify the correct file to run and the two remaining OpenAI account actions without reading the architecture documents.

## Implementation result

Updated `README.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, `docs/ARCHITECTURE.md`, and
`release/README.md`; added `docs/TROUBLESHOOTING.md`. The beginner path, current limitations,
Repair and Upgrade behavior, no-startup invariant, ChatGPT handoff, logs, recovery, moved
engine folders, and shell lease conflicts are now documented.
