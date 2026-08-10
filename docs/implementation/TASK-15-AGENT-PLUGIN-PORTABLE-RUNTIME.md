# TASK-15: Agent Plugin and Portable Runtime Architecture

Status: **Implemented locally; public release, signing, and third-party license approval remain gated**
Date: 2026-08-09
Baseline: `main` at `9fdfe9f322020b655e9258add6284e260b2154f4`

## Decision summary

WorkForge should adopt a **split package architecture**:

1. a versioned, product-owned Portable Engine containing the WorkForge MCP
   server and its verified Windows runtime;
2. a thin Agent Plugin package containing the WorkForge operating skill and a
   local stdio launcher adapter;
3. generated client adapters for Codex/OpenAI formats where the portable Agent
   Plugins format is not consumed directly;
4. the existing Secure MCP Tunnel connection path for ChatGPT.

Agent Plugins does not replace Portable Runtime or the ChatGPT tunnel. It
standardizes a portable package floor for skills and MCP configuration, while
installation, updates, permissions, credentials, and client UX remain outside
the specification. The Portable Engine must therefore be designed first enough
to freeze its launcher and state contracts; final plugin adapters should follow
that contract rather than preserve today's release-folder paths.

Do not put Node.js, ripgrep, or `tunnel-client` in Git. The release builder
should fetch pinned upstream archives, verify tracked hashes, stage the approved
files and notices, and produce the distributable artifacts.

## Scope

This task treats three topics as one architecture problem:

- adoption of the Agent Plugins package format;
- removal of system Node.js and ripgrep prerequisites from release installs;
- simplification of first-time WorkForge setup.

The design was approved for local implementation on 2026-08-09. It does not
authorize public release, signing, external-service mutation, or legal approval
of third-party redistribution.

## Implementation outcome

WorkForge 0.1.0 now implements the recommended split architecture. The patch
release also normalizes verified Windows stdio paths before tunnel-client parses
the portable MCP command:

- `plugins/workforge/plugin.json`, `mcp.json`, and one WorkForge skill are the
  canonical Agent Plugins package;
- `.codex-plugin/plugin.json` and `.mcp.json` are deterministic generated
  adapters validated by the bundled OpenAI plugin validator;
- release installs stage immutable engines under
  `%LOCALAPPDATA%\Programs\WorkForge\versions\<version>` and select one through
  an atomic, manifest-pinned `current.json`;
- mutable registry, credential, and shared runtime state stays under
  `%LOCALAPPDATA%\WorkForge\runtime`;
- Codex uses the local plugin stdio launcher while ChatGPT continues to use the
  explicit Secure MCP Tunnel path;
- release builds fetch Node.js, ripgrep, and tunnel-client from `runtime-lock.json`,
  verify archive SHA-256 values, and stage license texts without committing
  binaries;
- normal release creation fails closed until third-party license review is
  explicitly acknowledged. `-ValidationBuild` exists only for isolated,
  non-public QA.

## Verified repository baseline

The handoff baseline was checked against the repository rather than assumed:

- `HEAD` and `origin/main` both resolve to
  `9fdfe9f322020b655e9258add6284e260b2154f4`.
- The current branch is `main`.
- The only pre-existing untracked content is `docs/handoffs/`, containing the
  handoff used for this design.
- `package.json` is WorkForge `1.2.0`, requires Node.js 20 or newer, and pins
  `@modelcontextprotocol/sdk` 1.29.0 and Zod 4.4.3.
- The release builder includes compiled `dist`, production npm dependencies,
  source, scripts, docs, templates, and Control UI, but not Node.js or ripgrep.
- `Install.ps1` treats system Node.js and ripgrep as required and Git as
  optional. It downloads and verifies `tunnel-client` v0.0.10 separately.
- `Configure-Tunnel.ps1` validates the selected profile, exact Node executable,
  compiled stdio entry point, and tunnel client before writing the protected
  credential.
- The Dashboard is loopback-only and session-scoped. It resolves System32
  PowerShell, `cmd.exe`, and `taskkill.exe` explicitly and creates no Windows
  startup persistence.
- Profile registries are SHA-pinned, allow multiple distinct profile roots, and
  do not require Git metadata.

The completed TASK-12 through TASK-14 contracts are inputs to this design, not
work to be replaced.

## Current installation map

### Release-user flow

```text
Download WorkForge release ZIP
  -> extract to a stable local folder
  -> run Setup.cmd
  -> validate Windows x64
  -> detect system Node.js, ripgrep, and optional Git
  -> optionally install missing required tools with WinGet
  -> optionally install Git
  -> prepare MCP runtime and workstation profile
  -> download tunnel-client archive and SHA256SUMS
  -> verify and install tunnel-client under engine runtime state
  -> open OpenAI tunnel management
  -> enter tunnel_id
  -> enter Runtime API Key
  -> generate and validate tunnel profile
  -> run Doctor
  -> explicitly start tunnel in this Setup session
  -> open ChatGPT Plugins and attach the same tunnel
```

### Actual interactive and network surfaces

On a clean machine with missing required tools and missing Git, Setup can expose:

| Surface | Count | Notes |
|---|---:|---|
| Local prerequisite approval | 1 | One combined approval for missing Node.js/ripgrep. |
| Optional Git decision | 1 | Defaults to continuing without Git. |
| Secret/non-secret terminal inputs | 2 | `tunnel_id` and masked Runtime API Key. |
| Browser handoffs | 2 | Platform tunnel management and ChatGPT Plugins. |
| WorkForge release download | 1 | User downloads the release ZIP. |
| Required package downloads | 0-2 | Node.js and ripgrep through WinGet when missing. |
| Optional package download | 0-1 | Git only after separate consent. |
| Tunnel-client downloads | 2 HTTP files | Platform archive plus checksum list. |

The first-run implementation is reliable, but the user must understand too many
runtime concepts. The highest-value simplification is to remove system Node.js,
ripgrep, WinGet, and source-build concerns from the release-user path. The
Tunnel ID, Runtime API Key, and ChatGPT/workspace authorization are security and
product boundaries and should remain explicit.

### Source-checkout flow

Source developers may still need system Node.js/npm and the full quality gate.
Portable Runtime should change the release-user path without hiding or weakening
the source-development contract.

## Verified external facts

Facts in this section were checked on 2026-08-09 against primary sources.

### Agent Plugins 1.0.0

The [Agent Plugins specification](https://agent-plugins.org/specification) is a
1.0.0 Working Draft. Its portable package uses:

```text
plugin.json              required root manifest
skills/*/SKILL.md        optional Agent Skills
mcp.json                 optional MCP configuration
<reverse-domain>/        optional client extension directory
```

Important constraints:

- The root manifest schema is closed and requires the canonical 1.0.0 `$schema`.
- Skills and MCP configuration are discovered from fixed locations rather than
  paths declared in `plugin.json`.
- Standard MCP transports are `stdio`, `streamable-http`, and legacy `sse`.
- A bundled stdio executable uses a single bare command or a `./` plugin-relative
  command. Clients must keep package-resolved paths inside the plugin root.
- Clients that launch stdio servers provide `PLUGIN_ROOT` and a persistent,
  client-managed `PLUGIN_DATA` directory.
- Credentials must not be embedded in MCP `env` or HTTP headers. OAuth and
  credential storage are client-managed and are not portable v1 fields.
- A conformant client may support only skills or only one MCP transport.
- Distribution, installation, enablement, updates, and UI are deliberately
  outside the portable standard. See the
  [plugin author guide](https://agent-plugins.org/plugin-authors).

The specification site does not provide a normative registry guaranteeing that
every named agent client implements every component or transport. Client support
must be proven per product and release; steering-committee participation is not
evidence of runtime support.

### OpenAI plugin package

OpenAI currently documents a separate package structure in
[Package your plugin](https://developers.openai.com/plugins/build/plugins):

```text
.codex-plugin/plugin.json   required OpenAI manifest
skills/                     optional skills
.mcp.json                   optional bundled MCP configuration
.app.json                   optional registered MCP connection mapping
hooks/                      optional Codex hooks
assets/                     optional listing assets
```

The OpenAI manifest declares `skills`, `mcpServers`, `apps`, `hooks`, and an
`interface` object as top-level fields. By contrast, Agent Plugins 1.0.0 uses a
root `plugin.json`, fixed component locations, a required `$schema`, and rejects
those portable-unknown top-level fields from having semantics.

Therefore the two manifests are **separate formats**, not identical files. Their
identity metadata overlaps and can be generated from one authoring source, but
their file locations, component discovery, MCP shapes, and presentation fields
must not be manually conflated.

OpenAI's upload normalizer currently recognizes several compatibility manifest
locations, but the supported OpenAI entry point and normalized output remain
`.codex-plugin/plugin.json`; see
[Plugin submission errors](https://developers.openai.com/plugins/deploy/submission-errors).
That upload compatibility does not make a root Agent Plugins v1 manifest an
OpenAI runtime manifest.

### Codex and local stdio

OpenAI documents bundled `.mcp.json` servers with command/args and allows users
to enable, disable, and set approvals for those servers from Codex config. The
current supported plugin browsing surfaces are Codex CLI and Codex in the
ChatGPT desktop app; the IDE extension does not currently offer the plugin
browser. See [Plugins](https://learn.chatgpt.com/docs/plugins) and
[Package your plugin](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).

For this design, Codex CLI and Codex in the desktop app are the verified OpenAI
local-stdio targets. Other clients require their own primary-source and
clean-machine conformance proof before release claims are added.

### ChatGPT and private/local MCP

ChatGPT does not execute WorkForge's Windows stdio command merely because a
portable `mcp.json` exists. Current developer-mode connection methods require a
public HTTPS MCP endpoint or Secure MCP Tunnel. For Tunnel, the user selects an
available tunnel or enters its `tunnel_id`. See
[Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
and [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Secure MCP Tunnel requires a Tunnel ID, a runtime API key, and a reachable stdio
or HTTP MCP server. The private server stays inside the customer-controlled
environment and `tunnel-client` makes outbound HTTPS connections to OpenAI.

Public plugin directory submission is not a replacement for this private path.
OpenAI currently requires a production public HTTPS MCP endpoint and domain
verification for an MCP-backed public submission. WorkForge should not publish
a private workstation MCP as a public hosted plugin merely to avoid Tunnel
setup.

### Runtime candidates

The versions below are current evidence, not authorization to update or bundle.
Final versions and hashes belong in a reviewed runtime lock at implementation.

| Component | Current primary-source evidence | License/notice obligation | Packaging decision |
|---|---|---|---|
| Node.js Windows x64 | Node 24.18.1 is the current v24 LTS archive; the official Windows x64 ZIP is about 37 MB. | Node is MIT with a substantial bundled third-party license set. Redistribute the applicable license bundle and complete third-party review. | Fetch official ZIP during release build, hash-pin it, and stage only after pruning/redistribution review. Never commit the binary. |
| ripgrep Windows x64 | Official releases currently identify 15.2.0; Windows artifacts and per-asset SHA-256 values are published. | Dual MIT/Unlicense. Include the selected license notice. | Fetch the exact official x86_64 MSVC asset during release build, verify a tracked SHA-256, and stage it. Never commit the binary. |
| OpenAI `tunnel-client` Windows amd64 | The official latest release is v0.0.10 and publishes platform archives and checksums. | Apache-2.0; retain license and notices and complete explicit redistribution review. | Prefer build-time staging into the portable release if redistribution review passes; otherwise retain the current pinned install-time download as a gated fallback. Never commit the binary. |

Primary sources:

- [Node.js v24 latest release index](https://nodejs.org/download/release/latest-v24.x/)
- [Node.js license](https://github.com/nodejs/node/blob/main/LICENSE)
- [ripgrep releases](https://github.com/BurntSushi/ripgrep/releases)
- [ripgrep repository and license](https://github.com/BurntSushi/ripgrep)
- [`tunnel-client` releases](https://github.com/openai/tunnel-client/releases)
- [`tunnel-client` repository and license](https://github.com/openai/tunnel-client)

## Architecture alternatives

### Alternative A: minimal adapter-only adoption

Keep WorkForge 1.2's release ZIP, system prerequisites, runtime layout, Tunnel,
Setup, and Control behavior. Add an operating skill and generated plugin
metadata around the existing `dist/stdio.js` command.

Advantages:

- smallest code and release change;
- low lifecycle and rollback risk;
- proves skill wording and Codex plugin discovery early;
- preserves all current tests with only additive package checks.

Disadvantages:

- does not simplify Node.js/ripgrep/WinGet setup;
- plugin launch paths remain coupled to the user's extracted release folder;
- Codex users still need system Node.js;
- final manifests must change again when the portable engine path is introduced;
- does not reduce ChatGPT Tunnel steps.

This is a useful compatibility spike, but not a satisfactory target architecture.

### Alternative B: monolithic portable plugin

Put the WorkForge engine, Node.js, ripgrep, `tunnel-client`, skill, and all
manifests inside one plugin folder. Each supporting client runs the bundled
stdio server directly from that folder.

Advantages:

- visually resembles a single downloadable product;
- Agent Plugins `./` command containment is straightforward;
- a local client needs no independent engine lookup.

Disadvantages:

- duplicates a large runtime for every plugin installation and client scope;
- couples plugin update/uninstall to profile state, credentials, and engine
  rollback;
- places mutable runtime state beside an otherwise replaceable package unless
  every path is redirected correctly;
- risks OpenAI's current 100 MB compressed plugin upload ceiling;
- increases scanning, signing, and license-review scope for every metadata or
  skill update;
- does not eliminate ChatGPT's Tunnel/authorization path;
- makes multi-client package managers the owners of WorkForge engine lifetime.

This option has the simplest package diagram and the worst lifecycle boundary.
It is not recommended.

### Alternative C: versioned Portable Engine plus thin plugin adapters

Install one WorkForge engine per Windows user. Keep immutable versioned engine
files separate from mutable shared state and durable profiles. Ship a small
plugin package whose stdio launcher resolves and verifies the active engine.

Advantages:

- removes system Node.js/ripgrep from the release-user path;
- shares one verified runtime across Codex, Tunnel, Control, and profiles;
- keeps plugin install/uninstall independent from profiles and credentials;
- allows side-by-side upgrades and atomic rollback;
- keeps the Agent Plugin small and portable at the metadata/skill level;
- lets ChatGPT and Codex use different connection adapters over one core;
- preserves one WorkForge implementation and one testable lifecycle boundary.

Disadvantages:

- requires a small, security-sensitive launcher/resolver contract;
- has two installable concepts internally even if Setup presents one product;
- requires runtime lock, license inventory, CVE policy, and new clean-machine
  tests;
- plugin installation and engine installation must report version mismatch
  clearly.

This is the recommended target.

### Comparison

| Criterion | A. Adapter only | B. Monolithic plugin | C. Split engine + adapters |
|---|---|---|---|
| First-time installation | Essentially unchanged | Simple local-client copy, but ChatGPT unchanged | One WorkForge install; separate explicit client attach |
| Release size | Small increase | Largest per plugin/client | Larger engine once; small adapters |
| Security surface | Lowest short-term | Highest and most coupled | Moderate, with one verifiable launcher boundary |
| Update burden | Duplicate future migration | Runtime and skill updates always coupled | Runtime and adapter versions can move independently within compatibility rules |
| Cross-client portability | Metadata only | Superficially high; lifecycle assumptions leak | High for skill/MCP declaration, explicit adapters for client differences |
| Backward compatibility | Highest | Lowest | High with legacy Setup fallback during migration |
| Implementation complexity | Low | Medium initially, high operationally | Medium-high but bounded and testable |
| Migration risk | Low, low payoff | High | Moderate with side-by-side rollout |

## Recommended target architecture

```text
                           WorkForge profile(s)
                    profile registry + SHA identity
                                  |
                                  v
     +---------------------------------------------------------+
     | Versioned Portable Engine                               |
     | WorkForge MCP core + Node + ripgrep + tunnel-client    |
     | verified install manifest + exact executable resolver   |
     +---------------------------+-----------------------------+
                                 |
             +-------------------+-------------------+
             |                                       |
   thin local plugin launcher                 existing Tunnel lifecycle
             |                                       |
     Agent/Codex stdio path                   ChatGPT developer-mode app
             |                                       |
     per-session local process                outbound HTTPS, explicit Start
```

### Portable Engine layout

Proposed installed layout:

```text
%LOCALAPPDATA%\Programs\WorkForge\
  current.json                         generated atomic version pointer
  versions\<workforge-version>\
    .workforge-release.json            release identity
    install-manifest.json              every shipped file hash + runtime lock id
    core\
      dist\stdio.js
      node_modules\...
      scripts\...
      control-ui\...
    runtime\
      node\...
      ripgrep\rg.exe
      tunnel-client\tunnel-client.exe
    licenses\...

%LOCALAPPDATA%\WorkForge\
  runtime\
    profile_registry.json
    credentials\.env.local
    logs\
    runs\
  adapters\                         generated local, client-specific state

%USERPROFILE%\WorkForge\           default durable profile; user-owned
```

Rules:

- Version directories are immutable after validation.
- `current.json` points to a relative version directory and pins the selected
  install-manifest SHA-256. It contains no credential.
- Upgrades stage and validate a new side-by-side version, run Doctor and journey
  checks, then atomically replace `current.json`.
- The previous version remains available for explicit rollback until cleanup is
  separately approved.
- Mutable registries, credentials, logs, downloads, and run state never live in
  a replaceable plugin folder or immutable version directory.
- No background updater, service, scheduled task, Run key, or automatic Tunnel
  start is created.
- The source-checkout layout remains supported as a development mode and is
  never eligible for automatic engine deletion.

### Launcher contract

The portable Agent Plugin should use a plugin-relative command such as:

```text
./bin/workforge-stdio.cmd --profile workstation
```

The thin launcher must:

1. resolve `%LOCALAPPDATA%\Programs\WorkForge` without accepting a caller-supplied
   engine path by default;
2. reject missing, absolute-escape, reparse-point, malformed, or stale current
   pointers;
3. verify the pinned install-manifest hash;
4. verify the exact bundled Node executable and `core\dist\stdio.js` identities;
5. invoke the exact verified Node path with separate arguments and no shell
   command reconstruction;
6. remove Tunnel credentials from the child environment before the MCP core
   loads project or shell code;
7. preserve process exit codes and stdio without starting the Tunnel or a
   persistent helper.

The first implementation may use a small `.cmd` wrapper plus a bounded
System32 PowerShell resolver. A native signed launcher can replace it later only
if measured compatibility or signing requirements justify the additional build
toolchain. The observable launcher contract must remain the same.

### Manifest and source-of-truth strategy

Use the Agent Plugins v1 root `plugin.json` as the canonical portable identity.
Store WorkForge-owned adapter metadata under a WorkForge-controlled reverse-domain
`extensions` key. Keep the canonical MCP declaration in root `mcp.json` and the
canonical operating workflow in one `skills/workforge/SKILL.md`.

At build time, generate and validate:

```text
Canonical authoring package
  plugin.json
  mcp.json
  skills/workforge/SKILL.md
          |
          +-> Agent Plugins distribution (same canonical files)
          |
          +-> .codex-plugin/plugin.json
          +-> .mcp.json
          `-> marketplace metadata when requested
```

Generation rules:

- identity, version, description, author, license, skill path, MCP server name,
  launcher, and arguments have one authored value;
- OpenAI `interface`, `apps`, and hooks remain adapter-only fields;
- generated files carry a generated-file marker where the format permits;
- CI regenerates into a temporary directory and fails on a diff;
- both official schemas are pinned and validated without live schema retrieval
  during user installation;
- client adapters must not become inputs to another adapter generator.

Do not commit a user/workspace-specific `.app.json`. OpenAI's registered MCP
connection ID is local or workspace state and belongs under ignored generated
adapter state after the user creates the ChatGPT connection. Initial migration
phases should keep the current ChatGPT connection handoff rather than pretend a
portable plugin manifest can supply that authorization.

### WorkForge operating skill boundary

The skill should explain when and how to use WorkForge tools and how to recover
from lifecycle failures. It must not duplicate mutable security policy or
profile instructions.

Sources of truth remain:

- MCP tool schemas and annotations for callable behavior;
- `workstation_context` for the current profile, bootstrap instructions, and
  context revision;
- profile `AGENTS.md` and `WORKSTATION_POLICY.md` for user-owned operating rules;
- lifecycle scripts for Start, Stop, Doctor, update, and uninstall behavior.

The skill should explicitly fetch `workstation_context` before mutation and
defer to the returned revision and policy. A plugin update must never silently
replace user-owned profile policy files.

### ChatGPT path

The supported ChatGPT path remains:

```text
Install WorkForge Portable Engine
  -> create/select OpenAI Secure MCP Tunnel
  -> enter Tunnel ID and Runtime API Key once
  -> validate and explicitly Start
  -> create/attach the ChatGPT developer-mode connection
```

Portable Runtime simplifies the Windows machinery around this path but does not
remove the OpenAI/workspace authorization steps. A future public hosted plugin
would be a different product architecture and is an explicit non-goal.

### Codex/local-stdio path

For Codex CLI and Codex in the ChatGPT desktop app:

```text
Install WorkForge Portable Engine
  -> install/enable thin WorkForge plugin
  -> start a new session
  -> Codex launches the verified local stdio engine on demand
```

This path does not need a Tunnel ID, Runtime API Key, or a running
`tunnel-client`. The client-owned stdio subprocess is session-scoped and is not
Windows startup persistence.

The existing Tunnel path remains available when the same profile is also used
from ChatGPT. Both paths must resolve the same profile registry and WorkForge
core rather than ship independent server implementations.

## Security and privacy threat review

| Threat | Required control |
|---|---|
| Plugin path escape or junction swap | Resolve every package and engine path, reject reparse points at trusted boundaries, and enforce plugin-root containment. |
| Runtime binary substitution | Pin upstream archive and installed-file SHA-256 values; probe exact architecture/version; fail closed. |
| Current-version pointer tampering | Relative-only pointer, bounded strict JSON, manifest SHA pin, atomic replacement, and existing-ancestor canonicalization. |
| Credential copied into plugin state | Never place Runtime API Key in `plugin.json`, MCP env, `.app.json`, `PLUGIN_DATA`, browser JavaScript, argv, logs, or support output. Keep the restricted-ACL credential store authoritative. |
| Plugin uninstall deletes user data | Plugin uninstall removes only the adapter. WorkForge Control remains authoritative for engine/profile removal. |
| Engine uninstall breaks another profile | Preserve the shared registry count and multi-profile engine-use checks before removal. |
| Plugin enable starts persistent infrastructure | Local stdio starts only for the client session. Tunnel remains stopped until an explicit WorkForge action. |
| Recovery replays commands | Preserve connection ownership, Job Objects, bounded recovery, and the no-replay rule. |
| Skill bypasses current policy | Require `workstation_context`; never encode a stale bootstrap revision or replace user policy. |
| Browser expands trust boundary | Keep Control on `127.0.0.1` with existing Host, Origin, cookie, CSP, no-CORS, output-bound, and credential-scrubbing controls. |
| Build or release leaks local state | Extend the historical privacy gate and release scanner to every generated plugin and runtime artifact. |
| Automatic update introduces code silently | No background updater. Require explicit update action, verified package, side-by-side staging, and rollback. |

The Windows current-user ACL/UAC boundary remains unchanged. Portable packaging
must not claim to create an OS sandbox.

## No-Git, multi-profile, and lifecycle invariants

- Git remains optional and is not bundled.
- Release installation must succeed with Node.js, npm, ripgrep, Git, and WinGet
  absent from `PATH`.
- Source checkouts may continue using system developer prerequisites.
- The shared profile registry remains strict, SHA-pinned, bounded, and capable
  of loading multiple distinct/non-overlapping roots.
- The default plugin may select `workstation`; additional profile selection must
  use the same registry and must not copy profile definitions into manifests.
- Plugin installation and engine installation must not initialize Git.
- Neither install, repair, upgrade, plugin enablement, nor Windows restart may
  start the Tunnel automatically.
- Local stdio process ownership follows the client connection; Tunnel process
  ownership follows the existing WorkForge lifecycle.

## TASK-07 reassessment

| TASK-07 item | Decision | Rationale |
|---|---|---|
| Remove system Node.js/ripgrep from clean release installs | Retain | This is still the highest-value installation simplification. |
| Stable per-user engine root | Retain and refine | Use versioned subdirectories plus an atomic current pointer rather than an in-place mutable engine. |
| Separate mutable `%LOCALAPPDATA%\WorkForge\runtime` | Retain | Required for upgrades, profiles, credentials, and plugin-independent uninstall. |
| Durable `%USERPROFILE%\WorkForge` profile | Retain | User-owned policy/content must remain outside engine updates. |
| Runtime manifest with versions, URLs, hashes, licenses, architectures | Retain and expand | Add every staged file hash, upstream archive hash, notice inventory, and compatibility id. |
| Prefer bundled exact executables | Retain | Release mode must not silently fall back to conflicting system Node/ripgrep. |
| Git optional | Retain unchanged | No-Git behavior is a product invariant. |
| Inno Setup or WiX first | Reorder | Prove portable ZIP and side-by-side lifecycle before selecting/signing an installer. |
| Signed EXE as initial completion boundary | Replace | Signed installer is a later distribution gate, not the first portable-runtime milestone. |
| Installer owns repair/update/uninstall immediately | Reorder | First preserve existing scripts and add a versioned engine lifecycle; wrap them in an installer after contracts stabilize. |
| Clean-machine acceptance | Retain and broaden | Add no-WinGet, offline-runtime, Codex stdio, ChatGPT Tunnel, multi-profile, upgrade, rollback, and restart checks. |

The old system-prerequisite/WinGet flow should remain temporarily as a
source/developer and legacy-release fallback. It should be removed from the
normal portable release path only after equivalent clean-machine and rollback
coverage is green.

## Phased migration plan

### Phase 0: approve contracts

- Review this architecture.
- Freeze Portable Engine roots, mutable-state roots, launcher behavior,
  compatibility identifiers, and uninstall ownership.
- Decide whether the first supported local plugin surface is Codex-only or also
  other independently verified clients.
- Complete explicit third-party redistribution review before bundling binaries.

Exit gate: approved design and license-review plan; no code shipped.

### Phase 1: canonical plugin model and validation spike

- Add canonical Agent Plugins `plugin.json`, `mcp.json`, and one WorkForge skill.
- Add a deterministic generator for `.codex-plugin/plugin.json` and `.mcp.json`.
- Validate schemas, path containment, generated-file diffs, and absence of
  credentials.
- Keep the generated plugin experimental and out of public distribution.

Exit gate: both manifest families validate from one authored identity and the
skill contains no duplicate mutable policy.

### Phase 2: portable runtime ZIP

- Add the pinned runtime lock and license inventory.
- Make the release builder fetch and verify approved Node.js/ripgrep assets and,
  if approved, `tunnel-client`.
- Stage a versioned immutable engine and separate mutable state.
- Make every runtime consumer resolve exact bundled tools in release mode.
- Preserve the system-prerequisite path for source checkouts.

Exit gate: a clean Windows x64 VM with no Node.js, npm, ripgrep, Git, or WinGet
can install, run Doctor, use local stdio, and uninstall/rollback without network
access except the explicitly tested OpenAI connection path.

### Phase 3: local plugin adapters

- Point the portable `mcp.json` and generated `.mcp.json` at the thin launcher.
- Install and enable the plugin through a local/repo marketplace supported by
  Codex.
- Verify a real MCP initialize/list/call sequence in Codex CLI and Codex desktop.
- Keep ChatGPT on Secure MCP Tunnel and generate no committed `.app.json`.

Exit gate: Codex can call WorkForge through local stdio with Tunnel stopped, and
the same profile still works through ChatGPT after explicit Tunnel start.

### Phase 4: unified Setup and Control UX

- Present one Setup experience with product-level steps:
  `Install WorkForge`, `Connect Codex`, and/or `Connect ChatGPT`.
- Hide Node.js/ripgrep/tunnel-client implementation details during the happy
  path while retaining precise Doctor diagnostics.
- Add explicit update and rollback actions; do not add background update or
  startup behavior.
- Keep profile, credential, and destructive-removal confirmations separate.

Exit gate: representative users can complete each supported connection path
without manually managing runtime tools.

### Phase 5: signed Windows installer

- Select Inno Setup, WiX, MSIX, or another installer only after the portable
  archive and upgrade/uninstall contracts stabilize.
- Add Authenticode signing, publisher identity, SmartScreen/reputation planning,
  installer repair/upgrade entries, and signed-uninstaller checks.
- Preserve `KeepWorkspace` as the default and require explicit destructive
  profile removal.

Exit gate: signed clean-machine install, repair, upgrade, rollback, and uninstall
pass the full release and manual QA gates.

## Required tests and release gates

Existing TypeScript, lifecycle, no-Git, multi-profile, Dashboard, historical
privacy, security, recovery, audit, and release-package gates remain mandatory.

Add before portable release:

1. **Manifest conformance:** validate Agent Plugins 1.0.0 and OpenAI generated
   manifests, fixed locations, contained paths, and deterministic regeneration.
2. **Credential exclusion:** scan canonical and generated plugin files,
   `PLUGIN_DATA` fixtures, release ZIPs, and installed manifests for secret
   shapes and local absolute paths.
3. **Runtime lock:** reject changed URL, version, architecture, archive hash,
   extracted-file hash, or missing license inventory.
4. **PATH isolation:** pass with system Node.js/ripgrep/Git/WinGet removed from
   the test PATH; verify exact bundled executables are used.
5. **Tamper tests:** alter Node, ripgrep, stdio entry, launcher, current pointer,
   release manifest, and reparse boundaries; each must fail closed before
   credential mutation or tool execution.
6. **Portable clean-machine journey:** install from the final archive, create a
   no-Git profile, restart Windows, prove nothing is running, then explicitly
   start only the requested connection path.
7. **Codex manual QA:** install the plugin in Codex CLI and desktop, start a new
   session, initialize MCP, list tools, call a read tool, confirm write approval,
   and close the session without an orphan process.
8. **ChatGPT manual QA:** create/select Tunnel, attach the developer-mode app,
   exercise read and write tools, stop the Tunnel, and verify no command replay
   after reconnect.
9. **Multi-profile journey:** install two profiles, use each explicitly, remove
   one, upgrade/rollback the engine, and prove the other profile and credential
   ownership remain correct.
10. **Plugin/engine uninstall matrix:** plugin-only removal, KeepWorkspace,
    RemoveEverything, last-profile engine cleanup, and source-checkout
    self-removal refusal.
11. **Upgrade/rollback:** stage N+1 beside N, reject an invalid N+1, switch only
    after validation, and roll back without changing profiles or credentials.
12. **License and provenance gate:** verify every staged binary maps to a pinned
    upstream URL/hash and every required license/notice is present.
13. **Size budget:** record compressed and expanded sizes for engine and plugin;
    fail on an approved regression threshold. Keep the thin plugin well below
    OpenAI upload limits even though public submission is not planned.
14. **No-startup scan:** assert no service, scheduled task, Run key, Startup
    shortcut, auto-start flag, or background updater is created.

Manual QA must use the built archive and installed plugin, not only source-tree
tests.

## Update and CVE policy

- Track exact runtime versions and hashes in source, not moving `latest` URLs.
- The release maintainer reviews Node.js security releases, ripgrep advisories,
  `tunnel-client` releases, npm production audit results, and Windows signing
  status before each WorkForge release.
- High/critical runtime fixes require a new WorkForge patch release and full
  portable runtime/regression gates.
- Updates are user-initiated. The product may report that an update exists but
  must not download, switch, start, or remove versions in the background.
- Rollback remains possible while the previous version passes its original
  identity checks and has not been explicitly removed.

## Rollback strategy

Before the portable runtime becomes default:

- retain the WorkForge 1.2 ZIP and prerequisite-based Setup path;
- make plugin adoption additive and disableable;
- keep Tunnel configuration compatible with the existing exact-command form;
- do not migrate or delete credentials until the new engine passes Doctor.

After a portable upgrade:

1. stop only verified WorkForge-owned processes;
2. validate the previous version and its install-manifest hash;
3. atomically repoint `current.json`;
4. run local Doctor without mutating profile or credential state;
5. require an explicit Start for Tunnel recovery.

If plugin loading fails, disable/remove only the plugin adapter and continue to
offer WorkForge Control and the existing Tunnel path. Plugin rollback must not
roll back or delete user profiles.

## Explicit non-goals

- The initial design phase did not authorize product implementation; the
  implementation summarized above followed separate approval.
- No public plugin submission or hosted multi-tenant WorkForge service.
- No removal of Tunnel ID, Runtime API Key, ChatGPT developer mode, workspace
  authorization, or write confirmations.
- No Windows service, scheduled task, Run key, startup shortcut, or background
  updater.
- No Git requirement or bundled Git distribution.
- No storage of credentials in manifests, plugin packages, `PLUGIN_DATA`,
  browser JavaScript, command arguments, or generated marketplace files.
- No automatic conversion of every registered profile into a separate plugin.
- No replacement of user-owned `AGENTS.md` or `WORKSTATION_POLICY.md` during
  plugin or engine updates.
- No large runtime binaries, release archives, generated registries, logs,
  tunnel profiles, or absolute user paths committed to Git.
- No claim of cross-client compatibility without primary-source confirmation
  and a real journey test for that client and transport.

## Acceptance criteria for TASK-15 implementation

Implementation may begin only after this draft is reviewed. The eventual task
is complete when:

- release users need no preinstalled Node.js, npm, TypeScript, Vitest, ripgrep,
  Git, or WinGet;
- the Agent Plugins package and OpenAI adapters are generated from one canonical
  identity and MCP definition;
- Codex executes the verified local stdio engine without Tunnel credentials;
- ChatGPT continues to use the verified private Tunnel path with explicit
  authorization and Start;
- no-Git, multi-profile, no-startup, no-replay, credential, Dashboard, mutation,
  uninstall, privacy-history, and release-identity invariants remain green;
- license, provenance, checksum, CVE, size, signing, clean-machine, rollback,
  and manual QA gates pass on the final artifacts.

## Review questions

1. Approve Alternative C as the target and Alternative A only as a temporary
   manifest/skill spike?
2. Approve versioned engine directories plus an atomic `current.json` pointer?
3. Approve root Agent Plugins `plugin.json`/`mcp.json` as canonical authoring
   inputs with generated OpenAI adapters?
4. Approve Codex local stdio and ChatGPT Secure MCP Tunnel as intentionally
   different connection paths over one engine?
5. Should `tunnel-client` be staged into the first portable ZIP after license
   review, or remain a pinned install-time download for the first migration?
6. Is a `.cmd` + System32 PowerShell launcher acceptable for the first portable
   milestone, with a native signed launcher deferred until evidence requires it?
