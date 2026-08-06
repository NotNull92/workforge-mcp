# TASK-01: Control Error UX and Wrapper Reliability

Status: **Completed on 2026-08-06**
Priority: **P0**

## Objective

Prevent `WorkForge Control.cmd` from disappearing after an error and provide a concise diagnostic that identifies the failed action, the exception message, and the local log locations that can help resolve the issue.

## Current failure mode

`WorkForge Control.cmd` does not pause on a non-zero PowerShell exit. `Control.ps1` also allows terminating exceptions to bypass its final prompt. A failed Start action therefore closes the console before the user can read the reason.

## Design

1. Add error-level handling to the CMD wrapper.
2. Wrap action dispatch in `try/catch/finally`.
3. Preserve non-zero exit codes for automation.
4. Keep direct command actions non-interactive unless explicitly launched in menu mode.
5. Add a reusable error renderer that does not print environment variables or credential contents.
6. Print deterministic log paths for supervisor, tunnel, and setup diagnostics when the profile can be resolved.
7. Run the menu in a loop so a user can inspect Status or Doctor after another action.
8. Add `-NoPause` for tests and scripted use.

## Files

- `WorkForge Control.cmd`
- `scripts/Control.ps1`
- `scripts/test-control-ux.ps1`
- `package.json`

## Error output contract

The human-facing failure block must contain:

- `Action failed: <action>`
- exception message
- `Doctor` command recommendation
- relevant log directory or a statement that it could not be resolved

It must not contain the runtime API key, credential-file content, or a full environment dump.

## Acceptance criteria

- A failing menu action leaves the console readable.
- A direct action returns exit code 1 on failure.
- `-NoPause` suppresses interactive prompts.
- Successful direct actions retain exit code 0.
- No startup behavior changes.

## Implementation result

Implemented in `scripts/Control.ps1` and `WorkForge Control.cmd`. Direct actions now
propagate exit codes, menu actions remain usable after a failure, and the diagnostic block
shows the action, exception, Doctor hint, and log directory without printing credentials.
`scripts/test-control-ux.ps1` passes.
