# Architecture

## Runtime path

```text
ChatGPT developer-mode app
        |
OpenAI Secure MCP Tunnel endpoint
        |
tunnel-client (outbound HTTPS, explicit user start)
        |
stdio: node dist/stdio.js --profile workstation
        |
profile registry + profile SHA-256 + identity marker
        |
filesystem / Git resume / PowerShell tools
```

The local machine does not expose an inbound MCP listener to the public internet. The `tunnel-client` creates the outbound tunnel connection and owns the stdio child server.

## Setup orchestration

```text
Setup.cmd
    |
scripts/Setup.ps1
    |-- ForgeUI environment stage
    |-- WorkForge.Prerequisites.ps1: detect, consent, missing-only WinGet bootstrap
    |-- Install.ps1: Install, Repair, or Upgrade
    |-- Configure-Tunnel.ps1 when configuration is missing
    |-- Doctor.ps1
    |-- explicit first Start
    `-- browser handoff to ChatGPT Plugins
```

Setup is orchestration, not a new security boundary. The lower-level scripts remain the source of truth and can be invoked independently. Setup creates no startup persistence.

## Prerequisite bootstrap

```text
Install or Setup prerequisite stage
    |
WorkForge.Prerequisites.ps1
    |-- resolve Node.js, Git, and ripgrep from the current PATH
    |-- reject incompatible existing Node.js without replacement
    |-- ask for consent, or require -InstallMissingPrerequisites in automation
    |-- invoke exact WinGet package IDs only for missing commands
    |-- use --no-upgrade and no automatic elevation
    `-- refresh process PATH and independently revalidate every command
```

The package catalog is fixed to `OpenJS.NodeJS.LTS`, `Git.Git`, and
`BurntSushi.ripgrep.MSVC`. Compatible existing installations cause no package-manager
call. Unit tests inject command and installer fixtures, so the quality gate never installs
or upgrades software on its runner.

## ForgeUI rendering and logs

```text
lifecycle script
    |
scripts/WorkForge.UI.ps1
    |-- rich ANSI + Unicode panels on capable interactive terminals
    |-- deterministic ASCII output for CI, redirects, NO_COLOR, or -Plain
    `-- redacted JSONL lifecycle events
```

ForgeUI is a dependency-free PowerShell module. It does not require Gum, Go, or another terminal UI executable. Setup, Install, Repair, and Upgrade logs are written below ignored engine `runtime/logs`. Uninstall logs are written below the system temporary WorkForge log directory because a verified release engine may remove itself.

The log formatter replaces the literal user-profile and engine-root prefixes, complete tunnel IDs, and common credential shapes before serializing an event.

## State ownership

The engine and generated mutable state are separated from the durable workstation profile:

```text
<engine>/
  dist/                         built MCP server
  node_modules/                 exact runtime dependencies in a release ZIP
  runtime/                      ignored registry, credential, logs, downloads, tunnel-client
  .workforge-release.json       release-only identity; never committed to source

%USERPROFILE%/WorkForge/
  AGENTS.md                     user-owned operating instructions
  README.md                     user-owned profile notes
  WORKSTATION_POLICY.md         user-owned safety policy
  workstation.marker           profile identity marker
  tools/workforge-mcp/
    profile.json                hashed profile manifest
    tunnel.local.yaml           ignored generated tunnel profile
  artifacts/workforge-mcp/      ignored logs, PIDs, leases, and command evidence
```

The registry supports multiple distinct profile roots. Each profile manifest is pinned by SHA-256. A selected profile cannot use direct filesystem or shell tools inside another registered profile's root.

## Mutation gates

- `workstation_context` returns all bootstrap instructions and a `contextRevision` hash.
- File mutation and shell execution require the current revision.
- File replacement requires the exact current SHA-256.
- Writes use temporary files and atomic replacement.
- Shell work is connection-owned, bounded, and contained by a Windows Job Object.
- Commands are never replayed automatically after disconnect or ownership loss.

## Uninstall lifecycle

```text
Uninstall.cmd
    |-- changes cwd to a temporary directory
    |
scripts/Uninstall.ps1
    |-- verify safe workspace path, marker, profile SHA, and registry entry
    |-- explicit KeepWorkspace or RemoveEverything confirmation
    |-- stop only the verified tunnel and supervisor
    |-- remove only the selected registry entry
    |-- verify shortcut identity before removal
    |-- remove selected local runtime/profile data
    `-- optionally schedule verified release-engine removal
             |
      temporary uninstall-finalizer.ps1
             |-- wait for the parent process to exit
             |-- re-check safe path and release-manifest SHA-256
             `-- remove the release directory and write a temporary receipt
```

KeepWorkspace removes operational profile configuration and command evidence but preserves the workspace Git repository, policy files, and user-created files. RemoveEverything requires an exact confirmation phrase or an explicit non-interactive destructive switch.

A directory containing `.git` is always treated as a source checkout and is never auto-deleted. A release engine can remove itself only when `.workforge-release.json` is valid and no other profile remains registered.

## Release build

```text
source checkout
    |-- npm run check
    |-- TypeScript build and tests
    |-- lifecycle, privacy, security, and production audit gates
    `-- isolated staging
          |-- copy dist and public files
          |-- generate .workforge-release.json
          |-- npm ci --omit=dev
          |-- reject credentials, runtime state, logs, receipts, personal paths, and dev packages
          |-- generate ZIP and SHA-256
          `-- reopen and validate archive contents and release identity
```

The WorkForge 1.2 runtime ZIP is prebuilt but still relies on system Node.js, Git, and ripgrep. Setup can install missing requirements with explicit WinGet consent, but the runtimes are not bundled. The future portable-runtime task moves the engine to a stable per-user application directory and bundles verified runtimes behind a signed installer.
