# Third-party notices

WorkForge does not vendor npm dependency source code in Git. `npm ci` installs versions pinned by `package-lock.json`, and the release builder stages production dependencies only.

| Component | Version | License |
|---|---:|---|
| `@modelcontextprotocol/sdk` | 1.29.0 | MIT |
| `zod` | 4.4.3 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vitest` | 4.1.10 | MIT |
| `@types/node` | 24.13.3 | MIT |
| OpenAI `tunnel-client` | 0.0.10 | Apache-2.0 |

The installer downloads the pinned official Windows x64 `tunnel-client` release from `openai/tunnel-client` and verifies both its release archive and executable SHA-256 before installation.

ForgeUI is an original dependency-free PowerShell implementation. Its terminal composition is informed by publicly documented interaction patterns common to Charmbracelet projects, but WorkForge does not vendor, redistribute, compile, or require Gum, Bubble Tea, Lip Gloss, Huh, Charm Log, Bubbles, VHS, or other Charmbracelet source code or binaries.

The WorkForge Control Dashboard is also original and dependency-free at the UI layer. It uses plain HTML, CSS, JavaScript, and Node.js built-in HTTP/crypto/process modules. It does not bundle React, Vue, Electron, a browser runtime, analytics, remote fonts, CDN assets, or another web UI framework.

The prerequisite bootstrap may invoke Windows Package Manager for `OpenJS.NodeJS.LTS` and `BurntSushi.ripgrep.MSVC` after required-component consent. `Git.Git` is optional and is invoked only after separate Git consent or the explicit `-InstallGit` automation switch. These applications are installed from the external WinGet source and are not bundled or redistributed inside the WorkForge archive. Their package manifests, installers, and licenses remain governed by their respective publishers.

Review upstream license texts and the complete dependency graph whenever dependencies, bundled executables, or release packaging change.
