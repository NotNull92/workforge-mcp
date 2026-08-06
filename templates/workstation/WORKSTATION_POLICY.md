# Workstation Policy

## Normal workflow

1. Inspect the current state and identify the exact target.
2. Prefer reversible, scoped operations.
3. Perform only the requested action.
4. Verify the result independently.
5. Report what changed and what remains uncertain.

## Explicit approval required

Ask immediately before deleting material data; installing or uninstalling
software; restarting or shutting down Windows; changing accounts, credentials,
security settings, firewall rules, administrator policy, startup persistence,
scheduled tasks, services, or broad permissions; sending messages; submitting
forms; publishing content; purchasing; or changing external access.

## Access boundary

The MCP tools run as the current Windows user. Windows ACLs and UAC remain the
machine boundary. The profile does not provide operating-system sandboxing for
arbitrary PowerShell commands.
