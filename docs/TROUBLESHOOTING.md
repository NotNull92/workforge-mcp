# Troubleshooting

This guide covers the current WorkForge Windows portable runtime and source checkout.

## Setup reports a missing required component

The Windows portable ZIP bundles Node.js and ripgrep. Source-checkout Setup requires Node.js 20.19 or newer and ripgrep; Git for Windows remains optional.
Source-checkout Setup checks these commands before creating or changing a WorkForge profile:

```powershell
Get-Command node.exe
Get-Command rg.exe
node.exe -p "process.versions.node + ' ' + process.arch"
```

When Node.js or ripgrep is missing, interactive Setup offers to install only the missing
required package through WinGet. Compatible existing commands are skipped. Accept the prompt, or
use the explicit non-interactive form:

```powershell
.\Setup.cmd -NonInteractive -InstallMissingPrerequisites -SkipTunnelConfiguration -SkipStart -NoBrowser
```

`-InstallMissingPrerequisites` never installs optional Git. Add `-InstallGit` if automation
should also install Git for project-history features.

If `winget.exe` is unavailable, install or update Microsoft App Installer and open a new
PowerShell window before running Setup again. WorkForge does not bootstrap WinGet itself.

## Git for Windows is not installed

This is supported. WorkForge remains usable in **Local Folder Mode** and can read, search,
edit, inspect images, and run PowerShell commands in ordinary folders that are not Git repositories.

Git only enables **Git Enhanced Mode**. With Git available, `project_resume` can additionally
report branches, recent commits, changed files, staged/unstaged state, and ahead/behind information.
Interactive Setup offers Git separately and defaults to continuing without it. To install Git later,
install Git for Windows normally or rerun Setup and choose the optional Git install.

## Updating WorkForge

The published v0.1.0 build predates the updater UI. To move from v0.1.0 into the v0.2.x line, download **v0.2.1 or a newer stable Windows Release ZIP** and matching `.sha256`, verify/extract it to a new folder, and run that ZIP's `Setup.cmd`. Do not uninstall v0.1.0 first. A valid existing portable installation is used as the rollback target. Do not use the original v0.2.0 ZIP for a new v0.1.0 bridge attempt because it contains a post-upgrade Setup parameter-forwarding bug.

From v0.2.0 onward, open **WorkForge Control** and use **Check again** / **Update WorkForge**. If v0.2.0 is already active after that known Setup error, no reinstall or rollback is needed; update normally to v0.2.1 or newer. Update discovery contacts the canonical stable GitHub Release for `NotNull92/workforge-mcp`; if GitHub is unavailable, the update card may show Unavailable but local tunnel controls continue to work.

A normal update stages and verifies the new engine before stopping any tunnel. Existing configured tunnel profiles are rebound to the new engine's absolute Node/stdio paths, validated with local Doctor, and only the tunnels that were running before the update are restarted. The protected Runtime API Key and user policy files are not rewritten.

If an update fails, read the Dashboard error carefully. WorkForge attempts to restore the previous `current.json` target, stable launchers, exact prior `tunnel.local.yaml` bytes, and pre-update running state. If the message says rollback had issues, keep WorkForge stopped and use the preserved previous version under `%LOCALAPPDATA%\Programs\WorkForge\versions` for recovery rather than deleting either engine.

Advanced CLI checks are also available from an installed engine:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Update.ps1 -Action Check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Update.ps1 -Action Apply
```

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

## macOS Setup or Doctor rejects Node.js

The macOS source preview requires Node.js 20.19 or newer. Setup checks the runtime executing
`setup.mjs` before creating or changing profile state. Doctor separately checks the exact
`nodePath` recorded in `~/Library/Application Support/WorkForge/current.json`, so an old
registered executable cannot be reported as healthy merely because another newer `node`
appears first on `PATH`.

```sh
which -a node
node -p "process.versions.node + ' ' + process.execPath"
```

Upgrade Node.js deliberately and rerun macOS setup. When the executable path changes, run the
tunnel configuration step again before starting the tunnel so the generated stdio command no
longer references the old Node.js path.

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

## Control Dashboard does not open

`WorkForge Control.cmd` now launches a hidden local Node control server and opens the Dashboard in the default browser. The server binds only to `127.0.0.1` on a temporary port.

If the browser does not open:

1. confirm that `node.exe` is available with `Get-Command node.exe`;
2. run `Setup.cmd` again if Node.js or the WorkForge runtime is missing;
3. try the retained terminal fallback:

```text
WorkForge Control.cmd --cli
```

For direct diagnostics or automation without a browser:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status -NoPause -Plain -NoLog
```

If the Dashboard opens but shows **WorkForge status is unavailable**, run Doctor from the Dashboard or use the CLI command above. The Dashboard intentionally does not listen on LAN addresses and will reject requests whose Host, session cookie, or POST Origin does not match its local session.

Closing the browser tab does not create a permanent background service. Once the browser stops polling, the hidden Control Server exits automatically after a bounded idle period.

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
