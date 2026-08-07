$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$ExecutableFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.ps1" | Where-Object { $_.Name -cne "test-security-invariants.ps1" }
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.mjs"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "src") -File -Filter "*.ts"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "control-ui") -File -Filter "*.js"
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
  'shell:startup',
  'Start-Process[^\r\n]+-Verb\s+RunAs',
  '(?:^|\s)runas(?:\.exe)?(?:\s|$)'
)
foreach ($File in $ExecutableFiles) {
  $Text = Get-Content -Raw -LiteralPath $File.FullName
  foreach ($Pattern in $ForbiddenPersistencePatterns) {
    if ($Text -match $Pattern) {
      throw "Executable code contains forbidden startup-persistence pattern '$Pattern': $($File.FullName)"
    }
  }
  if ($Text -match '(?i)\bgum\.exe\b') {
    throw "WorkForge must not require an external Gum runtime: $($File.FullName)"
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

foreach ($Wrapper in @("Install.cmd", "Configure Tunnel.cmd", "WorkForge Control.cmd", "Setup.cmd", "Uninstall.cmd")) {
  $Text = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot $Wrapper)
  if ($Text -notmatch 'exit /b %EXIT_CODE%') { throw "$Wrapper does not propagate its PowerShell exit code." }
}

$BrandSurfaceFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.ps1" | Where-Object { $_.Name -cne "test-security-invariants.ps1" }
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.mjs"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "src") -File -Filter "*.ts"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "control-ui") -File
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

$RequiredChecks = [ordered]@{
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
    "WorkForge Control.cmd",
    "identity=workforge-workstation",
    'serverName = "workforge-$ProfileId-mcp"',
    "WorkForge.UI.ps1",
    "WorkForge.Prerequisites.ps1",
    "InstallMissingPrerequisites",
    "NonInteractive"
  )
  "scripts\WorkForge.Prerequisites.ps1" = @(
    "OpenJS.NodeJS.LTS",
    "Git.Git",
    "BurntSushi.ripgrep.MSVC",
    "--exact",
    "--source",
    "--no-upgrade",
    "--disable-interactivity",
    "will not be replaced automatically",
    "InstallMissingPrerequisites"
  )
  "scripts\Uninstall.ps1" = @(
    "SupportsShouldProcess",
    "REMOVE WORKFORGE",
    ".workforge-release.json",
    "Source checkout protected",
    "ConfirmFullRemoval",
    "ExpectedDashboardTarget",
    "ExpectedLegacyControl",
    "identity=workforge-workstation"
  )
  "scripts\uninstall-finalizer.ps1" = @(
    ".workforge-release.json",
    "Source repositories cannot be removed",
    "ExpectedManifestSha256"
  )
  "scripts\WorkForge.UI.ps1" = @(
    "NO_COLOR",
    "WORKFORGE_PLAIN_UI",
    "Protect-WorkForgeDisplayText",
    "runtime\logs",
    "Confirm-WorkForgePhrase"
  )
  "scripts\Launch-Control.ps1" = @(
    "control-server.mjs",
    "WindowStyle Hidden",
    "scripts\Control.ps1"
  )
  "scripts\control-server.mjs" = @(
    "host: '127.0.0.1'",
    "HttpOnly; SameSite=Strict",
    "request.headers.origin !== expectedOrigin",
    "request.headers.host !== expectedHost",
    "Content-Security-Policy",
    "/api/uninstall/preview",
    "REMOVE WORKFORGE"
  )
  "control-ui\app.js" = @(
    "/api/status",
    "runAction('doctor')",
    "/api/uninstall/preview",
    "REMOVE WORKFORGE"
  )
  "scripts\Build-Release.ps1" = @(
    ".workforge-release.json",
    'distributionKind = "release"',
    "control-ui",
    "Uninstall.cmd"
  )
}
$PrerequisiteText = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "WorkForge.Prerequisites.ps1")
if ($PrerequisiteText -match '(?i)\bwinget(?:\.exe)?\s+upgrade\b') {
  throw "Prerequisite bootstrap must never invoke winget upgrade."
}
if ($PrerequisiteText -match '(?i)--force') {
  throw "Prerequisite bootstrap must never force a package installation."
}
$InstallWrapper = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "Install.cmd")
if ($InstallWrapper -notmatch '-Mode Install %\*') {
  throw "Install.cmd does not forward explicit prerequisite-bootstrap options."
}
if ($ParamBlock -notmatch 'InstallMissingPrerequisites') {
  throw "Setup does not expose the explicit prerequisite-install consent switch."
}

$ControlWrapper = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "WorkForge Control.cmd")
if ($ControlWrapper -notmatch 'Launch-Control\.ps1' -or $ControlWrapper -notmatch '--cli') {
  throw "WorkForge Control.cmd must launch the HTML dashboard and retain an explicit CLI fallback."
}
$ControlServerText = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "control-server.mjs")
if ($ControlServerText -match '0\.0\.0\.0') {
  throw "Control dashboard must never bind to all interfaces."
}
if ($ControlServerText -match 'Access-Control-Allow-Origin') {
  throw "Control dashboard must not enable CORS."
}
if ($ControlServerText -match 'console\.(?:log|error)\([^\r\n]*sessionToken') {
  throw "Control dashboard must never print its session token."
}

foreach ($RelativePath in $RequiredChecks.Keys) {
  $Path = Join-Path $ToolRoot $RelativePath
  $Text = Get-Content -Raw -LiteralPath $Path
  foreach ($Token in $RequiredChecks[$RelativePath]) {
    if ($Text.IndexOf($Token, [StringComparison]::Ordinal) -lt 0) {
      throw "Required WorkForge security token is missing from ${RelativePath}: $Token"
    }
  }
}

Write-Output "SECURITY_INVARIANTS_TEST_OK"
