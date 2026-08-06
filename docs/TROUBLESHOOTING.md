# Troubleshooting

This guide covers the v1.1 Windows runtime and source checkout.

## Setup reports a missing command

The current runtime ZIP requires these applications on `PATH`:

```powershell
Get-Command node.exe
Get-Command git.exe
Get-Command rg.exe
node.exe -p "process.versions.node + ' ' + process.arch"
```

Expected Node output is version 20 or newer with architecture `x64`. Setup does not
install or elevate system software. Install missing prerequisites from their official
publishers, open a new terminal so `PATH` is refreshed, and run `Setup.cmd` again.

Release users do not need npm, TypeScript, or Vitest. A source checkout needs npm only
when `dist/` or the exact production dependencies are absent.

## `Install.cmd` says the profile already exists

`Install.cmd` is the install-only compatibility entry point. Use `Setup.cmd` for the
beginner workflow or run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Install.ps1 -Mode Repair
```

Repair preserves policy files, the profile manifest, tunnel configuration, credentials,
logs, and unrelated registry entries.

## Setup cannot accept the tunnel ID

A tunnel ID must match this exact shape:

```text
tunnel_ followed by 32 lowercase hexadecimal characters
```

Create or copy it from OpenAI Platform tunnel management. Do not enter an Admin API key,
project key, or ChatGPT session token in the tunnel ID field.

## Runtime key or credential ACL validation fails

`Configure-Tunnel.ps1` stores the runtime key in the engine's ignored
`runtime\.env.local` file. ACL inheritance is disabled and access is limited to the
current user, SYSTEM, and the local Administrators group.

Do not paste the key into an issue, log, command argument, or support bundle. Re-run
`Configure Tunnel.cmd` from the same Windows account that owns the installation. If the
file was copied from another machine or account, review its owner and ACL before replacing
it. A replacement is a credential change and should be deliberate.

## Control used to open and immediately close

Version 1.1 keeps failures visible. `WorkForge Control.cmd` pauses on a non-zero exit,
and `Control.ps1` prints the failed action, error message, Doctor hint, and log directory.

For automation without prompts:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status -NoPause
```

## Tunnel does not become ready

Run Doctor and Status:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Doctor.ps1 -Online
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status -NoPause
```

Operational tunnel files are under:

```text
<profile>\artifacts\workforge-mcp\tunnel
```

Useful files include `supervisor.log`, `supervisor.process.stderr.log`, `tunnel.log`,
`tunnel.stderr.log`, `recovery.json`, and `health.url`. Do not publish the entire profile
or engine runtime directory because it can contain sensitive local metadata.

## Recovery reports `exhausted`

The supervisor permits a bounded number of same-profile restarts. It never replays MCP
commands. When the budget is exhausted:

1. inspect Doctor and the tunnel logs,
2. correct the underlying configuration, credential, network, or executable problem,
3. issue an explicit Stop,
4. issue an explicit Start.

Do not repeatedly kill the tunnel process to test recovery on a machine with active work.
The destructive recovery test is intended for a controlled validation session.

## The extracted engine folder was moved, renamed, or deleted

The v1.1 package is portable, so shortcuts and the engine-local registry refer to the
extracted directory. Put the new release in a stable directory and run `Setup.cmd` again.
Auto mode detects the durable profile and performs Repair from the new engine root without
overwriting the profile's instructions or tunnel configuration.

Do not copy `runtime\.env.local` to another person or machine. Reconfigure a user-owned
runtime key when moving across Windows accounts.

## ChatGPT cannot find or attach the tunnel

Secure MCP Tunnel access and ChatGPT Developer mode are separate permissions. Confirm
that:

- Developer mode is enabled in **Settings > Security and login**,
- the Plugins page is opened in the intended ChatGPT workspace,
- **Connection > Tunnel** uses the same tunnel ID,
- the Platform organization and ChatGPT workspace permit the current user,
- local Status reports the tunnel as running and ready.

Setup opens the current Plugins page as a convenience, but it cannot grant workspace or
organization permissions.

## `PROFILE_SHELL_LEASE_BUSY`

Only one connection-owned PowerShell job may own a profile shell lease at a time. Wait for
the existing WorkForge command to complete and read its final status. Do not automatically
replay a command after a disconnect or ownership loss.

The stdio smoke test launches its own MCP shell command. Run it from an ordinary standalone
terminal, not from inside a WorkForge shell that already owns the `workstation` lease:

```powershell
npm.cmd run smoke:stdio -- workstation
```

## Tunnel is stopped after reboot

This is expected. WorkForge intentionally creates no Windows service,
scheduled task, Run key, or startup item. Start it manually from `WorkForge Control.cmd`
or an explicit `Control.ps1 -Action start` command.
