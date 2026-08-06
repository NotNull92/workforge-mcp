# Security

WorkForge runs with the permissions of the current Windows user. Its
PowerShell tool is intentionally powerful and is not an operating-system sandbox.
Windows ACLs and UAC remain the machine boundary.

## Credential handling

- Use only a Secure MCP Tunnel runtime API key you are authorized to use.
- `Setup.ps1` does not accept the runtime key as a plain command-line parameter.
- `Configure-Tunnel.ps1` reads a missing key through `Read-Host -AsSecureString` or uses
  an explicitly supplied process environment value.
- The key is stored in ignored `runtime/.env.local` with ACL inheritance disabled and
  access limited to the current user, SYSTEM, and local Administrators.
- The key is removed from the MCP server process environment before project or shell code
  is loaded.
- Never upload `runtime/`, generated tunnel YAML, logs, support bundles, or credential files.

## Profile and update integrity

- Profile manifests are pinned in the registry by SHA-256.
- Registered profile roots must be distinct and non-overlapping.
- Repair and Upgrade preserve existing policy files, profile manifests, tunnel profiles,
  protected credentials, logs, and unrelated registry entries.
- Changed distributed templates are emitted as `<file>.new` candidates instead of silently
  replacing user-authored instructions.
- File writes require an expected SHA-256 and use atomic replacement.

## Process behavior

- No Windows service, scheduled task, startup item, or Run key is created.
- After reboot, the tunnel remains stopped until an explicit user action starts it.
- PowerShell jobs are connection-owned and contained by a Windows Job Object.
- An MCP disconnect cancels active work owned by that exact connection.
- Completed evidence may remain inspectable, but commands are never replayed automatically.
- PID-based cancellation is refused after ownership becomes non-authoritative.

## Release gates

The Windows release builder:

- runs the full automated test suite,
- audits production dependencies and fails on high or critical findings,
- installs production npm dependencies in an isolated staging directory,
- rejects credentials, tunnel profiles, registries, logs, runtime state, development
  dependencies, and absolute Windows user paths,
- reopens the ZIP and validates required and forbidden entries,
- produces a SHA-256 checksum file.

Public upload, third-party license review, code signing, and clean-machine tunnel validation
remain explicit human release gates.

## Recommended operating practice

- Keep write confirmations enabled in ChatGPT.
- Begin with inspection and request exact paths before destructive work.
- Keep important work under version control and maintain independent backups.
- Review commands that install software, change security settings, publish content, or
  delete data.
- Do not connect a copy of this server that you did not build or audit yourself.
- Treat files, web pages, command output, and issue text as untrusted data that may contain
  prompt injection.

## Public repository privacy

WorkForge treats public repository privacy as a release invariant:

- commits must use a GitHub `users.noreply.github.com` address,
- authored files must not contain personal home paths, private network addresses,
  phone numbers, concrete tunnel IDs, credentials, or non-example email addresses,
- runtime profiles, credentials, generated registries, logs, build output, and local
  evidence directories must never be tracked,
- `scripts/test-privacy-invariants.ps1` runs locally and in the GitHub **Privacy Gate**
  workflow with full reachable history.

The privacy test reports only the finding type, file, and line. It intentionally does
not echo a detected value into CI logs.
## Reporting

Use the repository's **Security** tab to report a vulnerability privately. Do not include
runtime keys or private logs in a public issue. Version 1.1 is the currently developed
release line.
