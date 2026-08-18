# WorkForge Shell Wait / Step-Splitting Handoff

Date: 2026-08-18
Status: **Reviewed, revised, and verified. Ready to commit with the code changes.**

## Purpose

A user reported that long-running work through WorkForge could lose continuity in ChatGPT. The visible symptom was a ChatGPT-side container sleep timing out while the model was trying to wait for an asynchronous WorkForge shell job.

The reviewed change adds a bounded server-side wait to `shell_status` and `shell_output`, while preserving the existing connection-owned shell model. The review deliberately did not add detached jobs or reconnect re-ownership.

## Baseline

Repository: `NotNull92/workforge-mcp`
Branch: `main`
Baseline HEAD before this work:

```text
1b6378300a5972043bdb50fa0a63e19218411240
docs: correct macOS Control architecture
```

Files in this change:

```text
src/server.ts
src/shell.ts
tests/shell.test.ts
docs/handoffs/shell-wait-and-step-splitting-2026-08-18.md
```

## Verified diagnosis

### 1. No bounded server-side wait existed

Confirmed.

`startShellJob` starts the process, records it in the in-memory job map, and returns `publicStatus(job)` immediately. Before this change, `shell_status` and `shell_output` only performed immediate reads. A caller that wanted to wait for a build or test therefore had to issue repeated polls or wait somewhere outside WorkForge.

This is the concrete problem addressed by `waitMs`.

### 2. Local stdio-owner shutdown cancels shell jobs

Confirmed, with narrower wording than the original hypothesis.

`src/stdio.ts` calls `cancelActiveShellJobs(context)` when stdin ends or closes and on SIGINT/SIGTERM. Therefore, if the local stdio owner shuts down, attached shell jobs are cancelled.

The review did **not** establish that every transient ChatGPT or Secure MCP Tunnel disconnect closes the local stdio owner. The implementation and server guidance therefore no longer claim that a temporary connection drop necessarily kills the job, and they do not claim that regular `waitMs` traffic prevents tunnel disconnects.

Step splitting remains useful for recovery: long work should be divided into recoverable checkpoints so an interrupted session loses as little work as possible.

## Final implementation

### `src/shell.ts`

Adds:

```text
waitForShellSettled(context, id, waitMs, signal?)
```

Behavior:

- `waitMs <= 0` returns immediately and preserves the old default behavior.
- The function polls the in-memory job map every 100 ms.
- It returns when terminal evidence is sealed and the job leaves the map.
- If the process has stopped but terminal sealing does not finish, the wait is bounded by a 2 second seal grace period.
- If the MCP request `AbortSignal` is aborted, the wait returns on the next poll instead of continuing until the full `waitMs` deadline.
- Process, lease, containment, archive, and replay semantics are unchanged.

The poll is intentional because `shell_output.complete` means the terminal manifest is sealed, not merely that the child process emitted `close`.

### `src/server.ts`

Adds `waitMs` to `shell_status` and `shell_output` with this schema:

```text
z.number().int().min(0).max(30_000).default(0)
```

The original 60 second proposal was reduced to 30 seconds. Public OpenAI Secure MCP Tunnel documentation does not provide a numeric ChatGPT/tunnel per-tool request timeout guarantee, while the pinned MCP TypeScript SDK uses a 60 second default request timeout. A 30 second cap leaves margin below that SDK default instead of placing server wait and client deadline on the same boundary.

Both tool callbacks pass the MCP request handler's `extra.signal` into `waitForShellSettled`.

Server instructions now state that:

- `waitMs` is a bounded wait for one status/output read, not a shell-job runtime limit.
- callers should not sleep in another tool to wait for WorkForge.
- local stdio-owner shutdown cancels active jobs.
- long work should use recoverable checkpoints.
- `waitMs` must not be treated as a tunnel-disconnect prevention mechanism.

`shell_start.timeoutMs` remains unchanged at its 600,000 ms default.

### Tool annotations

`shell_status` and `shell_output` retain `readOnlyHint: true` and `idempotentHint: true`.

The wait changes latency but does not mutate the workstation or control the process. Repeating either read has no additional external side effect, so the existing annotations remain appropriate.

### Request concurrency

The pinned MCP SDK dispatches incoming request handlers independently instead of awaiting one handler before receiving the next stdio message. `StdioServerTransport` also continues draining incoming messages while a handler promise is pending. The server-side wait therefore does not introduce a WorkForge-side global request lock.

This does not guarantee that every ChatGPT planning turn will choose to issue parallel tool calls, but the MCP server itself does not serialize all requests behind a blocked `shell_output`.

## Tests added and strengthened

`tests/shell.test.ts` now covers:

1. The public tool schema exposes a 30,000 ms maximum for both shell wait inputs.
2. An aborted request releases `waitForShellSettled` promptly while the shell job remains running.
3. A slow job can settle within one server-side wait and return complete output.
4. An expired wait returns while the job is still running.
5. Long-running wait tests use `finally` cleanup so a failed assertion does not leak a shell job.

TDD red verification was performed before the implementation edits:

```text
publishes a 30 second maximum shell wait
  FAIL: expected maximum 30000, received 60000

stops waiting promptly when the request is aborted
  FAIL: expected <1000 ms, received about 5002 ms
```

After the implementation, the targeted shell suite passed with 13 passed and 1 skipped.

## Fresh verification

Run from the repository root on Windows, Node 24:

```text
npx tsc -p tsconfig.json --noEmit
  PASS

npx vitest run
  7 files passed
  46 tests passed
  1 skipped

git diff --check
  PASS

npm run check:windows
  PASS, exit 0
  PRIVACY_INVARIANTS_TEST_OK
  SECURITY_INVARIANTS_TEST_OK
  RECOVERY_POLICY_TEST_OK
  npm audit: found 0 vulnerabilities
```

The full Windows gate includes build, unit tests, plugin package checks, macOS static/setup checks, portable-runtime/update/prerequisite/install/control/uninstall/privacy/security/recovery checks, and the production audit.

## `smoke:stdio` note

During review, `npm run smoke:stdio` was also reproduced failing when launched **inside an already active WorkForge shell job**. The inner smoke server tried to start another shell using the same `workstation` profile and correctly hit:

```text
PROFILE_SHELL_LEASE_BUSY
```

The reported owner job ID matched the outer WorkForge shell job running the smoke command. This is a self-hosting lease collision, not a regression in `waitMs`. The full `check:windows` gate does not run that shell-starting smoke test.

`smoke:plugin-stdio`, which does not start a nested shell job, passed during review.

## Review verdicts

1. 60 second wait cap: **changed to 30 seconds**.
2. Step-splitting prevents disconnects: **rejected as an unsupported claim**; retained only as recovery guidance.
3. Blocking wait serializes the MCP server: **not supported by the SDK/server implementation**.
4. Cancellation: **fixed by wiring `AbortSignal`**.
5. Ownership asymmetry: **no profile-probing bypass found**; archived lookup still performs manifest/profile validation.
6. Read/idempotent annotations: **retained**.
7. `ponytail:` comment: **removed and replaced with a normal implementation comment**.
8. Instruction size: **tightened while correcting the lifecycle claims**.
9. Wait-test cleanup: **strengthened with `finally`**.
10. Previous privacy flake: **not reproduced in the final full Windows gate**.

## Non-goals preserved

- No detached shell jobs.
- No reconnect re-ownership.
- No automatic command replay.
- No changes to shell lease, process containment, evidence sealing, archive identity, installer, tunnel lifecycle, dashboard, packaging, or release behavior.

## Final recommendation

**Commit the revised implementation.**
