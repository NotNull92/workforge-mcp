# Architecture

## Runtime path

```text
ChatGPT developer-mode app
        |
OpenAI Secure MCP Tunnel endpoint
        |
tunnel-client (outbound HTTPS, explicit user start)
        |
stdio: node dist/stdio.js --profile workstation
        |
profile registry + profile SHA-256 + identity marker
        |
filesystem / Git resume / PowerShell tools
```

The local machine does not expose an inbound MCP listener to the public internet. The
`tunnel-client` creates the outbound tunnel connection and owns the stdio child server.

## Setup orchestration

```text
Setup.cmd
    |
scripts/Setup.ps1
    |-- environment validation
    |-- Install.ps1: Install, Repair, or Upgrade
    |-- Configure-Tunnel.ps1 when configuration is missing
    |-- Doctor.ps1
    |-- explicit first Start
    `-- browser handoff to ChatGPT Plugins
```

Setup is orchestration, not a new security boundary. The lower-level scripts remain the
source of truth and can be invoked independently. Setup creates no startup persistence.

## State ownership

The engine and generated mutable state are separated from the durable workstation profile:

```text
<engine>/
  dist/                         built MCP server
  node_modules/                 exact runtime dependencies in a release ZIP
  runtime/                      ignored registry, credential, downloads, tunnel-client

%USERPROFILE%/WorkForge/
  AGENTS.md                     user-owned operating instructions
  README.md                     user-owned profile notes
  WORKSTATION_POLICY.md         user-owned safety policy
  workstation.marker           profile identity marker
  tools/workforge-mcp/
    profile.json                hashed profile manifest
    tunnel.local.yaml           ignored generated tunnel profile
  artifacts/workforge-mcp/ ignored logs, PIDs, leases, and command evidence
```

The registry supports multiple distinct profile roots. Each profile manifest is pinned by
SHA-256. A selected profile cannot use direct filesystem or shell tools inside another
registered profile's root.

## Mutation gates

- `workstation_context` returns all bootstrap instructions and a `contextRevision` hash.
- File mutation and shell execution require the current revision.
- File replacement requires the exact current SHA-256.
- Writes use temporary files and atomic replacement.
- Shell work is connection-owned, bounded, and contained by a Windows Job Object.
- Commands are never replayed automatically after disconnect or ownership loss.

## Release build

```text
source checkout
    |-- npm run check
    |-- TypeScript build and tests
    |-- production audit
    `-- isolated staging
          |-- copy dist and public files
          |-- npm ci --omit=dev
          |-- reject credentials, runtime state, personal paths, and dev packages
          |-- generate ZIP and SHA-256
          `-- reopen and validate archive contents
```

A v1.1 runtime ZIP is prebuilt but still relies on system Node.js, Git, and ripgrep. The
future portable-runtime task moves the engine to a stable per-user application directory
and bundles verified runtimes behind a signed installer.
