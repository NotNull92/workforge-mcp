# Troubleshooting

This guide covers the WorkForge 1.2 Windows runtime and source checkout.

## Setup reports a missing prerequisite

The current runtime ZIP requires Node.js 20 or newer on x64, Git for Windows, and ripgrep.
Setup checks these commands before creating or changing a WorkForge profile:

```powershell
Get-Command node.exe
Get-Command git.exe
Get-Command rg.exe
node.exe -p "process.versions.node + ' ' + process.arch"
```

When one or more commands are missing, interactive Setup offers to install only the missing
packages through WinGet. Compatible existing commands are skipped. Accept the prompt, or
use the explicit non-interactive form:

```powershell
.\Setup.cmd -NonInteractive -InstallMissingPrerequisites -SkipTunnelConfiguration -SkipStart -NoBrowser
```

If `winget.exe` is unavailable, install or update Microsoft App Installer and open a new
PowerShell window before running Setup again. WorkForge does not bootstrap WinGet itself.

## Setup rejects an existing Node.js installation

WorkForge does not automatically replace an existing Node.js command. It stops when Node.js
is below version 20, reports a non-x64 architecture, or cannot report a valid version and
architecture. Upgrade or remove the conflicting Node.js installation deliberately, verify
which command wins on PATH, and run Setup again:

```powershell
Get-Command node.exe -All
node.exe -p "process.versions.node + ' ' + process.arch"
```

Do not repeatedly run WinGet to layer another Node.js installation over an incompatible one.
The `--no-upgrade` bootstrap policy is intentional.

Release users do not need npm, TypeScript, or Vitest. A source checkout needs npm only when
`dist` or the exact production dependencies are absent. The Node.js LTS package normally
provides `npm.cmd` for that source-build fallback.

## The terminal UI is garbled, has no color, or is hard to read

WorkForge automatically selects plain output for redirected output, CI, and non-interactive hosts. Force deterministic plain output with one of these options:

```powershell
$env:WORKFORGE_PLAIN_UI = "1"
$env:NO_COLOR = "1"
.\Setup.cmd -Plain
```

Remove the temporary environment variable later with:

```powershell
Remove-Item Env:WORKFORGE_PLAIN_UI -ErrorAction SilentlyContinue
Remove-Item Env:NO_COLOR -ErrorAction SilentlyContinue
```

ForgeUI is implemented in PowerShell. WorkForge does not require `gum.exe`, Go, or an external terminal UI runtime.

## Where are lifecycle logs?

Setup, Install, Repair, and Upgrade write sanitized JSONL logs below:

```text
<engine>\runtime\logs
```

Uninstall logs are written below the system temporary WorkForge log directory because a verified release engine may remove itself.

Use `-NoLog` to suppress a lifecycle log during controlled testing. Logs redact the literal user-profile path, complete tunnel IDs, and common credential shapes. They may still contain useful local operational context, so do not publish them without review.

## `Install.cmd` says the profile already exists

`Install.cmd` is the install-only compatibility entry point. Use `Setup.cmd` for the beginner workflow or run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Install.ps1 -Mode Repair
```

Repair preserves policy files, the profile manifest, tunnel configuration, credentials, logs, and unrelated registry entries.

## Setup cannot accept the tunnel ID

A tunnel ID must match this exact shape:

```text
tunnel_ followed by 32 lowercase hexadecimal characters
```

Create or copy it from OpenAI Platform tunnel management. Do not enter an Admin API key, project key, or ChatGPT session token in the tunnel ID field.

## Runtime key or credential ACL validation fails

`Configure-Tunnel.ps1` stores the runtime key in ignored `runtime\.env.local`. ACL inheritance is disabled and access is limited to the current user, SYSTEM, and the local Administrators group.

Do not paste the key into an issue, log, command argument, or support bundle. Re-run `Configure Tunnel.cmd` from the same Windows account that owns the installation. A credential copied from another machine or account must be reviewed and deliberately replaced.

## Control opens and immediately closes

WorkForge wrappers preserve non-zero exit codes and pause on failure. For automation without prompts:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status -NoPause -Plain -NoLog
```

The error panel identifies the failed action, provides a sanitized reason, and prints a Doctor or uninstall hint.

## Tunnel does not become ready

Run Doctor and Status:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Doctor.ps1 -Online
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status -NoPause -Plain
```

Operational tunnel files are below:

```text
<profile>\artifacts\workforge-mcp\tunnel
```

Useful files include `supervisor.log`, `supervisor.process.stderr.log`, `tunnel.log`, `tunnel.stderr.log`, `recovery.json`, and `health.url`. Do not publish the entire profile or engine runtime directory.

## Recovery reports `exhausted`

The supervisor permits a bounded number of same-profile restarts and never replays MCP commands. When the budget is exhausted:

1. inspect Doctor and the tunnel logs;
2. correct the configuration, credential, network, or executable problem;
3. issue an explicit Stop;
4. issue an explicit Start.

Do not repeatedly kill the tunnel process on a machine with active work. The destructive recovery test is intended for a controlled validation session.

## The extracted engine folder was moved, renamed, or deleted

The current package is portable, so shortcuts and the engine-local registry refer to the extracted directory. Put the new release in a stable directory and run `Setup.cmd` again. Auto mode detects the durable profile and performs Repair without overwriting the profile instructions or tunnel configuration.

Do not copy `runtime\.env.local` to another person or machine. Reconfigure a user-owned runtime key when moving across Windows accounts.

## ChatGPT cannot find or attach the tunnel

Confirm that:

- Developer mode is enabled in **Settings > Security and login**;
- the Plugins page is opened in the intended ChatGPT workspace;
- **Connection > Tunnel** uses the same tunnel ID;
- the Platform organization and ChatGPT workspace permit the current user;
- local Status reports the tunnel as running and ready.

Setup can open the Plugins page, but cannot grant workspace or organization permissions.

## `PROFILE_SHELL_LEASE_BUSY`

Only one connection-owned PowerShell job may own a profile shell lease at a time. Wait for the existing WorkForge command to complete and inspect its final status. Do not automatically replay a command after a disconnect or ownership loss.

Run the stdio smoke test from an ordinary standalone terminal, not from inside a WorkForge shell already owning the same profile lease:

```powershell
npm.cmd run smoke:stdio -- workstation
```

## Tunnel is stopped after reboot

This is expected. WorkForge intentionally creates no Windows service, scheduled task, Run key, or startup item. Start it manually from `WorkForge Control.cmd` or an explicit `Control.ps1 -Action start` command.

## Preview uninstall without changing anything

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts\Uninstall.ps1 `
  -Mode KeepWorkspace `
  -NonInteractive `
  -WhatIf `
  -Plain `
  -NoLog
```

The preview validates profile identity, the registry, source/release engine state, and removal targets while custom mutation gates remain disabled.

## Uninstall refuses to remove the workspace

A full removal is deliberately fail-closed. Interactive use must type:

```text
REMOVE WORKFORGE
```

Non-interactive use must specify both:

```powershell
-Mode RemoveEverything -ConfirmFullRemoval
```

Uninstall also refuses drive roots, the user-profile root, the engine root as a workspace, reparse-point paths, mismatched identity markers, and registry/profile mismatches.

## Uninstall preserves the engine directory

This is expected when:

- the directory contains `.git` and is therefore a protected source checkout;
- `.workforge-release.json` is missing or invalid;
- another registered profile still uses the engine;
- `-KeepEngine` was requested;
- engine removal was only previewed with `-WhatIf`.

Only a verified release distribution can schedule detached self-removal.

## Release finalizer reports failure

The finalizer writes a small result receipt below the system temporary WorkForge uninstall-results directory. A failure usually means:

- the parent uninstaller did not exit within the timeout;
- the release manifest disappeared or changed;
- the engine became a source checkout;
- a file remained locked;
- the target no longer passed safe-path validation.

Do not manually broaden permissions or recursively delete an uncertain path. Confirm the exact release directory, close processes using it, and rerun `Uninstall.cmd`. The workspace and profile registration may already be removed even when engine cleanup fails.

## The local key was removed but the Platform key still exists

This is intentional. Uninstall removes the protected local credential when the final profile is removed, but does not revoke the OpenAI Platform runtime key. Revoke it separately only after confirming no other installation uses it.

See [Uninstall WorkForge](UNINSTALL.md) for retained data and permanent-removal behavior.
