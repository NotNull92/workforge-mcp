# TASK-11: Lifecycle UI and release integration

Status: **Completed on 2026-08-06**

## Goal

Integrate ForgeUI and uninstall support across the WorkForge lifecycle, release package, automated validation, and public documentation as version 1.2.0.

## Scope completed

1. Setup and standalone Install, Repair, and Upgrade use the shared ForgeUI stage model.
2. `WorkForge Control.cmd` exposes Uninstall through the interactive control menu.
3. `Uninstall.cmd` is a release-root entry point and changes its working directory before invoking the self-removing flow.
4. `.workforge-release.json` is generated only inside release staging, keeping source checkouts ineligible for automatic engine deletion.
5. Archive validation requires Uninstall, finalizer, ForgeUI, release manifest, golden tests, and uninstall documentation.
6. Privacy and security gates cover JSONL logs, uninstall receipts, release identity, destructive confirmation, source protection, external UI dependencies, and wrapper exit-code propagation.
7. `npm run check` includes uninstall and UI-rendering suites.
8. `.github/workflows/windows-quality-gate.yml` executes the complete Windows quality gate on every push and pull request with read-only repository permissions and no persisted checkout credential.
9. README, Security, Troubleshooting, Uninstall, release, architecture, and third-party documents describe the new lifecycle.

## Versioning

The package and lockfile moved from 1.1.0 to 1.2.0 because this release adds a new lifecycle command, release identity format, terminal UI system, and removal semantics.

## Verification record

The final repository check passed:

```text
5 TypeScript test files passed
31 TypeScript tests passed
Install platform detection passed
Install / Repair / Upgrade passed
Setup flow passed
Control UX passed
ForgeUI rendering passed
Uninstall lifecycle passed
Privacy invariants passed
Security invariants passed
Recovery policy passed
Production dependency audit: 0 vulnerabilities
```

An isolated release build produced and validated:

```text
WorkForge-v1.2.0-win-x64.zip
Release gate: PASS
```

The temporary archive and checksum were removed after validation; no generated release artifact was left in the repository.
