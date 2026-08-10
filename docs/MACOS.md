# macOS ARM64 setup

The macOS port keeps the Windows portable release unchanged. It runs local commands with
`/bin/zsh -f`, contains each job in its own POSIX process group, and uses the current macOS
user's permissions. WorkForge never installs a LaunchAgent or starts at login.

Requirements: macOS on Apple Silicon or Intel, Node.js 20.19 or newer, Git, and ripgrep.

```sh
npm ci
npm run build
node scripts/macos/setup.mjs --project /absolute/path/to/project --profile workstation
node scripts/macos/doctor.mjs
npm run install:tunnel:macos
npm run configure:tunnel:macos
```

Tunnel configuration prompts for the OpenAI `tunnel_id` and collects the Runtime API Key in
a hidden macOS dialog. It stores the complete key as password data in macOS Keychain under
service `io.workforge.control-plane`; this avoids the 128-character limit of Keychain's
interactive `security -w` prompt. The key is loaded into the tunnel process environment at
start and is never written to the repository, profile YAML, or logs.

The tunnel remains stopped until explicitly started:

```sh
npm run start:tunnel:macos
npm run status:tunnel:macos
npm run stop:tunnel:macos
```

`start` and `status` require both local tunnel readiness and a successful control-plane
doctor check. A locally healthy process with a rejected or revoked Runtime API Key is not
reported as ready.

While it is ready, open ChatGPT Settings, enable Developer mode, add a plugin connection of
type Tunnel, select the WorkForge tunnel, set Authentication to None, and create it. Start a
new Chat conversation, type `@WorkForge`, select the plugin, and give it a full local path.

Stage a Codex-ready macOS plugin after setup:

```sh
npm run stage:plugin:macos
```

The result is written to `release/workforge-plugin-macos`. Its launcher reads the non-secret
runtime pointer from `~/Library/Application Support/WorkForge/current.json`; it never stores
tunnel credentials.

To unregister the profile while preserving project-local configuration:

```sh
node scripts/macos/uninstall.mjs --profile workstation
```

The source setup is intended for a private macOS preview. It does not publish, sign, or
notarize a public release artifact and it creates no LaunchAgent or login item.
