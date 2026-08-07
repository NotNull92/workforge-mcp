# TASK-09: Safe uninstall lifecycle

Status: **Completed on 2026-08-06**

## Goal

Add a first-class WorkForge uninstall flow that removes operational access and sensitive local runtime state without accidentally deleting user-owned workspace content, source checkouts, unrelated profiles, or unverified shortcuts.

## Modes

### KeepWorkspace

Removes the selected WorkForge profile registration, tunnel configuration, local runtime credential when the final profile is removed, command evidence, runtime logs, verified shortcut, and a verified release engine when it is no longer shared. The workspace repository and user-authored policy files remain.

### RemoveEverything

Performs the same operational cleanup and permanently removes the selected workspace repository. Interactive use requires the exact phrase `REMOVE WORKFORGE`. Non-interactive use requires `-ConfirmFullRemoval`.

## Safety invariants

- Reject drive roots, the user-profile root, the engine root as a workspace target, and paths that traverse reparse points.
- Require the canonical profile location, registry entry, profile SHA-256, `.git` directory, and `identity=workforge-workstation` marker to agree.
- Stop only a verified WorkForge tunnel and supervisor.
- Remove only the selected registry entry; preserve all unrelated profiles.
- Remove a desktop shortcut only when its executable, arguments, and working directory match the current engine.
- Never auto-delete a source checkout.
- Auto-delete an engine only when `.workforge-release.json` identifies a verified release distribution and no other profile remains.
- Use a detached, manifest-hash-pinned finalizer so the running uninstaller never recursively deletes itself.
- Support `-WhatIf` through explicit zero-mutation gates.
- Never revoke a Platform runtime key automatically; remove only the local credential file.

## Files

- `Uninstall.cmd`
- `scripts/Uninstall.ps1`
- `scripts/uninstall-finalizer.ps1`
- `scripts/test-uninstall.ps1`
- `docs/UNINSTALL.md`

## Verification record

The automated uninstall suite validates:

- KeepWorkspace preserves a user-owned fixture while removing profile configuration, runtime evidence, registry state, local credential, and verified shortcut;
- WhatIf leaves every fixture unchanged;
- RemoveEverything fails closed without explicit destructive confirmation;
- confirmed full removal deletes the workspace;
- multi-profile removal preserves the other profile, shared credential, and engine;
- a verified release fixture removes itself through the detached finalizer;
- the finalizer writes and validates a completion receipt;
- source and shared engines remain protected.

Observed gate:

```text
UNINSTALL_TEST_OK
```

The full repository check and isolated release package build also passed after integration.
