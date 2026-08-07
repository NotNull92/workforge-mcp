# TASK-10: ForgeUI terminal design system

Status: **Completed on 2026-08-06**

## Goal

Create a dependency-free PowerShell terminal design system inspired by the compositional clarity of Charmbracelet tools while retaining Windows PowerShell 5.1 compatibility and WorkForge's security boundaries.

## Design language

- Molten orange primary accent, metallic gold highlights, cool cyan information, emerald success, amber warnings, and red-pink failures.
- Compact bordered panels, explicit stage timelines, consistent status glyphs, short actionable errors, and aligned summaries.
- Rich rendering on capable interactive terminals.
- ASCII and no-color fallback for CI, redirected output, screen readers, `NO_COLOR`, `WORKFORGE_PLAIN_UI=1`, and `-Plain`.
- Unicode symbols are produced from code points at runtime so UTF-8 no-BOM PowerShell source remains compatible with Windows PowerShell 5.1.

## Components

- `Initialize-WorkForgeUi`
- `Write-WorkForgeBanner`
- `Write-WorkForgePlan`
- `Start-WorkForgeStage`
- `Complete-WorkForgeStage`
- `Skip-WorkForgeStage`
- `Fail-WorkForgeStage`
- `Write-WorkForgeDetail`
- `Write-WorkForgeNotice`
- `Write-WorkForgeSummary`
- `Write-WorkForgeErrorPanel`
- `Read-WorkForgeChoice`
- `Confirm-WorkForgePhrase`

## Logging

Structured JSONL logs are separate from the visual console surface. Events contain UTC time, operation, stage, result, duration, and redacted detail. Logs remove the literal user-profile path and do not retain raw runtime keys, complete tunnel IDs, or GitHub token shapes.

Setup and install logs are written below the ignored engine `runtime/logs` directory. Uninstall logs are written below the system temporary WorkForge log directory because the release engine may delete itself.

## Verification record

The UI suite performs:

- golden plain-text comparison for Setup;
- golden plain-text comparison for Uninstall;
- forced rich-output checks for ANSI styling and Unicode borders;
- redaction checks for user-profile paths, tunnel IDs, and credential-shaped values;
- Windows PowerShell parser validation.

Observed gate:

```text
UI_RENDERING_TEST_OK
```

ForgeUI adds no production package or external executable. Security validation explicitly rejects a `gum.exe` runtime requirement.
