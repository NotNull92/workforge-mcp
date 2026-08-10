$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$ExecutableFiles = @(
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.ps1" | Where-Object { $_.Name -cne "test-security-invariants.ps1" }
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "scripts") -File -Filter "*.mjs"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "src") -File -Filter "*.ts"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "control-ui") -File -Filter "*.js"
  Get-ChildItem -LiteralPath (Join-Path $ToolRoot "plugins") -Recurse -File | Where-Object { $_.Extension -in @(".ps1", ".cmd", ".mjs") }
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
  if ($Text -notmatch '%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe') {
    throw "$Wrapper does not use the explicit System32 Windows PowerShell launcher."
  }
  if ($Text -notmatch '(?m)^set "PSModulePath="\r?$') {
    throw "$Wrapper lets a caller-supplied PowerShell 7 module path break Windows PowerShell autoloading."
  }
}

$UninstallWrapperFixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-uninstall-wrapper-" + [guid]::NewGuid().ToString("N"))
try {
  $FixtureScripts = Join-Path $UninstallWrapperFixtureRoot "scripts"
  New-Item -ItemType Directory -Path $FixtureScripts -Force | Out-Null
  $FixtureWrapper = Join-Path $UninstallWrapperFixtureRoot "Uninstall.cmd"
  Copy-Item -LiteralPath (Join-Path $ToolRoot "Uninstall.cmd") -Destination $FixtureWrapper
  Set-Content -LiteralPath (Join-Path $FixtureScripts "Uninstall.ps1") -Encoding UTF8 -Value @'
[CmdletBinding()]
param([switch]$NonInteractive)
exit 0
'@

  function Invoke-UninstallWrapperFixture {
    param([string[]]$Arguments)

    $StartInfo = [Diagnostics.ProcessStartInfo]::new()
    $StartInfo.FileName = $env:ComSpec
    $StartInfo.Arguments = "/d /c `"`"$FixtureWrapper`" $($Arguments -join ' ')`""
    $StartInfo.UseShellExecute = $false
    $StartInfo.RedirectStandardInput = $true
    $StartInfo.RedirectStandardOutput = $true
    $StartInfo.RedirectStandardError = $true
    $Process = [Diagnostics.Process]::Start($StartInfo)
    $Process.StandardInput.Close()
    $Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
    $Process.WaitForExit()
    return [pscustomobject]@{ ExitCode = $Process.ExitCode; Output = $Output }
  }

  $NonInteractiveWrapper = Invoke-UninstallWrapperFixture -Arguments @("-NonInteractive")
  if ($NonInteractiveWrapper.ExitCode -ne 0) { throw "Non-interactive Uninstall.cmd fixture failed." }
  if (-not [string]::IsNullOrWhiteSpace($NonInteractiveWrapper.Output)) {
    throw "Uninstall.cmd pauses after a non-interactive uninstall completes."
  }
  $InteractiveWrapper = Invoke-UninstallWrapperFixture -Arguments @()
  if ($InteractiveWrapper.ExitCode -ne 0) { throw "Interactive Uninstall.cmd fixture failed." }
  if ([string]::IsNullOrWhiteSpace($InteractiveWrapper.Output)) {
    throw "Uninstall.cmd no longer preserves the interactive completion pause."
  }
} finally {
  if (Test-Path -LiteralPath $UninstallWrapperFixtureRoot) {
    Remove-Item -LiteralPath $UninstallWrapperFixtureRoot -Recurse -Force
  }
}
foreach ($Wrapper in @("scripts\Portable-Control.cmd", "plugins\workforge\bin\workforge-stdio.cmd")) {
  $Text = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot $Wrapper)
  if ($Text -notmatch '(?m)^set "PSModulePath="\r?$') {
    throw "$Wrapper lets a caller-supplied PowerShell 7 module path break Windows PowerShell autoloading."
  }
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
    "artifacts\workforge-mcp",
    "Optional WorkForge profile .git path"
  )
  "src\path-policy.ts" = @(
    "normalizePathForComparison",
    "isPathWithinOrEqual",
    "canonicalizeExistingAncestor"
  )
  "src\shell.ts" = @(
    "WORKFORGE_MCP_SHELL_JOB_ID",
    "WorkForgeMcpJobObject",
    "WorkForgeMcp-ProfileShell",
    "stdoutChunks",
    "stderrChunks"
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
    "InstallGit",
    'IsNullOrWhiteSpace($script:GitPath)',
    "NonInteractive"
  )
  "scripts\WorkForge.Prerequisites.ps1" = @(
    "OpenJS.NodeJS.LTS",
    "Git.Git",
    "BurntSushi.ripgrep.MSVC",
    "Required = `$false",
    "Confirm-WorkForgeOptionalGitInstall",
    "local folder mode",
    "InstallGit",
    "--exact",
    "--source",
    "--no-upgrade",
    "--disable-interactivity",
    "will not be replaced automatically",
    "InstallMissingPrerequisites"
  )
  "scripts\Configure-Tunnel.ps1" = @(
    "Get-WorkForgeProfile",
    "Get-WorkForgeTunnelExecutablePath",
    "Get-WorkForgeStdioRuntime",
    "`$McpCommand",
    "--mcp-command `$McpCommand"
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
    "powershellPath",
    "cmdPath",
    "taskkillPath",
    "terminateProcessTree(child)",
    "statusCacheMs",
    "/api/uninstall/preview",
    "REMOVE WORKFORGE"
  )
  "control-ui\app.js" = @(
    "/api/status",
    "runAction('doctor')",
    "/api/uninstall/preview",
    "REMOVE WORKFORGE"
  )
  "scripts\test-privacy-invariants.ps1" = @(
    "rev-list --objects --all",
    "cat-file '--batch-check=",
    "HistoricalBlobTooLargeToScan",
    "Read-GitBlobBytes"
  )
  "scripts\Build-Release.ps1" = @(
    ".workforge-release.json",
    'distributionKind = "portable-release"',
    "ThirdPartyLicenseReviewApproved",
    "ValidationBuild",
    "control-ui",
    "Uninstall.cmd"
  )
  "scripts\WorkForge.Portable.ps1" = @(
    "current.json",
    ".workforge-install.json",
    "installManifestSha256",
    "Invoke-WorkForgePortableRollback",
    "WORKFORGE_PORTABLE_STATE_ROOT"
  )
  "plugins\workforge\plugin.json" = @(
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    "io.github.notnull92.workforge"
  )
  "package.json" = @(
    "test:multi-profile",
    "test:privacy-history",
    "test:plugin",
    "test:portable-runtime"
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
if ($ParamBlock -notmatch 'InstallGit') {
  throw "Setup does not expose the separate optional Git consent switch."
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
if ($ControlServerText -match "spawn\('(?:powershell|cmd)\.exe'") {
  throw "Control dashboard must use verified System32 executable paths instead of bare executable names."
}

$ProfileRegistryText = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "profile-registry.ps1")
if ($ProfileRegistryText -match 'missing its canonical \.git directory') {
  throw "Profile loading must not require Git for Local Folder Mode."
}
if ($ProfileRegistryText -match 'reuses registered httpPort') {
  throw "Deprecated httpPort must not prevent multi-profile loading."
}
$InstallText = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "Install.ps1")
if ($InstallText -match '(?m)^\s*httpPort\s*=') {
  throw "New WorkForge profiles must not emit the deprecated httpPort field."
}

$ConfigureTunnelText = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "Configure-Tunnel.ps1")
$ProfilePreflightIndex = $ConfigureTunnelText.IndexOf('$Profile = Get-WorkForgeProfile', [StringComparison]::Ordinal)
$CredentialIndex = $ConfigureTunnelText.IndexOf('$ExistingKey = [Environment]::GetEnvironmentVariable("CONTROL_PLANE_API_KEY"', [StringComparison]::Ordinal)
if ($ProfilePreflightIndex -lt 0 -or $CredentialIndex -lt 0 -or $ProfilePreflightIndex -gt $CredentialIndex) {
  throw "Configure Tunnel must validate the profile and runtime before mutating the local credential."
}
if ($ConfigureTunnelText -match 'node\.exe dist/stdio\.js') {
  throw "Configure Tunnel must not persist an unverified relative MCP runtime command."
}
foreach ($NormalizedPathToken in @(
  '$McpNodePath = $StdioRuntime.NodePath.Replace("\", "/")',
  '$McpStdioPath = $StdioRuntime.StdioPath.Replace("\", "/")'
)) {
  if ($ConfigureTunnelText.IndexOf($NormalizedPathToken, [StringComparison]::Ordinal) -lt 0) {
    throw "Configure Tunnel must normalize Windows MCP command paths before tunnel-client parses them: $NormalizedPathToken"
  }
}
$CredentialExistsIndex = $ConfigureTunnelText.IndexOf('$CredentialExists = Test-Path -LiteralPath $CredentialPath', [StringComparison]::Ordinal)
$CredentialWriteIndex = $ConfigureTunnelText.IndexOf('[IO.File]::WriteAllText($CredentialPath', [StringComparison]::Ordinal)
$CredentialPromptIndex = $ConfigureTunnelText.IndexOf('Read-Host "Runtime CONTROL_PLANE_API_KEY"', [StringComparison]::Ordinal)
if ($CredentialExistsIndex -lt 0 -or $CredentialExistsIndex -gt $CredentialWriteIndex) {
  throw "Configure Tunnel must detect and validate an existing credential before overwriting it."
}
if ($CredentialPromptIndex -lt 0 -or $CredentialExistsIndex -gt $CredentialPromptIndex) {
  throw "Configure Tunnel must validate an existing credential before asking the user for another key."
}
if ($ConfigureTunnelText.IndexOf('if (-not $CredentialExists) {', [StringComparison]::Ordinal) -lt 0) {
  throw "Configure Tunnel must apply a new credential ACL only when creating the file."
}

. (Join-Path $PSScriptRoot "profile-registry.ps1")
$CredentialAclTestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-credential-acl-" + [guid]::NewGuid().ToString("N"))
try {
  New-Item -ItemType Directory -Path $CredentialAclTestRoot -Force | Out-Null
  $PreparedCredential = Join-Path $CredentialAclTestRoot ".env.local"
  New-WorkForgeRestrictedCredentialFile -Path $PreparedCredential
  if ((Get-Item -LiteralPath $PreparedCredential -Force).Length -ne 0) {
    throw "Credential ACL preparation must not write secret-shaped content."
  }
  Assert-WorkForgeRestrictedCredentialAcl -Path $PreparedCredential

  function Set-WorkForgeFileSecurity { throw "simulated ACL application failure" }
  $RejectedCredential = Join-Path $CredentialAclTestRoot ".env.rejected"
  try {
    New-WorkForgeRestrictedCredentialFile -Path $RejectedCredential
    throw "Credential ACL preparation unexpectedly ignored an ACL failure."
  } catch {
    if ($_.Exception.Message -notmatch "simulated ACL application failure") { throw }
  } finally {
    Remove-Item -LiteralPath Function:\Set-WorkForgeFileSecurity -Force
  }
  if (Test-Path -LiteralPath $RejectedCredential) {
    throw "Credential ACL preparation left an unprotected residual file after failure."
  }
} finally {
  if (Test-Path -LiteralPath $CredentialAclTestRoot) {
    Remove-Item -LiteralPath $CredentialAclTestRoot -Recurse -Force
  }
}

$WindowsQualityWorkflow = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot ".github\workflows\windows-quality-gate.yml")
if ($WindowsQualityWorkflow -notmatch 'choco install ripgrep' -or $WindowsQualityWorkflow -notmatch 'Get-Command rg\.exe') {
  throw "Windows quality gate must provision and verify ripgrep before running search-dependent tests."
}
if ($WindowsQualityWorkflow -notmatch 'node-version:\s*\[20,\s*24\]' -or $WindowsQualityWorkflow -notmatch '\$\{\{\s*matrix\.node-version\s*\}\}') {
  throw "Windows quality gate must validate both the minimum Node 20 runtime and the current Node 24 runtime."
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
