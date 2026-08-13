# Architecture

## Runtime path

```text
ChatGPT developer-mode app
        |
OpenAI Secure MCP Tunnel endpoint
        |
tunnel-client (outbound HTTPS, explicit user start)
        |
stdio: <verified-node.exe> <verified-dist/stdio.js> --profile workstation
        |
profile registry + profile SHA-256 + identity marker
        |
filesystem / optional Git resume / PowerShell tools
```

The local machine does not expose an inbound MCP listener to the public internet. The `tunnel-client` creates the outbound tunnel connection and owns the stdio child server.

Codex uses the same engine through the local `plugins/workforge` stdio adapter.
The canonical Agent Plugins `plugin.json` and `mcp.json` generate the OpenAI
`.codex-plugin/plugin.json` and `.mcp.json`; no tunnel credential is stored in
either package. ChatGPT intentionally remains on the Secure MCP Tunnel path.

On macOS, the private source preview supports both direct Codex stdio and ChatGPT
through the OpenAI Secure MCP Tunnel on Apple Silicon and Intel Macs. It uses the
system Node.js and ripgrep, stores a non-secret engine pointer below
`~/Library/Application Support/WorkForge`, and selects the architecture-specific
OpenAI tunnel-client archive from `runtime-lock.json`. The Runtime API Key is kept
in macOS Keychain and is never passed in process command-line arguments. The
long-running supervisor starts with that credential removed from its inherited
environment and runs tunnel children inside the explicit lifecycle contract. Shell
commands use `/bin/zsh -f` inside a dedicated POSIX process group. The portable
runtime and automatic updater remain Windows-only. The shared Control dashboard is
available on macOS, while source-preview setup and tunnel lifecycle also remain
available through explicit CLI commands. The macOS dashboard does not expose update
or Remove Everything actions.

## Windows setup orchestration

```text
Setup.cmd
    |
scripts/Setup-Entry.ps1
    |-- verify portable release identity
    |-- stage versions/<version>
    |-- atomically select current.json
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

## Windows Control dashboard launch

```text
WorkForge Control.cmd
    |
scripts/Launch-Control.ps1
    |-- resolve bundled Node.js in portable releases, system Node.js in source checkouts
    |-- start hidden control-server.mjs
    `-- return immediately; no startup persistence
            |
            v
    127.0.0.1:<ephemeral-port>
            |
      control-ui/index.html
            |
            |-- GET  /api/status
            |-- POST /api/start
            |-- POST /api/stop
            |-- POST /api/doctor
            |-- POST /api/uninstall/preview
            |-- POST /api/uninstall
            `-- POST /api/shutdown
                    |
                    v
          existing PowerShell lifecycle scripts
```

The browser dashboard is a presentation layer over the existing PowerShell source of truth. `Control.ps1` remains available through `WorkForge Control.cmd --cli` and direct action invocation.

The dashboard server binds only to IPv4 loopback (`127.0.0.1`) on an ephemeral port. It does not enable CORS and rejects unexpected `Host` headers. A random in-memory session secret is delivered only through an HttpOnly, SameSite=Strict cookie. Mutating POST requests additionally require the exact same-origin `Origin` header. Responses use a restrictive Content Security Policy, deny framing, disable caching, and do not expose the Runtime API Key to browser JavaScript.

The Node control process changes its working directory to the system temporary directory so a verified release engine can still remove itself during uninstall. Because the working directory is intentionally untrusted, dashboard PowerShell, `cmd.exe`, and `taskkill.exe` are resolved through explicit `%SystemRoot%\System32` paths. Status checks are coalesced with a short server-side cache and the browser polls every five seconds. When browser polling stops, the server exits after a bounded idle period. No service, scheduled task, Run key, or other persistent dashboard process is created.

## Prerequisite bootstrap

```text
Source-checkout Install or Setup prerequisite stage
    |
WorkForge.Prerequisites.ps1
    |-- required: resolve Node.js and ripgrep from the current PATH
    |-- optional: resolve Git for enhanced project-history features
    |-- reject incompatible existing Node.js without replacement
    |-- ask before installing missing required components
    |-- offer Git separately; default to Local Folder Mode without it
    |-- automation: -InstallMissingPrerequisites for required components
    |               -InstallGit for optional Git
    |-- use exact WinGet package IDs, --no-upgrade, and no automatic elevation
    `-- refresh process PATH and independently revalidate required components
```

The package catalog is fixed to `OpenJS.NodeJS.LTS`, `Git.Git`, and
`BurntSushi.ripgrep.MSVC`, but only Node.js and ripgrep participate in required readiness.
Missing Git never blocks Setup. When Git is absent, the WorkForge profile remains a normal
local folder, still loads through the profile registry, and `project_resume` reports Git unavailable.
WorkForge never initializes its operating profile as a Git repository. Git is used only when the
selected target project is already a Git worktree; existing profile Git metadata from older versions
is preserved but is not required for normal operation.
Compatible existing installations cause no package-manager call. Unit tests inject command
and installer fixtures, so the quality gate never installs or upgrades software on its runner.

Portable releases bypass this required-component bootstrap. Their exact Node.js,
ripgrep, and tunnel-client archives are pinned in `runtime-lock.json`, verified
before release staging, and re-pinned by the installed engine manifest. Git
remains optional in both modes.

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
%LOCALAPPDATA%/Programs/WorkForge/
  current.json                  atomic relative version pointer + manifest SHA-256
  versions/<version>/           immutable selected engine
    runtimes/node/node.exe      bundled runtime
    runtimes/ripgrep/rg.exe     bundled search executable
    runtimes/tunnel-client/     bundled ChatGPT tunnel executable
    plugins/workforge/          Agent Plugins package and generated Codex adapter
    .workforge-install.json     immutable runtime SHA-256 manifest

<source checkout>/
  dist/                         built MCP server
  node_modules/                 development/runtime dependencies
  runtime/                      ignored registry, credential, logs, downloads, tunnel-client
  .workforge-release.json       release-only identity; never committed to source

%LOCALAPPDATA%/WorkForge/runtime/
  profile_registry.json         shared multi-profile registry
  .env.local                    restricted-ACL tunnel credential
  logs/                         redacted lifecycle logs

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

The registry supports multiple distinct profile roots. Each profile manifest is pinned by SHA-256. New profiles no longer emit the unused `httpPort` field; older v1 profiles that still contain a valid port remain readable for compatibility, and duplicate legacy values do not affect profile identity. Direct filesystem tools reject another registered profile's root, and `shell_start` applies the same rule to its working directory. The PowerShell command itself is not an OS sandbox and retains the current Windows user's ACL/UAC access.

On Windows, `scripts/profile-registry.ps1` remains the compatibility entry point for existing lifecycle scripts. It now delegates profile, credential, and stdio validation to `WorkForge.ProfileRuntime.ps1` and tunnel/process concerns to `WorkForge.TunnelRuntime.ps1`. Shared profile limits live in `workforge-contract.json` and are consumed by both TypeScript and PowerShell.

## Transactional updates

v0.2.0 introduced the Windows portable update transaction. The already-published v0.1.0 build has no updater UI, so it requires a one-time Release ZIP plus `Setup.cmd` bridge into the v0.2.x line. v0.2.1 fixes the post-upgrade Setup parameter forwarding in the original v0.2.0 bridge, so new v0.1.0 bridge attempts should use v0.2.1 or a newer stable release. Once any v0.2.x engine is active, the same transaction is available from WorkForge Control.

```text
canonical stable GitHub Release
    |-- exact Windows ZIP + exact .sha256 asset
    |-- HTTPS canonical repository asset URLs only
    |-- SHA-256 verify before extraction
    `-- verify .workforge-release.json version
             |
Stage-WorkForgePortableVersion
    |-- copy into versions/<new-version>
    `-- generate and verify full immutable-engine manifest
             |
transaction snapshot
    |-- current engine version
    |-- exact tunnel.local.yaml bytes per configured profile
    `-- which registered tunnels are currently running
             |
activate new engine
    |-- atomically switch current.json
    |-- synchronize stable Control launchers
    |-- rebuild configured tunnel profiles against new Node/stdio paths
    |-- local Doctor validation
    `-- restart only tunnels that were running before the update
             |
any failure
    |-- stop newly started tunnel processes
    |-- restore exact prior tunnel configuration bytes
    |-- reactivate the previous engine and stable launchers
    `-- restart the tunnels that were running before the update
```

The updater intentionally does not rewrite the protected runtime credential, profile registry, user policy files, or workspace content. Future Windows releases that are reachable through the v0.2.0 updater must retain the `Configure-Tunnel.ps1 -RebindRuntime` compatibility surface or the transaction fails and rolls back. Update discovery uses the fixed `NotNull92/workforge-mcp` GitHub release endpoint and accepts stable semantic versions only.

## Mutation gates

- `workstation_context` returns all bootstrap instructions and a `contextRevision` hash.
- File mutation and shell execution require the current revision.
- Platform-aware path comparison, containment, and existing-ancestor canonicalization are centralized in `src/path-policy.ts` so profile, filesystem, Git-resume, and shell boundaries share the same semantics.
- File replacement requires the exact current SHA-256.
- Writes use temporary files and atomic replacement.
- Shell work is connection-owned and bounded. Windows uses a Job Object; macOS uses a dedicated POSIX process group for cancellation, timeout, and descendant cleanup.
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

KeepWorkspace removes operational profile configuration and command evidence but preserves the workspace folder, policy files, user-created files, and Git history when that workspace happens to use Git. RemoveEverything requires an exact confirmation phrase or an explicit non-interactive destructive switch.

A directory containing `.git` is always treated as a source checkout and is never auto-deleted. A release engine can remove itself only when `.workforge-release.json` is valid and no other profile remains registered.

## Quality gates

`npm run check:core` owns the platform-neutral TypeScript and plugin checks. `npm run check:windows` adds portable-runtime, installer, dashboard, privacy, security, recovery, and production-audit coverage. `npm run check:macos` adds the macOS setup/doctor/uninstall and plugin smoke flow. GitHub runs the Windows and macOS gates separately on Node.js 20 and 24 so a platform port cannot silently bypass CI.

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
          |-- fetch and SHA-verify runtime-lock.json archives
          |-- stage Node.js, ripgrep, tunnel-client, and upstream licenses
          |-- include canonical Agent Plugins and generated Codex adapters
          |-- reject credentials, runtime state, logs, receipts, personal paths, and dev packages
          |-- generate ZIP and SHA-256
          `-- reopen and validate archive contents and release identity
```

The portable WorkForge ZIP needs no system Node.js, ripgrep, npm, or Git.
`Setup.cmd` stages it into the stable per-user application directory and leaves
Windows startup unchanged. Source checkouts retain the older prerequisite path.
Normal release creation remains blocked until third-party license review is
explicitly acknowledged; signing and public publication remain separate gates.
