# Third-party notices

WorkForge does not vendor npm dependency source code in Git. `npm ci` installs versions pinned by `package-lock.json`, and the release builder stages production dependencies only.

| Component | Version | License |
|---|---:|---|
| `@modelcontextprotocol/sdk` | 1.29.0 | MIT |
| `zod` | 4.4.3 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vitest` | 4.1.10 | MIT |
| `@types/node` | 24.13.3 | MIT |
| Node.js Windows x64 runtime | 24.18.1 | Node.js license |
| ripgrep Windows x64 runtime | 15.2.0 | MIT OR Unlicense |
| OpenAI `tunnel-client` Windows x64 runtime | 0.0.10 | Apache-2.0 |
| OpenAI `tunnel-client` macOS source-preview runtime | 0.0.11 | Apache-2.0 |

The portable Windows release builder downloads the pinned official Windows x64 Node.js,
ripgrep, and `tunnel-client` archives listed in `runtime-lock.json`, verifies
their SHA-256 values, and stages their upstream license texts. The executables
and release archives are never committed to Git.

The private macOS source preview does not redistribute a macOS tunnel binary in a WorkForge
release asset. Its explicit installer selects the Apple Silicon or Intel OpenAI
`tunnel-client` 0.0.11 archive from `runtime-lock.json`, downloads it directly from the
canonical OpenAI GitHub Release URL on the user's Mac, and verifies the pinned SHA-256 before
extraction.

ForgeUI is an original dependency-free PowerShell implementation. Its terminal composition is informed by publicly documented interaction patterns common to Charmbracelet projects, but WorkForge does not vendor, redistribute, compile, or require Gum, Bubble Tea, Lip Gloss, Huh, Charm Log, Bubbles, VHS, or other Charmbracelet source code or binaries.

The WorkForge Control Dashboard is also original and dependency-free at the UI layer. It uses plain HTML, CSS, JavaScript, and Node.js built-in HTTP/crypto/process modules. It does not bundle React, Vue, Electron, a browser runtime, analytics, remote fonts, CDN assets, or another web UI framework.

The source-checkout prerequisite bootstrap may invoke Windows Package Manager
for `OpenJS.NodeJS.LTS` and `BurntSushi.ripgrep.MSVC` after required-component
consent. `Git.Git` is optional and requires separate consent. Portable release
installs do not use WinGet for Node.js or ripgrep.

For v0.1.0, the complete 93-package production dependency graph was checked:
all packages declare MIT, ISC, BSD-2-Clause, or BSD-3-Clause terms and include a
license file. The pinned Node.js, ripgrep, and Windows `tunnel-client` archives and their
staged upstream license texts were also verified. Third-party redistribution
for this exact Windows release set was explicitly approved on 2026-08-10.

Repeat the review and obtain a new explicit approval whenever dependencies,
bundled executables, or release packaging change. A validation build remains
non-public QA evidence only.
