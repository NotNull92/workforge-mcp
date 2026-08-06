# TASK-05: Validation and Security Gates

Status: **Completed on 2026-08-06**
Priority: **P1**

## Objective

Add regression coverage for the simplified workflow and block releases with known high-severity production dependency findings.

## Test layers

### TypeScript tests

Retain all existing filesystem, profile, resume, shell, and workstation tests.

### PowerShell regression tests

- platform detection without the `OS` environment variable,
- Install versus Repair versus Upgrade behavior,
- policy-file preservation,
- registry merge preservation,
- Setup no-browser and no-tunnel path,
- Control failure exit and wrapper pause contract,
- release archive required and forbidden entries,
- tunnel recovery decision policy.

### Dependency gate

Run:

```powershell
npm audit --omit=dev --audit-level=high
```

The release check fails on high or critical production findings. Moderate findings remain visible and must be reviewed before release.

### Smoke test isolation

The stdio smoke test that exercises `shell_start` must run outside an already-held profile shell lease. Documentation and CI must not launch it from inside the same connected WorkForge shell context.

## Package scripts

The intended check graph is:

```text
build
unit tests
installer platform test
installer modes test
setup test
control UX test
recovery policy test
production audit
```

Release-package validation may run as part of the release command to avoid recursively generating artifacts during the normal check.

## Security review checklist

- No runtime key in process arguments or logs.
- No policy-file overwrite during Repair or Upgrade.
- No registry truncation of unrelated profiles.
- No startup persistence.
- No automatic command replay.
- No release archive credential material.
- Non-zero process exits propagate correctly.

## Acceptance criteria

All automated checks pass on Windows x64 and the final Git diff contains no runtime files, credentials, logs, absolute personal paths, or release artifacts.

## Implementation result

The check graph now includes the 31 TypeScript tests, installer platform and lifecycle tests,
Setup resume test, Control UX test, static security invariants, recovery policy, and a
high-severity production audit gate. The security test rejects startup-persistence commands,
plain credential-shaped Setup parameters, wrapper exit-code loss, and a hard-coded MCP
server version. The current production audit reports zero known vulnerabilities. A separate temporary-profile stdio smoke also validates all 12 tools and tunnel-key environment scrubbing without colliding with the live workstation lease.
