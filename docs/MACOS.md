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
```

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

The source setup is intended for this fork's macOS preview. It does not publish, sign, or
notarize a public release artifact.
