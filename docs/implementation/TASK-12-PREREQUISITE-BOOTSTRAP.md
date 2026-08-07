# TASK-12: Safe prerequisite bootstrap

Status: **Completed on 2026-08-07**

## Goal

Make `Setup.cmd` usable on a clean Windows machine without asking the user to
manually compose a long prerequisite-install command.

WorkForge detects Node.js, Git, and ripgrep first, leaves compatible existing
installations untouched, and offers an explicit WinGet install only for missing
requirements. An incompatible existing Node.js installation is never silently
replaced or shadowed by a second installation.

## Product decisions

| Requirement | Command | Minimum | WinGet package |
|---|---|---:|---|
| Node.js LTS | `node.exe` | 20.0.0, x64 | `OpenJS.NodeJS.LTS` |
| Git for Windows | `git.exe` | command available | `Git.Git` |
| ripgrep | `rg.exe` | command available | `BurntSushi.ripgrep.MSVC` |

`npm.cmd` is provided by the Node.js LTS package, but release users do not need
npm. It is validated only when a source checkout must build because its prebuilt
runtime is absent.

## Safety requirements implemented

1. Compatible existing commands are reported and skipped.
2. WinGet is invoked only after an interactive confirmation or the explicit
   `-InstallMissingPrerequisites` switch.
3. Non-interactive execution without that switch fails closed.
4. Existing Node.js below version 20, non-x64 Node.js, or an unprobeable Node.js
   command is reported as incompatible and is not automatically replaced.
5. WinGet uses exact package IDs, the official `winget` source, `--no-upgrade`,
   `--silent`, and disabled package-manager prompts.
6. WorkForge performs no automatic elevation. Windows or an installer may show
   its normal UAC prompt.
7. The current process PATH is refreshed after installation, then all
   prerequisites are independently revalidated.
8. Raw WinGet output is not written into lifecycle JSONL logs.
9. Automated tests use injected command and installer fixtures and never install
   or upgrade software on the development machine.

## Implementation completed

- Added `scripts/WorkForge.Prerequisites.ps1` as the shared detector and installer.
- Added `-InstallMissingPrerequisites` and `-NonInteractive` lifecycle plumbing.
- Made `Install.cmd` forward optional arguments.
- Added deterministic missing, ready, incompatible-version, incompatible-architecture,
  explicit-consent, exact-package-ID, and no-upgrade tests.
- Added package-ID, no-force, no-elevation, and explicit-consent security checks.
- Updated README, architecture, security, troubleshooting, third-party, and release docs.
- Required the prerequisite module and tests in release-package validation.

## Verification record

The local WinGet catalog resolved the pinned IDs exactly:

```text
OpenJS.NodeJS.LTS                 Node.js LTS
Git.Git                           Git for Windows
BurntSushi.ripgrep.MSVC           ripgrep
```

The full WorkForge quality gate passed:

```text
5 TypeScript test files passed
31 TypeScript tests passed
Prerequisite bootstrap tests passed
Install platform detection passed
Install / Repair / Upgrade passed
Setup flow passed
Control UX passed
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
Archive size: 4,815,859 bytes
SHA-256: 515c8f31e410e737dd0c40849e409164501fc567b0a718ffae441ae5d9025a44
```

The temporary archive and checksum were removed after validation. No prerequisite
package was installed, upgraded, or removed during automated verification.
