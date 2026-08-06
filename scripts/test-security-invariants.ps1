$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$ExecutableFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.ps1" | Where-Object { $_.Name -cne "test-security-invariants.ps1" }
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "src") -File -Filter "*.ts"
  Get-ChildItem -LiteralPath $ToolRoot -File -Filter "*.cmd"
)
$ForbiddenPersistencePatterns = @(
  'Register-ScheduledTask',
  'New-ScheduledTask',
  'schtasks(?:\.exe)?',
  'New-Service',
  'Set-Service[^\r\n]+StartupType',
  '(?:^|\s)sc(?:\.exe)?\s+create(?:\s|$)',
  'CurrentVersion[\\/]Run(?:Once)?',
  'GetFolderPath\(["'']Startup["'']\)',
  'shell:startup'
)
foreach ($File in $ExecutableFiles) {
  $Text = Get-Content -Raw -LiteralPath $File.FullName
  foreach ($Pattern in $ForbiddenPersistencePatterns) {
    if ($Text -match $Pattern) {
      throw "Executable code contains forbidden startup-persistence pattern '$Pattern': $($File.FullName)"
    }
  }
}

$SetupText = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "Setup.ps1")
$ParamEnd = $SetupText.IndexOf("`r`n)`r`n", [StringComparison]::Ordinal)
if ($ParamEnd -lt 0) { $ParamEnd = $SetupText.IndexOf("`n)`n", [StringComparison]::Ordinal) }
if ($ParamEnd -lt 0) { throw "Could not identify the Setup parameter block." }
$ParamBlock = $SetupText.Substring(0, $ParamEnd)
if ($ParamBlock -match '(?i)(ApiKey|ControlPlaneKey|RuntimeKey)') {
  throw "Setup exposes a credential-shaped plain command-line parameter."
}

$ServerText = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "src\server.ts")
if ($ServerText -match 'version:\s*"\d+\.\d+\.\d+') {
  throw "MCP server version is hard-coded instead of sourced from package.json."
}
if ($ServerText -notmatch 'SERVER_VERSION') { throw "MCP server does not expose the package-derived version." }

foreach ($Wrapper in @("Install.cmd", "Configure Tunnel.cmd", "WorkForge Control.cmd", "Setup.cmd")) {
  $Text = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot $Wrapper)
  if ($Text -notmatch 'exit /b %EXIT_CODE%') { throw "$Wrapper does not propagate its PowerShell exit code." }
}

$BrandSurfaceFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.ps1" | Where-Object { $_.Name -cne "test-security-invariants.ps1" }
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "src") -File -Filter "*.ts"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "templates") -Recurse -File
  Get-ChildItem -LiteralPath $ToolRoot -File -Filter "*.cmd"
  Get-Item -LiteralPath (Join-Path $ToolRoot "package.json")
)
$LegacyBrandWord = -join @(72, 121, 98, 114, 105, 100 | ForEach-Object { [char]$_ })
$LegacyRuntimeTokens = @(
  ("CHATGPT_" + $LegacyBrandWord.ToUpperInvariant()),
  ("chatgpt-" + $LegacyBrandWord.ToLowerInvariant() + "-mcp"),
  ($LegacyBrandWord + "WorkstationMcp"),
  ($LegacyBrandWord + " MCP Control.cmd")
)
foreach ($File in $BrandSurfaceFiles) {
  $Text = Get-Content -Raw -LiteralPath $File.FullName
  foreach ($Token in $LegacyRuntimeTokens) {
    if ($Text.IndexOf($Token, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      throw "Executable product surface contains a legacy runtime identifier: $($File.FullName)"
    }
  }
}

$RequiredBrandChecks = [ordered]@{
  "scripts\profile-registry.ps1" = @(
    "WORKFORGE_MCP_PROFILE_REGISTRY",
    "WorkForgeMcp-Tunnel",
    "tools\workforge-mcp",
    "artifacts\workforge-mcp"
  )
  "src\shell.ts" = @(
    "WORKFORGE_MCP_SHELL_JOB_ID",
    "WorkForgeMcpJobObject",
    "WorkForgeMcp-ProfileShell"
  )
  "scripts\Install.ps1" = @(
    'Join-Path $env:USERPROFILE "WorkForge"',
    "WorkForge Control.lnk",
    "identity=workforge-workstation",
    'serverName = "workforge-$ProfileId-mcp"'
  )
}
foreach ($RelativePath in $RequiredBrandChecks.Keys) {
  $Path = Join-Path $ToolRoot $RelativePath
  $Text = Get-Content -Raw -LiteralPath $Path
  foreach ($Token in $RequiredBrandChecks[$RelativePath]) {
    if ($Text.IndexOf($Token, [StringComparison]::Ordinal) -lt 0) {
      throw "Required WorkForge isolation token is missing from ${RelativePath}: $Token"
    }
  }
}
Write-Output "SECURITY_INVARIANTS_TEST_OK"
