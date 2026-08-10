---
name: workforge
description: Use WorkForge for secure profile-scoped Windows or macOS workstation file, shell, and project operations through its bundled MCP server.
---

# WorkForge

Call `workstation_context` before acting. Treat its bootstrap context and
revision as authoritative for the selected profile.

Start read-only when a target is unclear. Before a mutation, refresh the
bootstrap context, use its current revision, and verify the exact target path.

Do not start or configure the Secure MCP Tunnel implicitly. Tunnel lifecycle
remains an explicit user action in WorkForge Control.
