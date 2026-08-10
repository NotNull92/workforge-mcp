# WorkForge Release-Root Control Handoff

Date: 2026-08-10
Status: **Control wrapper fix committed; next session should decide and prepare v0.1.1**

## Goal

Continue from the first public WorkForge release and ship the smallest follow-up
needed for `WorkForge Control.cmd` launched from an extracted portable release
root after Setup. Preserve the portable installed-engine boundary, no-startup
default, no-Git behavior, profile isolation, and existing release invariants.

## Current state

### Done and verified

- v0.1.0 is public at [GitHub Release v0.1.0](https://github.com/NotNull92/workforge-mcp/releases/tag/v0.1.0).
- The release tag points to the approved release commit `97131ae`.
- The reported mismatch was reproduced: the extracted release root was compared
  against the active installed engine under `%LOCALAPPDATA%\Programs\WorkForge\versions\0.1.0`.
- Root cause: the archive-root `WorkForge Control.cmd` launched local
  `scripts\Launch-Control.ps1` / `scripts\Control.ps1` directly. Those scripts
  intentionally load the profile registry and reject a release root that is not
  the active installed engine.
- Fix committed in `084d076 fix: route release control through installed engine`:
  when `.workforge-release.json` exists, the root wrapper delegates to
  `scripts\Portable-Control.cmd`; source-checkout behavior remains unchanged.
- `scripts\test-control-ux.ps1` now asserts the release-root delegation contract.
- Red/green evidence:
  - before the fix, `npm run test:control-ux` failed with
    `Release-root Control wrapper does not delegate to the installed portable engine.`
  - after the fix, it returned `CONTROL_UX_TEST_OK`.
- Manual QA of a release-root wrapper with an active installed 0.1.0 engine
  opened the `WORKFORGE CONTROL` menu and exited with `EXIT=0` using `--cli`.
- Full `npm run check` passed after the fix, including TypeScript tests, portable
  runtime, install modes, setup flow, Control UX/dashboard, uninstall, privacy,
  security, recovery, and `npm audit --omit=dev --audit-level=high`.
- Debug journal and temporary QA fixture were removed. The worktree was clean
  before the fix and contains only the committed fix at this handoff point.

### Done but not yet released

- The fix is in `main` at `084d076`, but the already-published v0.1.0 ZIP and tag
  are immutable and do not contain it.
- The currently installed portable wrapper at
  `%LOCALAPPDATA%\Programs\WorkForge\WorkForge Control.cmd` already works; it
  is the immediate workaround for existing v0.1.0 installations.

## Decisions made

- Keep the installed portable engine as the only runtime authority. The release
  root is an input/bootstrap surface, not a second active engine.
- Delegate only when the root manifest `.workforge-release.json` is present.
  Source checkouts retain their existing direct dashboard and CLI behavior.
- Keep the v0.1.0 GitHub tag/release unchanged. Do not replace or mutate its
  assets to distribute the fix.
- Keep manual startup as the default. The wrapper must not create startup
  persistence or silently start the tunnel.
- Keep Git optional and preserve no-Git, multi-profile, privacy, ACL, and
  credential-handling invariants.

## Open questions / pending decisions

- User/next agent must decide whether to publish a patch release `v0.1.1`.
  A new public release is needed for fresh downloads to receive `084d076`.
- If v0.1.1 is approved, bump all package/plugin manifests consistently, run the
  generator, build the official ZIP with the already-approved third-party
  review gate, and publish a new tag/release. Do not reuse `v0.1.0`.
- Decide whether the README should explicitly say that normal use opens the
  installed copy under `%LOCALAPPDATA%\Programs\WorkForge` or a Desktop
  shortcut. The wrapper fix makes the extracted root safe in v0.1.1, but the
  wording should still distinguish setup input from the installed runtime.

## Next steps

1. Verify `main`, `origin/main`, and the clean worktree; confirm `084d076` is
   present and no v0.1.1 tag exists.
2. If the user approves v0.1.1, update `package.json`, `package-lock.json`,
   `plugins/workforge/plugin.json`, and generated plugin metadata together.
3. Update the release-facing README wording if needed, keeping credentials out
   of examples and preserving the manual ChatGPT plugin steps.
4. Run `node scripts/Generate-Plugin.mjs`, `npm run check`, and the official
   release-package validation. Build with `scripts/Build-Release.ps1
   -ThirdPartyLicenseReviewApproved` only for the approved release set.
5. Commit and push the v0.1.1 preparation, wait for both GitHub Privacy Gate and
   Windows Quality Gate workflows, then create the annotated `v0.1.1` tag and
   GitHub Release with ZIP and matching `.sha256` assets.
6. Download the new assets from GitHub and verify the published digest. From a
   fresh extraction, run `Setup.cmd`, then both root `WorkForge Control.cmd` and
   `WorkForge Control.cmd --cli`; confirm the active installed engine is used.

## References

- Fix commit: `084d076 fix: route release control through installed engine`
- Previous release-approval commit: `97131ae docs: record v0.1.0 release approval`
- Public release: https://github.com/NotNull92/workforge-mcp/releases/tag/v0.1.0
- Root wrapper: `WorkForge Control.cmd`
- Portable delegating wrapper: `scripts/Portable-Control.cmd`, `scripts/Portable-Control.ps1`
- Boundary check: `scripts/profile-registry.ps1`
- Regression test: `scripts/test-control-ux.ps1`
- Runtime/install contract: `scripts/WorkForge.Portable.ps1`, `scripts/Setup-Entry.ps1`
- Release gate: `scripts/Build-Release.ps1`, `THIRD_PARTY_NOTICES.md`
- Architecture record: `docs/implementation/TASK-15-AGENT-PLUGIN-PORTABLE-RUNTIME.md`
- Repository guidance: `AGENTS.md`

## Environment notes / gotchas

- Running the root wrapper from a v0.1.0 extraction after Setup reproduces the
  old error because that published asset predates `084d076`; use the installed
  wrapper as the immediate workaround.
- `scripts\Portable-Control.cmd` clears `PSModulePath` and must remain the
  Windows PowerShell entry point for installed portable control.
- Earlier validation found that `Get-FileHash` and `Set-Acl` can fail to
  autoload under isolated Windows PowerShell module paths. The current code uses
  repository/.NET hashing and ACL helpers; do not reintroduce those cmdlets in
  new release paths.
- Release archives under `release\` are ignored and must never be committed.
- Never copy Tunnel IDs, Runtime API Keys, credentials, profile registries, logs,
  or absolute user paths into this handoff.

## Suggested skills

- `omo:git-master`: invoke for the v0.1.1 version bump, commit, tag, push, and
  release verification.
- `omo:debugging`: invoke if the extracted-root Control mismatch reappears or
  if the fresh-install QA differs from the current evidence.
- `openai-docs`: invoke only when checking current OpenAI tunnel/ChatGPT setup
  behavior during release documentation updates.
- `handoff`: invoke again if the v0.1.1 release is intentionally split across
  another session.
