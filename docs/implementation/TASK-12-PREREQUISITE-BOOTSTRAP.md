# TASK-12: Safe prerequisite bootstrap

Status: **Completed on 2026-08-07; amended the same day to make Git optional**

## Goal

Make `Setup.cmd` usable on a clean Windows machine without asking the user to
manually compose a long prerequisite-install command.

WorkForge detects Node.js, Git, and ripgrep first, leaves compatible existing
installations untouched, and separates required runtime components from optional
Git enhancement. Node.js and ripgrep are required; Git is optional and never
blocks Local Folder Mode. An incompatible existing Node.js installation is never
silently replaced or shadowed by a second installation.

## Product decisions

| Component | Required | Command | Minimum | WinGet package |
|---|---|---|---:|---|
| Node.js LTS | Yes | `node.exe` | 20.0.0, x64 | `OpenJS.NodeJS.LTS` |
| Git for Windows | No | `git.exe` | command available | `Git.Git` |
| ripgrep | Yes | `rg.exe` | command available | `BurntSushi.ripgrep.MSVC` |

`npm.cmd` is provided by the Node.js LTS package, but release users do not need
npm. It is validated only when a source checkout must build because its prebuilt
runtime is absent.

## Safety requirements implemented

1. Compatible existing commands are reported and skipped.
2. Missing required Node.js/ripgrep components use interactive consent or the
   explicit `-InstallMissingPrerequisites` switch.
3. Missing Git never blocks Setup. Interactive Setup offers Git separately and
   defaults to continuing in Local Folder Mode.
4. Non-interactive Git installation requires the separate `-InstallGit` switch.
5. Existing Node.js below version 20, non-x64 Node.js, or an unprobeable Node.js
   command is reported as incompatible and is not automatically replaced.
6. WinGet uses exact package IDs, the official `winget` source, `--no-upgrade`,
   `--silent`, and disabled package-manager prompts.
7. WorkForge performs no automatic elevation. Windows or an installer may show
   its normal UAC prompt.
8. The current process PATH is refreshed after installation, then required
   readiness is independently revalidated.
9. Optional Git installation failure degrades to Local Folder Mode instead of
   failing WorkForge setup.
10. Raw WinGet output is not written into lifecycle JSONL logs.
11. Automated tests use injected command and installer fixtures and never install
   or upgrade software on the development machine.

## Implementation completed

- Added `scripts/WorkForge.Prerequisites.ps1` as the shared detector and installer.
- Added `-InstallMissingPrerequisites`, `-InstallGit`, and `-NonInteractive` lifecycle plumbing.
- Made `Install.cmd` forward optional arguments.
- Made WorkForge profile `git init` conditional on Git actually being available.
- Added deterministic Local Folder Mode, explicit optional-Git install, optional-Git failure,
  required-missing, incompatible-version, incompatible-architecture, exact-package-ID, and
  no-upgrade tests.
- Added a real isolated-PATH install regression proving Setup/Install can succeed without Git, reload the installed profile through the registry, and pass Uninstall KeepWorkspace preflight.
- Added a two-profile regression proving multiple profiles load together and legacy duplicate `httpPort` metadata remains compatible without affecting identity.
- Added package-ID, no-force, no-elevation, optional-Git, and explicit-consent security checks.
- Updated README, architecture, security, troubleshooting, third-party, and release docs.
- Required the prerequisite module and no-Git install tests in release-package validation.

## Verification record

The local WinGet catalog resolved the pinned IDs exactly:

```text
OpenJS.NodeJS.LTS                 Node.js LTS
Git.Git                           Git for Windows
BurntSushi.ripgrep.MSVC           ripgrep
```

The full WorkForge quality gate passed:

```text
6 TypeScript test files passed
35 TypeScript tests passed
Prerequisite bootstrap tests passed
Install platform detection passed
Install without Git, profile reload, and uninstall preflight passed
Multi-profile compatibility passed
Install / Repair / Upgrade passed
Setup flow passed
Control UX passed
Control Dashboard passed
ForgeUI rendering passed
Uninstall lifecycle passed
Privacy invariants passed
Security invariants passed
Recovery policy passed
Production dependency audit: 0 vulnerabilities
```

An isolated release build produced and reopened:

```text
WorkForge-v1.2.0-win-x64.zip
Release gate: PASS
No-Git install regression included: yes

The exact archive hash is intentionally not pinned in this source document because this
document is itself included in the release archive; editing the verification record would
therefore change the archive hash.
```

The temporary archive and checksum were removed after validation. No prerequisite
package was installed, upgraded, or removed during automated verification.
