# TASK-02: Safe Install, Repair, and Upgrade Modes

Status: **Completed on 2026-08-06**
Priority: **P0**

## Objective

Replace the ambiguous `-Force` reinstall path with explicit lifecycle semantics and ensure existing profile instructions and registry entries are preserved.

## Modes

### Install

- Requires the selected profile to be absent.
- Creates the profile root, templates, profile manifest, registry entry, runtime directory, tunnel-client, and optional shortcut. If Git is available, the profile root is also initialized as a Git repository; Git is not required for installation.
- Fails without mutation when the profile already exists.

### Repair

- Requires the selected profile to exist.
- Validates or restores engine build output, production dependencies, tunnel-client, registry registration, missing template files, required directories, and shortcut.
- Never overwrites an existing profile policy file, profile manifest, tunnel YAML, credential, or log.

### Upgrade

- Accepts an existing profile and performs Repair behavior.
- Re-hashes and re-registers the current profile manifest.
- When a distributed template differs from an existing user file, writes a sibling `<name>.new` candidate instead of replacing the user's file.
- Also supports first installation for users upgrading by extracting a new release folder.

`-Force` remains a deprecated compatibility alias for Repair and must print a warning.

## Prebuilt runtime detection

The installer first checks for:

- `dist/stdio.js`
- `node_modules/@modelcontextprotocol/sdk/package.json`
- `node_modules/zod/package.json`
- exact versions matching `package.json`

When valid, npm is not required. When absent, a source checkout may use `npm ci` and `npm run check` to produce the runtime.

## Registry merge algorithm

1. Read the existing registry only when present.
2. Validate version and a bounded profile array.
3. Preserve entries for other profile IDs.
4. Reject a different profile ID that points to the same profile path.
5. Replace or append the selected profile entry using the current profile-file SHA-256.
6. Write through a temporary file and atomically replace the registry.

## Template ownership

User-owned after first creation:

- `AGENTS.md`
- `README.md`
- `WORKSTATION_POLICY.md`
- `.gitignore`

Identity-owned and validated:

- `workstation.marker`
- `tools/workforge-mcp/profile.json`

Repair does not overwrite either category. Upgrade may emit `.new` template candidates but never silently changes user instructions.

## Files

- `scripts/Install.ps1`
- `scripts/test-install-platform.ps1`
- `scripts/test-install-modes.ps1`
- `package.json`

## Acceptance criteria

- Existing policy-file hashes remain unchanged after Repair and Upgrade.
- Existing tunnel YAML and credential hashes remain unchanged.
- Other registry entries survive an update.
- The selected profile hash is refreshed correctly.
- Release installation skips npm when a valid prebuilt runtime exists.
- Source installation still works when npm is available.

## Implementation result

Implemented explicit Install, Repair, and Upgrade modes in `scripts/Install.ps1`. Repair and
Upgrade preserve policy files, tunnel configuration, credentials, logs, profile manifests,
and unrelated registry entries. Upgrade emits changed templates as `.new` candidates and preserves an existing user-modified candidate.
Prebuilt releases skip npm; source checkouts retain the build fallback.
`scripts/test-install-platform.ps1` and `scripts/test-install-modes.ps1` pass.
