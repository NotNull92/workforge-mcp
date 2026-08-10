# TASK-17 — Transactional WorkForge Updater

## Goal

Make v0.2.0 the bridge from manual release replacement to a real product update lifecycle without mutating the published v0.1.0 engine or user-owned WorkForge state.

## User flow

### v0.1.0 → v0.2.0

v0.1.0 cannot display an updater that did not exist when it was published. The one-time bridge is therefore:

1. Download the v0.2.0 Windows Release ZIP and matching `.sha256`.
2. Extract to a new folder.
3. Run that release's `Setup.cmd`.
4. Do not uninstall v0.1.0 first.

`Setup-Entry.ps1` recognizes an older active portable engine plus an existing profile registry and routes the upgrade through the same transaction used by the Dashboard.

### v0.2.0 and later

WorkForge Control exposes the installed version, latest stable version, **Check again**, and **Update WorkForge**. The CLI fallback exposes `update-check` and `update` actions through `Control.ps1`.

## Update trust boundary

`WorkForge.Update.ps1` owns update discovery and installation.

- Discovery is fixed to `https://api.github.com/repos/NotNull92/workforge-mcp/releases/latest`.
- Only stable `vX.Y.Z` releases are accepted.
- The exact Windows ZIP and exact `.sha256` companion are required.
- Asset URLs must remain under the canonical HTTPS GitHub Release download prefix for this repository.
- ZIP size and checksum-file size are bounded.
- The SHA-256 companion is verified before extraction.
- The extracted `.workforge-release.json` version must match GitHub metadata.
- The full installed-engine immutable manifest is generated and checked before activation.

The checksum detects corruption and release-asset mismatch. It is not an independent publisher signature; the GitHub repository/account remains in the publisher trust boundary.

## Transaction

`WorkForge.Portable.ps1` separates staging from activation:

- `Stage-WorkForgePortableVersion` installs and verifies a version without changing `current.json`.
- `Activate-WorkForgePortableVersion` atomically updates `current.json` and synchronizes the stable Control launchers.
- `Invoke-WorkForgePortableRollback` also uses activation so launcher files and the pointer cannot drift apart.

`Invoke-WorkForgeTransactionalUpgrade` then performs:

1. Verify and stage the target engine completely.
2. Snapshot every registered configured profile's exact `tunnel.local.yaml` bytes.
3. Record which registered tunnels are currently running.
4. Stop only those running tunnels.
5. Activate the target engine with the old version as `previousVersion`.
6. Run target `Configure-Tunnel.ps1 -RebindRuntime -SkipDoctor` for configured profiles.
7. Run local Doctor on the rebound configuration.
8. Restart only the tunnels that were running before the update.

`-RebindRuntime` extracts the existing tunnel ID from the existing config, validates the protected credential, and regenerates the tunnel profile with the active engine's Node/stdio absolute paths. It does not rewrite the credential file.

## Rollback

Any activation, rebind, Doctor, or restart failure enters rollback:

1. Stop target-engine tunnel processes that may have started.
2. Restore original tunnel configs byte-for-byte.
3. Reactivate the prior engine and synchronize stable launcher files.
4. Restart the tunnels that were running before the update.
5. Report whether rollback itself encountered any issue.

The newly staged version may remain side-by-side after a failed update. It is not selected by `current.json` and is harmless as an immutable inactive version; preserving it also avoids destructive cleanup during an error path.

## Preserved state

The transaction does not intentionally rewrite:

- `%USERPROFILE%\WorkForge` policy or user files;
- the profile registry;
- the protected Runtime API Key;
- Git repositories or project files;
- Windows startup state.

## Compatibility surface

Future Windows versions reachable from the v0.2.0 updater must preserve the installed lifecycle entry points used by the transaction, especially `Configure-Tunnel.ps1 -RebindRuntime`, `Doctor.ps1`, `start-tunnel.ps1`, `stop-tunnel.ps1`, and the portable runtime manifest contract. If a future release violates the expected surface, activation validation fails and the updater rolls back instead of silently running a mixed-version configuration.

## Validation

Automated validation includes:

- stable release metadata acceptance and rejection of non-canonical asset URLs;
- successful side-by-side transactional activation;
- explicit portable rollback after a successful update;
- forced tunnel rebind failure after the config has been mutated, proving engine rollback plus exact config-byte restoration;
- existing portable runtime rollback tests;
- Dashboard/CLI source-contract checks;
- release-package assertions that updater scripts are shipped;
- the normal Windows privacy, security, recovery, lifecycle, and production-audit gates.

Public release publication remains a separate explicit approval gate.
