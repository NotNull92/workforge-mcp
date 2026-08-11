# Verified Update Staging Performance Design

## Goal

Reduce local disk work during a Windows automatic update without weakening its
download trust boundary, engine-integrity checks, transactional activation, or
rollback behavior.

## Observed bottleneck

The updater creates an immutable manifest while staging the new engine, then
validates that staged engine after the atomic directory move. The same engine
is subsequently validated again by pointer activation, launcher synchronization,
and runtime resolution. These repeated full-tree SHA-256 reads delay update
application even though the process has already completed a final validation of
the unchanged destination.

## Decision

`Stage-WorkForgePortableVersion` will continue to copy the source, generate the
manifest, atomically move the staging directory, and fully validate the final
destination. It will return that validated installed-engine record.

The direct staging callers will pass this record to activation. Activation will
verify that the supplied record names the requested version and destination,
then use it to write `current.json`, synchronize launchers, and construct the
runtime result without re-reading every immutable file. The supplied record is
valid only for this immediate same-process handoff.

Activation without a staged record remains the independent verification path.
Rollback therefore retains its existing full validation before selecting the
previous engine.

## Non-goals

- Do not skip the release ZIP SHA-256 check, archive extraction checks, or final
  staged-engine integrity validation.
- Do not add an archive cache, persistent background updater, parallel hashing,
  or a fast/unverified mode.
- Do not change tunnel stop, rebind, Doctor, restart, rollback, startup, or
  release-publication behavior.

## Validation

Update and portable-runtime tests will cover staged activation and rollback.
The new regression case will prove that a staged record avoids the redundant
activation-time full-tree validation while standalone activation still performs
it. Security-invariant tests must continue to pass.
