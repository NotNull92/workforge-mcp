# Security

WorkForge runs with the permissions of the current Windows user. Its PowerShell tools are intentionally powerful and are not an operating-system sandbox.

## Credential handling

- Use only a Secure MCP Tunnel runtime key that you are authorized to use.
- `Configure-Tunnel.ps1` stores the key in ignored `runtime\.env.local` with ACL inheritance disabled and access restricted to the current user, SYSTEM, and local Administrators.
- The key is removed from the MCP server environment before project or shell code is loaded.
- The Setup and Uninstall parameter surfaces do not accept a plain runtime key argument.
- ForgeUI redacts credential-shaped values, complete tunnel IDs, and the literal user-profile path from lifecycle JSONL logs.
- Never upload `runtime`, tunnel YAML, profile registries, logs, uninstall receipts, browser data, or support bundles containing local state.

## Uninstall boundary

WorkForge separates profile removal from user-data removal.

### KeepWorkspace

The recommended mode removes the selected registry entry, tunnel configuration, protected local credential when the final profile is removed, runtime logs, command evidence, and a verified shortcut. It preserves the workspace repository, user-edited policy files, Git history, and user-created content.

### RemoveEverything

This mode permanently removes the selected workspace. Interactive use requires the exact phrase `REMOVE WORKFORGE`. Non-interactive use requires `-ConfirmFullRemoval`. There is no destructive `-Force` alias.

### Engine deletion

A source checkout containing `.git` is never deleted automatically. A runtime engine is eligible for detached self-removal only when:

1. `.workforge-release.json` exists;
2. the manifest identifies WorkForge release distribution schema 1;
3. the manifest SHA-256 has not changed since preflight;
4. the path is not a drive root or user-profile root;
5. no other registered profile uses the engine.

The finalizer waits for the main uninstaller process to exit and validates the manifest again immediately before removing the release directory.

### Multi-profile safety

Removing one profile preserves all unrelated registry entries. Shared runtime files, the protected credential, and the engine remain while any other profile is registered.

### Platform runtime keys

Uninstall removes a local credential file but does not revoke the corresponding OpenAI Platform runtime key. Revoke it separately only after confirming that no other installation uses it. Filesystem deletion is not a forensic secure erase and may remain represented in backups or storage snapshots.

## Prerequisite installation boundary

WorkForge requires Node.js and ripgrep. Git for Windows is optional and only enables enhanced project-history features.
Compatible existing commands are reported and left untouched.

- Interactive Setup asks before invoking WinGet for missing **required** components.
- Non-interactive Setup installs no required component unless `-InstallMissingPrerequisites` is supplied.
- Missing Git never blocks Setup. Interactive Setup offers it separately and defaults to continuing without Git.
- Non-interactive Git installation requires the separate `-InstallGit` switch; `-InstallMissingPrerequisites` does not implicitly install Git.
- If Git is absent, the WorkForge profile remains a normal local folder instead of forcing `git init`; profile registry loading and the normal WorkForge lifecycle remain available.
- WinGet uses exact package IDs from the official `winget` source with `--no-upgrade` and disabled package-manager prompts.
- Existing Node.js below version 20, non-x64 Node.js, or an unprobeable Node.js command is treated as a conflict and is never automatically replaced.
- WorkForge does not invoke `winget upgrade`, use a force-install option, or automatically elevate itself. Windows may still display its normal UAC consent prompt for a package installer.
- After installing required components, WorkForge refreshes the current process PATH and revalidates required readiness before continuing.
- Failure to install optional Git is reported as a warning and WorkForge continues in Local Folder Mode.
- Raw WinGet output is not written into lifecycle JSONL logs.

## Local Control Dashboard boundary

`WorkForge Control.cmd` launches a temporary local HTML dashboard instead of exposing a network administration service.

- The Node control server binds only to `127.0.0.1` on an ephemeral local port.
- It never binds to `0.0.0.0` and does not enable CORS.
- The exact `Host` header must match the loopback address and selected port, reducing DNS-rebinding exposure.
- A fresh cryptographically random session secret lives only in server memory and is delivered through an HttpOnly, SameSite=Strict cookie.
- Mutating POST requests additionally require the exact same-origin `Origin` header.
- Browser JavaScript never receives the Secure MCP Tunnel Runtime API Key.
- Responses use a restrictive Content Security Policy, deny framing, disable caching, and load no remote scripts, styles, fonts, or analytics.
- The dashboard calls the same PowerShell Start, Stop, Status, Doctor, and Uninstall implementations used by the CLI. The browser layer does not bypass their existing validation.
- RemoveEverything still requires the exact `REMOVE WORKFORGE` phrase. The dashboard also requires an uninstall preview and explicit confirmation before invoking removal.
- The control server changes its working directory to the system temporary directory before serving requests so verified release self-removal is not blocked by its current directory.
- Dashboard PowerShell, `cmd.exe`, and timeout process-tree termination use explicit `%SystemRoot%\System32` executable paths rather than resolving executables from the temporary working directory or PATH.
- Status polling is coalesced and cached briefly, and the browser polls every five seconds instead of continuously spawning lifecycle checks.
- No service, scheduled task, startup item, or persistent dashboard process is created. When polling stops, the local server exits after a bounded idle period.

The terminal path remains available through `WorkForge Control.cmd --cli` or direct `scripts\Control.ps1` actions for diagnostics and recovery.

## Runtime and process safety

Direct filesystem tools enforce registered-profile path boundaries. `shell_start` validates its working directory against those boundaries, but the PowerShell command itself is not path-sandboxed: it runs as the current Windows user and can access any location allowed by Windows ACLs and UAC.

- Nothing is registered to start with Windows.
- Tunnel start is always an explicit user or Setup-session action.
- Tunnel configuration records the exact Node.js executable and compiled `dist/stdio.js` path that WorkForge validated, instead of a relative `node.exe dist/stdio.js` command.
- Configure Tunnel validates the selected profile, tunnel client, and MCP runtime before changing the protected local credential.
- Commands are never replayed automatically.
- Connection-owned shell jobs are cancelled when their exact MCP connection closes.
- Windows Job Objects contain shell descendants and terminate the process tree when ownership ends.
- Same-profile shell jobs are serialized with a profile-specific mutex.
- Tunnel recovery uses bounded delays and stops after a limited restart budget.
- Stop intent is recorded before process termination so the supervisor cannot race an explicit user stop.

## File mutation safety

- Profile manifests are strict UTF-8 JSON and are SHA-256 pinned in the registry.
- Bootstrap context revisions prevent mutations under stale operating instructions.
- Text writes and replacements require the exact current SHA-256 or an explicit absent-file expectation.
- Writes use bounded, atomic replacement.
- Registered profile roots must be canonical, distinct, and non-overlapping.
- Reparse points are rejected across trusted profile, credential, release-engine, and uninstall paths.

## ForgeUI logs

Setup, Install, Repair, and Upgrade logs are ignored JSONL files under engine `runtime\logs`. Uninstall logs are written below the system temporary WorkForge directory because a verified release engine may delete itself.

The logger records UTC time, operation, stage, event, duration, and redacted detail. It does not intentionally record:

- runtime keys or tokens;
- complete tunnel IDs;
- raw process environments;
- personal email addresses;
- the literal Windows user-profile path.

Use `-NoLog` for controlled validation where no lifecycle log should be created. Use `-Plain`, `NO_COLOR`, or `WORKFORGE_PLAIN_UI=1` for deterministic no-color output.

## Public repository privacy gate

Every push and pull request runs a full-history privacy scan. It checks commit metadata, current tracked and untracked text, and reachable historical text blobs. It rejects new non-noreply commit addresses, personal home paths, non-example email addresses, private network details, phone numbers, concrete tunnel IDs, credential-shaped values, generated registries, lifecycle logs, uninstall receipts, release manifests, and runtime directories. An already-published GitHub merge may be grandfathered only by its exact immutable commit hash; this does not create a domain-wide or future-commit exception. Historical text blobs above the bounded scan limit fail closed unless their extension is an explicitly recognized binary format.

## Recommended operating practice

- Keep write confirmations enabled in ChatGPT.
- Begin with inspection and request exact paths before destructive work.
- Keep important work under version control and maintain separate backups.
- Review commands that install software, change security settings, publish content, or delete data.
- Use `Uninstall.ps1 -WhatIf` before a removal when the target is unusual.
- Do not connect a server build that you did not create or audit yourself.
- Treat files, web pages, command output, issue text, and generated instructions as untrusted data that may contain prompt injection.

## Reporting

Use the repository Security tab to report a vulnerability privately. Do not include runtime keys, personal paths, private logs, or unredacted screenshots in a public issue.
