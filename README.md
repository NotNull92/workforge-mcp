# WorkForge

**English** | [한국어](README.ko.md)

<p align="center">
  <img src="docs/logo/logo.png" alt="WorkForge MCP logo" width="360" />
</p>

> **ChatGPT is smart, but it does not normally have hands inside your PC. WorkForge gives it a safe pair of hands.**

WorkForge connects ChatGPT to your Windows workstation so it can inspect real project files, understand Git state, make guarded edits, read local images, and run supervised PowerShell commands.

In plain language, it is **a secure working bridge between ChatGPT and your computer**.

With WorkForge connected, you can say things like:

```text
"Read this project and tell me where I left off."
"Find out why this build is failing and fix it."
"Update the README so it matches the current code."
"Check Git and summarize my recent work."
"Run the tests and investigate anything that fails."
```

Instead of only explaining what you should do, ChatGPT can **look at the actual workspace and work through the task with you**.

---

## Why does WorkForge exist?

Normally, ChatGPT cannot see the files on your computer.

If a project has a bug, the usual workflow looks something like this:

```text
1. Copy the error message
2. Paste it into ChatGPT
3. Find the related source file
4. Copy that code too
5. Ask for a fix
6. Paste the fix back into the file
7. Run the build yourself
8. Copy the next error
9. Repeat
```

WorkForge changes that loop to:

```text
You
  ↓
"Check the project, find the problem, and fix it."
  ↓
ChatGPT
  ↓
WorkForge
  ↓
Your real files · Git · PowerShell
```

ChatGPT can inspect the information it needs, understand the current state, make allowed changes, and verify the result.

That means moving from **describing your workspace to AI through copy and paste** to **letting AI inspect the workspace and collaborate inside it**.

---

## What gets better?

### 1. You spend less time explaining the project

You no longer need to repeatedly describe the folder structure, paste file contents, and report Git state by hand.

```text
Before
"There is a file under Assets/Scripts..."
"Here is the code..."
"I changed this yesterday..."

With WorkForge
"Read the project."
```

### 2. ChatGPT can answer from the current state

It can inspect the real files and Git status instead of relying only on old conversation context.

Questions like these become much more useful:

```text
"What was I working on recently?"
"How far is this feature implemented?"
"Why is the build broken right now?"
"Change this file and run the tests afterward."
```

### 3. It can move from inspection to verification

WorkForge can do more than read files. It can also run supervised PowerShell jobs.

That enables a practical loop such as:

```text
Inspect code
  ↓
Edit file
  ↓
Run build
  ↓
Read errors
  ↓
Fix again
```

### 4. It does not blindly overwrite files

Guarded edits use the current SHA-256 of a file.

A simple way to think about it is:

> "Only change the file if it is still the same file I just inspected. If somebody changed it first, stop."

This helps prevent stale edits from overwriting newer work.

### 5. Shell work is supervised

PowerShell jobs have separate start, status, output, and cancel operations.

If the ChatGPT connection disappears, WorkForge does not secretly replay an old command later.

---

## What can it do?

WorkForge currently exposes 12 MCP tools, but you do not need to memorize their names. From a user's point of view, they fit into five simple groups.

### 📁 Look through files and folders

```text
"Show me the structure of this project."
"Find files related to inventory."
"Read this configuration file."
```

### ✏️ Create and edit files

```text
"Add the new installation steps to the README."
"Refactor this name safely."
"Create a new configuration file."
```

### 🧭 Understand project state

```text
"Read this project and tell me what I was doing."
"What has changed in Git?"
"What changed since the last commit?"
```

### 🖥️ Run PowerShell work

```text
"Run the build."
"Run the test suite."
"Check the status of this process."
```

### 🖼️ Inspect local images

```text
"Open this PNG and describe the UI."
"Check this image's size and contents."
```

---

## What can I use it for?

WorkForge is not tied to one IDE or one game engine. If a Windows project is made of files and command-line workflows, WorkForge can often help with it.

### Software and game projects

Examples include:

```text
Unity
Godot
Node.js
Python
Web projects
CLI tools
Open-source repositories
```

ChatGPT can inspect the project, understand its current state, make changes, and run validation steps.

### Returning to an old project

After a few weeks away, you can say:

```text
"Read this project and its recent Git history, then tell me where I left off."
```

`project_resume` helps inspect the current branch, changed files, and recent commits.

### Debugging

```text
"Run the build. If it fails, find the related files and investigate the cause."
```

This reduces the amount of error logs and source code you have to shuttle back and forth manually.

### Documentation

```text
"Rewrite the README so it matches the current implementation."
"Check whether the installation scripts and docs still agree."
```

Because ChatGPT can inspect both code and documentation, it can help catch stale instructions.

### Repetitive local workflows

```text
"Check these files for anything that violates this rule."
"Run the tests and summarize only the failures."
```

WorkForge is not a general remote-desktop robot. It focuses on files, Git, images, and PowerShell under the current Windows account and WorkForge's safety rules.

---

## Is it difficult to install?

A normal installation takes **three steps**.

```text
1. Download the ZIP
2. Extract it and run Setup.cmd
3. Connect the same Tunnel in ChatGPT
```

You do not need to manually hunt down Node.js, Git, and ripgrep first.

### 1. Download and extract

Download the latest release archive:

```text
WorkForge-v*-win-x64.zip
```

Extract it to a stable local folder.

### 2. Run Setup

Double-click:

```text
Setup.cmd
```

WorkForge checks these prerequisites first:

```text
Node.js 20+ x64
Git for Windows
ripgrep
```

The rule is simple:

```text
Already installed     → keep it
Missing               → ask before installing with WinGet
Only one thing missing→ install only that thing
Node.js conflict      → stop instead of layering another Node.js on top
```

So **compatible software is not reinstalled just because you ran Setup again**.

Missing packages use exact WinGet package IDs and `--no-upgrade`, so a healthy existing installation is not needlessly upgraded.

If WinGet itself is unavailable, WorkForge does not try to bootstrap it behind your back. Setup stops and tells you to install or update Microsoft App Installer first.

The release ZIP already contains the compiled MCP server and production npm dependencies. Regular release users do not need to run npm, TypeScript, Vitest, or the repository test suite.

### 3. Finish the ChatGPT connection

During Setup, you need an OpenAI Platform Tunnel ID and Runtime API Key that you are authorized to use.

Then in ChatGPT:

```text
Settings
  → Security and login
  → Enable Developer mode
  → Plugins
  → +
  → Connection: Tunnel
  → Select the same Tunnel used by Setup
```

Start a new chat, attach WorkForge, and use it normally.

---

## How do I use it after installation?

You do not need a special command language.

Talk to ChatGPT normally.

For example:

```text
"Check C:\Projects\MyGame and tell me its current state."
```

```text
"Build this project and investigate any errors."
```

```text
"Look at the recent work and update the README."
```

```text
"Inspect this file first, then change it safely."
```

ChatGPT chooses the WorkForge tools it needs.

---

## Is it safe?

WorkForge gives ChatGPT meaningful access to a workstation, so safety is part of the design rather than an afterthought.

### It stays inside the current Windows user's permissions

WorkForge runs as the Windows account that launched it.

It is not a privilege-escalation tool and does not bypass Windows ACLs or UAC.

### It does not install startup persistence

By default, WorkForge does not create:

```text
Windows services
Scheduled tasks
Startup items
Run registry entries
```

After a reboot, the Tunnel stays stopped until the user starts it again.

### It does not replay commands after a disconnect

An interrupted connection does not authorize WorkForge to replay an old PowerShell command later.

### File edits are guarded against stale state

SHA-256 checks help prevent a file that changed in the meantime from being overwritten using an older version.

### Runtime credentials are kept away from ordinary project commands

The Runtime API Key is stored in a protected local file and removed from the environment before project or shell code is launched.

ForgeUI logs also redact user-home paths, complete Tunnel IDs, and common credential-shaped values.

---

## ForgeUI

WorkForge does not dump an unreadable wall of PowerShell output during setup and maintenance.

Its terminal UI shows the lifecycle as clear stages:

```text
✓ Environment
✓ Prerequisites
✓ Runtime and profile
◆ Secure tunnel
○ Health check
○ ChatGPT handoff
```

Successes, warnings, failures, and next steps are easier to spot.

ForgeUI is implemented in PowerShell and does not require `gum.exe` or a Go runtime.

For CI, redirected output, `NO_COLOR`, `WORKFORGE_PLAIN_UI=1`, or `-Plain`, it automatically falls back to deterministic plain text.

---

## What if WorkForge is already installed?

Run `Setup.cmd` again.

WorkForge decides automatically:

```text
No existing profile   → Install
Existing profile      → Repair
```

Repair preserves user-edited policy files, Tunnel configuration, credentials, and related local state instead of blindly replacing them.

Upgrade also avoids overwriting user instructions. If a distributed template changed, WorkForge can place a `<file>.new` candidate next to the user's file for comparison.

---

## Uninstalling WorkForge

Double-click:

```text
Uninstall.cmd
```

You get two choices.

### KeepWorkspace recommended

Remove WorkForge's operational connection and runtime state while keeping your workspace.

```text
Kept
- WorkForge workspace
- Git history
- user-edited policy files
- user-created files

Removed
- Tunnel configuration
- local Runtime credential
- WorkForge runtime state and logs
- profile registry connection
- verified release engine when safe
```

### RemoveEverything

Remove the workspace too.

Interactive mode requires the exact phrase:

```text
REMOVE WORKFORGE
```

WorkForge never automatically deletes a development source checkout.

See [Uninstall WorkForge](docs/UNINSTALL.md) for details.

---

## What WorkForge is not

WorkForge is not:

- a remote-desktop bot that clicks anything on Windows
- a tool that secretly acquires administrator privileges
- an always-on background service
- an automation engine that blindly approves every command
- a plugin tied only to Unity or one specific IDE

Its job is narrower and more deliberate: **provide a clear, verifiable working path between ChatGPT and a local Windows workspace.**

---

## Technical details

Everything below is for people who want to understand or develop WorkForge itself.

### The 12 MCP tools

```text
workstation_context
project_resume
list_directory
search_files
read_text_file
read_image
write_text_file
replace_text
shell_start
shell_status
shell_output
shell_cancel
```

### Default profile

The default operating profile is created at:

```text
%USERPROFILE%\WorkForge
```

It contains durable instructions and local profile information used while WorkForge operates.

### Runtime behavior

- no Windows startup persistence is created
- Tunnel start is explicit
- unexpected Tunnel exits use bounded same-profile recovery
- disconnected commands are never replayed automatically
- PowerShell descendants are managed with Windows Job Objects
- same-profile shell work is serialized to avoid collisions

### Diagnostics

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Doctor.ps1 -Online
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\Control.ps1 -Action status
```

See [Troubleshooting](docs/TROUBLESHOOTING.md) when something goes wrong.

### Source development

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run smoke:stdio -- workstation
npm.cmd run release
```

`npm run check` validates the TypeScript server plus prerequisite detection, installation modes, ForgeUI, Uninstall, privacy, security, Tunnel recovery, and production dependencies.

### Privacy gate

The public repository is scanned to prevent accidental publication of sensitive local data.

Examples include:

```text
personal user-home paths
non-example email addresses
real Tunnel IDs
credential-shaped values
phone numbers
private network information
runtime logs
registry and credential files
```

The same privacy check runs in GitHub Actions on pushes and pull requests.

---

## Learn more

- [Security](SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Uninstall](docs/UNINSTALL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Adding profiles](docs/ADDING_PROFILES.md)

## License

WorkForge is released under the [MIT License](LICENSE).
