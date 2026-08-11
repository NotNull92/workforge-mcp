# macOS setup

The macOS port keeps the Windows portable release unchanged. It runs local commands with
`/bin/zsh -f`, contains each shell job in its own POSIX process group, and uses the current
macOS user's permissions. WorkForge never installs a LaunchAgent or starts at login.

Requirements: Apple Silicon or Intel macOS, Node.js 20.19 or newer, Git, and ripgrep.

Setup validates the running Node.js version before writing profile state. Doctor validates
the exact Node.js executable recorded in `~/Library/Application Support/WorkForge/current.json`.
After upgrading Node.js, rerun setup; if the executable path changed, configure the tunnel again
so its generated stdio command points to the supported runtime.

```sh
npm ci
npm run build
node scripts/macos/setup.mjs --project /absolute/path/to/project --profile workstation
node scripts/macos/doctor.mjs
npm run install:tunnel:macos
npm run configure:tunnel:macos
```

The tunnel runtime version, canonical OpenAI release URL, architecture-specific archive name,
and SHA-256 are read from `runtime-lock.json`. Apple Silicon selects the `darwin-arm64`
archive and Intel selects `darwin-amd64`; unsupported architectures fail closed.

Tunnel configuration prompts for the OpenAI `tunnel_id` and collects the Runtime API Key in
a hidden macOS dialog unless an explicit process environment value is supplied for that one
configuration run. The complete key is stored as password data in macOS Keychain under
service `io.workforge.control-plane`.

The Runtime API Key is not placed in command-line arguments. WorkForge invokes the macOS
`security` tool in interactive mode and sends an `add-generic-password` command with the
hex-encoded password data through the child process stdin. The hex form is only transport
encoding inside stdin; it is never placed in the OS process argument list. Long-running
supervisor processes are started with `CONTROL_PLANE_API_KEY` removed from their
environment; only the short-lived `tunnel-client` child receives the Keychain value through
its environment because the OpenAI tunnel client explicitly supports
`--control-plane.api-key env:CONTROL_PLANE_API_KEY`.

Tunnel configuration is transactional: the generated YAML is copied into a temporary file in
the destination directory and atomically renamed, so projects on another APFS volume or an
external disk do not depend on a cross-device `/tmp` rename. If the final Doctor check fails,
the previous tunnel config and previous Keychain credential are restored.

The tunnel remains stopped until explicitly started:

```sh
npm run start:tunnel:macos
npm run status:tunnel:macos
npm run stop:tunnel:macos
```

After setup, open the local dashboard by double-clicking `WorkForge Control.command` in Finder,
or launch it from Terminal:

```sh
./WorkForge\ Control.command
```

The macOS dashboard supports tunnel start, status, stop, online Doctor, and safe profile
unregistration while preserving the workspace. The source preview does not yet provide the
Windows transactional updater or the destructive "Remove Everything" action, so those controls
are disabled on macOS. Installing a newer source release still requires downloading it, running
`npm ci`, `npm run build`, and rerunning `setup:macos` from that release.

`start` and `status` require both local tunnel readiness and a successful control-plane
Doctor check. A locally healthy process with a rejected or revoked Runtime API Key is not
reported as ready. The supervisor has a bounded restart budget and exponential backoff.

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
notarize a public macOS release artifact and it creates no LaunchAgent or login item.
