# TASK-13 — Local HTML Control Dashboard

Status: Completed on 2026-08-07

## Goal

Replace the default terminal menu launched by `WorkForge Control.cmd` with a friendly local HTML dashboard while preserving the existing PowerShell lifecycle scripts as the source of truth and retaining a CLI recovery path.

## User experience

Double-clicking `WorkForge Control.cmd` now launches a hidden local Node process and opens the default browser. The dashboard shows:

- secure tunnel Online / Offline state;
- health and readiness;
- supervisor and recovery state;
- Start, Stop, Refresh, and Doctor actions;
- recent in-memory dashboard activity;
- a guided uninstall flow with WhatIf preview;
- KeepWorkspace and RemoveEverything choices;
- exact `REMOVE WORKFORGE` confirmation for full removal.

The original terminal interface remains available through:

```text
WorkForge Control.cmd --cli
```

Direct `scripts\Control.ps1 -Action ...` automation remains supported.

## Architecture

```text
WorkForge Control.cmd
    |
scripts/Launch-Control.ps1
    |
node scripts/control-server.mjs
    |
127.0.0.1:<ephemeral-port>
    |
control-ui/
    |-- index.html
    |-- style.css
    `-- app.js
    |
existing PowerShell lifecycle scripts
```

No React, Electron, WebView runtime, CDN, web framework, or new npm production dependency is introduced. The dashboard uses Node built-in HTTP APIs and plain HTML/CSS/JavaScript.

## Security model

The dashboard is deliberately not a LAN or internet administration service.

- Bind address is fixed to `127.0.0.1`.
- Port defaults to an ephemeral OS-selected port.
- `0.0.0.0` is forbidden by security tests.
- CORS is not enabled.
- The exact Host header must match `127.0.0.1:<port>`.
- Each process creates a cryptographically random in-memory session secret.
- The browser receives it only as an HttpOnly, SameSite=Strict cookie.
- Mutating POST requests require the exact same-origin Origin header.
- Responses deny framing, disable caching, set `nosniff`, and use a restrictive CSP.
- No remote scripts, styles, fonts, analytics, or assets are loaded.
- The Runtime API Key is removed from the control-server environment and is never sent to browser JavaScript.
- Child PowerShell actions independently load the protected credential only when the existing lifecycle script requires it.
- Dashboard text returned from child processes is scrubbed for user-home paths, engine paths, tunnel IDs, and common credential shapes.
- Request bodies are bounded.
- Child output is bounded.
- Dashboard actions are serialized within one dashboard process.
- Existing tunnel-operation and uninstall safety locks remain authoritative underneath the dashboard.

## Uninstall behavior

The dashboard does not weaken the existing uninstall boundary.

1. The user selects KeepWorkspace or RemoveEverything.
2. The dashboard invokes `Uninstall.ps1 -WhatIf` first and shows the preview.
3. The user must explicitly confirm that the preview was reviewed.
4. RemoveEverything additionally requires the exact phrase `REMOVE WORKFORGE`.
5. The existing `Uninstall.ps1` performs the real validation and removal.

The Node control process changes its current working directory to the system temporary directory before serving requests. This prevents its current directory from blocking verified release-engine self-removal. After a successful uninstall the dashboard server shuts down.

## Process lifetime

`Launch-Control.ps1` launches the Node process with a hidden window and returns. The server itself opens the default browser.

The server is session-scoped:

- it creates no Windows service, scheduled task, startup entry, or Run key;
- the UI polls status only while visible;
- when requests stop, the server exits after a bounded idle period;
- the dashboard also provides an explicit Close Control action.

## Validation

New dashboard validation covers:

- loopback-only binding;
- no all-interface binding;
- no CORS;
- hardened session cookie;
- Host validation;
- Origin validation for POST;
- security headers and CSP;
- unauthenticated API rejection;
- cross-origin POST rejection;
- authenticated same-origin shutdown;
- Start, Doctor, and Uninstall UI surfaces;
- release-package inclusion of dashboard assets and server scripts.

The CLI Control UX test remains in place so the fallback path cannot silently regress.
