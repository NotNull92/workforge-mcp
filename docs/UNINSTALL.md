# Uninstall WorkForge

WorkForge 1.2 provides a safe uninstall flow with two explicit modes.

## Recommended: remove WorkForge and keep the workspace

Double-click:

```text
Uninstall.cmd
```

Choose **Remove WorkForge, keep my workspace**. This removes the selected profile registration, tunnel configuration, protected local credential file, runtime logs, command evidence, verified shortcut, and the verified release engine when no other profile uses it.

The following user-owned workspace content remains:

```text
%USERPROFILE%\WorkForge\AGENTS.md
%USERPROFILE%\WorkForge\README.md
%USERPROFILE%\WorkForge\WORKSTATION_POLICY.md
%USERPROFILE%\WorkForge\.git\
```

User-created files inside the workspace also remain. Operational profile data below `tools\workforge-mcp` and `artifacts\workforge-mcp` is removed.

## Permanent full removal

Choose **Remove WorkForge and all local profile data** and type the exact phrase:

```text
REMOVE WORKFORGE
```

This permanently removes the workspace repository, user-edited policy files, logs, command evidence, tunnel configuration, and local credential file.

For controlled automation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\Uninstall.ps1 `
  -Mode RemoveEverything `
  -NonInteractive `
  -ConfirmFullRemoval
```

The `-ConfirmFullRemoval` switch is mandatory for non-interactive full removal. WorkForge does not provide a broad `-Force` alias for destructive deletion.

## Preview without changing anything

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\Uninstall.ps1 `
  -Mode KeepWorkspace `
  -NonInteractive `
  -WhatIf `
  -Plain `
  -NoLog
```

## Engine protection

A source checkout containing `.git` is never removed automatically. A runtime engine is eligible for self-removal only when its `.workforge-release.json` file identifies a valid WorkForge release and no other registered profile still uses the engine.

The release engine is removed by a detached finalizer after the main uninstaller process exits. The finalizer verifies the release-manifest SHA-256 again immediately before deletion.

Use `-KeepEngine` to remove profile/runtime state while preserving the current engine directory.

## Runtime key behavior

WorkForge removes the local protected credential file only when the selected profile is the final profile using the engine. It does not revoke the corresponding OpenAI Platform runtime key. Revoke that key separately only after confirming that no other installation uses it.

A normal filesystem deletion is not a forensic secure erase and may still be represented in storage snapshots or backups.

## Multi-profile behavior

When another WorkForge profile remains:

- only the selected registry entry is removed;
- the remaining profile and its SHA-256 entry are preserved;
- shared tunnel-client files and the protected credential remain;
- the shared engine is not deleted.

## Uninstall logs

Uninstall logs are sanitized JSONL files below the system temporary WorkForge log directory. They redact the literal user profile path, complete tunnel IDs, and credential-shaped values. The temporary location is used because a verified release engine may remove itself.
