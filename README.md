# WorkForge

WorkForge is a secure Windows MCP gateway that lets ChatGPT inspect local projects,
resume Git work, read text and images, apply SHA-guarded edits, and run supervised
PowerShell jobs on the user's workstation through OpenAI Secure MCP Tunnel.

It exposes twelve bounded tools while keeping profile identity, runtime evidence,
credentials, process ownership, and recovery behavior explicit and locally verifiable.

## Release status

Version 1.1 introduces a unified setup entry point, safe Install/Repair/Upgrade
semantics, visible control errors, a prebuilt MCP runtime package, release archive
validation, and a production dependency audit gate.

The Windows runtime ZIP has been validated through the automated Windows suite
and an isolated release-package build. Clean-machine validation with a real user-owned
OpenAI tunnel remains a release gate before broad distribution.

## Quick start

### 1. Prepare the Windows runtime

Requirements for the current v1.1 runtime ZIP:

- Windows 10 or 11 on x64
- Node.js 20 or newer on x64
- Git for Windows
- ripgrep (`rg.exe`)
- a ChatGPT account or workspace allowed to use Developer mode
- your own OpenAI Platform tunnel ID and runtime API key

The runtime ZIP already contains `dist/` and production npm dependencies. Release
users do **not** run npm, TypeScript, Vitest, or the repository test suite during setup.
Node.js, Git, and ripgrep are still external prerequisites until the portable-runtime
milestone is completed.

Extract the ZIP to a stable local directory that you will not casually rename or
delete. Then double-click:

```text
Setup.cmd
```

Setup performs the local steps in order:

1. validates Windows and the engine directory,
2. installs or safely repairs the workstation profile,
3. opens OpenAI tunnel management when tunnel configuration is missing,
4. securely prompts for the tunnel ID and runtime API key,
5. validates the generated tunnel profile,
6. starts the tunnel for this setup session,
7. opens the ChatGPT Plugins page for the final connection.

The runtime API key is collected through a protected prompt. It is not accepted as
a plain command-line parameter and is not written to logs or profile files.

### 2. Finish the ChatGPT connection

In ChatGPT:

1. enable **Settings > Security and login > Developer mode**,
2. open the **Plugins** page,
3. choose the plus button,
4. select **Connection > Tunnel**,
5. choose or enter the same tunnel used by Setup,
6. start a new chat and attach the app.

Secure MCP Tunnel permissions and ChatGPT Developer mode permissions are separate.
Each user must use a tunnel, runtime key, Platform organization, and ChatGPT workspace
they are authorized to use.

Official references:

- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [ChatGPT Plugins](https://chatgpt.com/plugins)

## Existing installations

Running `Setup.cmd` again uses **Auto** mode:

- no profile exists: Install,
- a profile already exists: Repair.

Repair preserves existing policy files, profile manifests, tunnel configuration,
protected credentials, logs, and unrelated registry entries. Upgrade behaves like
Repair and, when a distributed template has changed, writes a sibling `<file>.new`
candidate rather than replacing the user's instructions.

Advanced lifecycle commands:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Install.ps1 -Mode Install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Install.ps1 -Mode Repair
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Install.ps1 -Mode Upgrade
```

The old `-Force` switch remains only as a deprecated alias for Repair. It no longer
overwrites profile policy files.

## Runtime behavior

- Nothing is registered to start with Windows.
- Setup may start the tunnel only because the user launched Setup in the current session.
- After a reboot, the tunnel remains stopped until the user starts it manually.
- An unexpected tunnel exit is retried after bounded delays by the same-profile supervisor.
- A deliberate Stop records intent before terminating the tunnel so recovery cannot race it.
- Active connection-owned PowerShell jobs are cancelled when that exact MCP connection closes.
- Completed command evidence remains inspectable after reconnect.
- Commands are never replayed automatically.

The default operating profile is created at `%USERPROFILE%\WorkForge`.
It is a small Git repository containing durable instructions and the local profile
manifest. The profile can access paths available to the current Windows account,
except roots registered to another WorkForge profile. Windows ACLs and UAC
remain the real machine boundary.

## Control and diagnostics

Double-click `WorkForge Control.cmd` to Start, Status, Stop, or run Doctor. Failures
remain visible and include the failing action, exception message, Doctor hint, and the
relevant local log directory when it can be resolved.

Equivalent commands:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Doctor.ps1 -Online
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action stop
```

See [Troubleshooting](docs/TROUBLESHOOTING.md) for prerequisite, tunnel, recovery,
folder-move, and shell-lease failures.

## ChatGPT Images handoff

`read_image` returns a standard MCP image block so ChatGPT can inspect a local PNG,
JPEG, GIF, or WebP file. ChatGPT Images does not currently promote an image returned
by a connector into an editable image attachment.

For precise image-to-image editing:

1. use WorkForge to locate and inspect the local image,
2. attach that same file to the chat with **Add photos & files**, drag and drop, or paste,
3. ask ChatGPT Images to edit the attached image,
4. save the generated result into the project,
5. use WorkForge to inspect the saved file or continue related source changes.

The direct attachment is required for image editing; changing the MCP image response
format cannot replace it.

## Source development

A source checkout still supports a full local build:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run smoke:stdio -- workstation
npm.cmd run release
```

`npm run check` builds the TypeScript server, runs 31 TypeScript tests, runs the
PowerShell setup and recovery regressions, and audits production dependencies at the
high-severity threshold. The stdio smoke test that exercises `shell_start` must run in
a standalone terminal, not from inside a WorkForge shell that already owns the same
profile lease.

## What is intentionally not included

- personal project profiles or absolute user paths,
- API keys, tunnel YAML, generated registries, logs, runtime state, or browser data,
- browser control, desktop UI automation, or specialized application workers,
- a Windows service, scheduled task, startup item, or automatic privilege elevation,
- bundled Node.js, Git, or ripgrep in the v1.1 runtime ZIP,
- a signed Setup EXE.

The portable runtime and signed installer are specified in
[`TASK-07-PORTABLE-RUNTIME-SETUP-EXE.md`](docs/implementation/TASK-07-PORTABLE-RUNTIME-SETUP-EXE.md).

Read [SECURITY.md](SECURITY.md) before enabling shell tools and
[docs/ADDING_PROFILES.md](docs/ADDING_PROFILES.md) before extending the profile registry.

## License

WorkForge is released under the [MIT License](LICENSE).
