# TASK-14: Correctness and security hardening

Status: **Completed locally on 2026-08-07; Node 20/24 CI matrix will execute on the next publication**

## Goal

Audit WorkForge after the 1.2 lifecycle, Dashboard, and Git-optional changes, then fix contract mismatches that were not covered by the existing green test suite. Prefer narrow corrections and shared policy extraction over a broad rewrite.

## Correctness fixes

### Git-optional lifecycle

The installer already allowed Local Folder Mode, but the shared PowerShell profile loader still required a `.git` directory. The loader now treats Git metadata as optional. When a `.git` path exists, reparse-point safety is still enforced.

The no-Git regression now verifies:

- Install succeeds with Git removed from PATH;
- no `.git` directory is created;
- the profile reloads through the shared registry;
- the deprecated `httpPort` field is absent;
- Uninstall KeepWorkspace preflight succeeds with `-WhatIf`.

### Multi-profile contract

`httpPort` was legacy metadata that was no longer used by the tunnel runtime, but every new profile emitted the same value while the registry rejected duplicate values. New profiles no longer write `httpPort`.

Compatibility behavior:

- missing `httpPort` is the normal v1 profile shape going forward;
- an older profile may still contain one valid port value;
- duplicate legacy port values do not participate in profile identity or uniqueness.

A dedicated two-profile lifecycle test verifies both the new shape and legacy compatibility.

## Security hardening

### Local Control Dashboard

The Dashboard intentionally runs from the system temporary directory, so child executables must not be resolved from that directory or an attacker-controlled PATH entry. The control server now uses explicit `%SystemRoot%\System32` paths for:

- Windows PowerShell;
- `cmd.exe` used only to open the local browser URL;
- `taskkill.exe` used for timeout process-tree termination.

Status polling was also reduced from 2.5 seconds to 5 seconds. Concurrent status requests are coalesced and recent state is cached briefly.

### Tunnel runtime identity

Configure Tunnel now validates the selected profile, pinned tunnel client, Node.js runtime, compiled stdio entry point, and production dependencies before changing the protected local credential. The generated tunnel profile records the exact validated Node.js and `dist/stdio.js` paths instead of the relative `node.exe dist/stdio.js` command.

### Historical privacy coverage

The Privacy Gate now scans:

- current tracked and untracked text files;
- author and committer metadata for all reachable commits;
- reachable historical Git text blobs, including content deleted from HEAD.

Known binary formats are excluded. Oversized historical non-binary blobs fail closed rather than being silently ignored. Findings report only type and object/path metadata, never the matched sensitive value.

A negative regression fixture commits a synthetic private-path pattern, deletes it from HEAD, and verifies that the historical scan still rejects the repository without echoing the matched value.

## Refactoring

### Shared path policy

Windows path semantics were duplicated across profile, workstation, Git-resume, and shell code. `src/path-policy.ts` now owns:

- case-normalized path comparison;
- containment checks;
- exact path equality;
- existing-ancestor canonicalization for paths whose final components do not yet exist.

The existing filesystem, profile, workstation, shell, and Git tests now exercise the same shared policy. A dedicated path-policy test covers child-versus-prefix-sibling behavior, Windows case handling, and missing-descendant canonicalization.

### Shell output accumulation

Live shell stdout and stderr previously concatenated the complete accumulated Buffer for every new chunk. Shell jobs now retain bounded chunk arrays and concatenate only when output is requested, avoiding repeated full-buffer copying while preserving the existing 16 MiB limits and evidence hashes.

## CI contract

The Windows Quality Gate now runs the complete suite against both Node.js 20 and Node.js 24. Node 20 is the declared minimum runtime and Node 24 is the current development runtime.

Security invariants prevent regressions back to:

- mandatory `.git` profile roots;
- unique deprecated `httpPort` requirements;
- relative tunnel MCP runtime commands;
- bare Dashboard PowerShell/cmd resolution;
- missing historical privacy scanning;
- a quality gate that omits Node 20.

## Deliberate non-goals

This task does not split `shell.ts` or `profile-registry.ps1` merely to reduce line counts. Both remain large, but correctness and boundary behavior are now better isolated. A future physical split should be justified by a concrete maintenance need and should preserve the current behavioral tests unchanged.

## Final verification

Local quality verification after the refactor:

```text
TypeScript test files: 6 passed
TypeScript tests: 35 passed
No-Git install + profile reload + uninstall preflight: PASS
Multi-profile + deprecated httpPort compatibility: PASS
Control Dashboard: PASS
Historical privacy negative regression: PASS
Privacy invariants: PASS
Security invariants: PASS
Recovery policy: PASS
Production dependency audit: 0 vulnerabilities
```

The Windows Quality Gate is configured to run the same suite on Node.js 20 and Node.js 24. That matrix cannot execute until these local changes are published. The release archive is rebuilt from this final source state and independently reopened by `test-release-package.ps1`; no exact archive hash is pinned in this source document because the document itself is part of the archive.
