# TASK-03: Unified Setup Entry Point

Status: **Completed on 2026-08-06**
Priority: **P0**

## Objective

Provide one beginner-facing command that orchestrates local installation, tunnel configuration, validation, first start, and browser handoff while keeping advanced scripts available.

## Entry points

- `Setup.cmd`: double-click wrapper with durable failure handling.
- `scripts/Setup.ps1`: resumable orchestration and testable command-line interface.

## Stage model

1. `environment`: detect the repository and Windows architecture.
2. `install`: invoke `Install.ps1` in Install, Repair, or Upgrade mode.
3. `tunnel`: configure only when a valid tunnel YAML and protected credential are not already present, or when `-ReconfigureTunnel` is supplied.
4. `doctor`: run local and optional online validation.
5. `start`: start the tunnel only when requested by this setup invocation.
6. `handoff`: open official OpenAI tunnel and ChatGPT connector pages when interactive browser handoff is enabled.

Each stage prints a stable prefix such as `[2/6] install` and stops on failure without continuing into dependent stages.

## Secret handling

- Never accept the runtime API key as a plain command-line parameter.
- Let `Configure-Tunnel.ps1` collect it with `Read-Host -AsSecureString` or use a pre-existing process environment value.
- Do not include secrets in transcript files, exception wrapping, or stage summaries.

## Resume behavior

Setup derives state from files and validation rather than trusting a mutable progress flag. Re-running it:

- chooses Repair when the profile already exists,
- skips tunnel prompts when configuration and credential validation succeed,
- re-runs Doctor,
- starts the tunnel only if `-SkipStart` is not set.

## Automation switches

- `-Mode Install|Repair|Upgrade|Auto`
- `-SkipTunnelConfiguration`
- `-ReconfigureTunnel`
- `-SkipStart`
- `-SkipOnlineDoctor`
- `-NoBrowser`
- `-SkipTunnelDownload`
- `-NoDesktopShortcut`
- `-NonInteractive`

`-NonInteractive` must fail with an actionable message instead of prompting for missing tunnel data.

## Browser targets

- OpenAI tunnel management page
- ChatGPT connector settings page

Browser launch is a convenience only. Setup must remain functional with `-NoBrowser`.

## Acceptance criteria

- A new local profile can be created through one command.
- A preconfigured profile can be repaired without credential prompts.
- Test mode can run without browser, network tunnel configuration, shortcut creation, or process start.
- Setup creates no startup persistence.
- Failure output names the failed stage and returns exit code 1.

## Implementation result

Added `Setup.cmd` and the six-stage `scripts/Setup.ps1` orchestrator. Auto mode installs a
missing profile and repairs an existing profile. Browser, tunnel configuration, Doctor, and
first Start stages can be disabled independently for automation. The runtime key is never a
plain Setup parameter. `scripts/test-setup-flow.ps1` verifies both first install and repeated
Repair while preserving user policy.
