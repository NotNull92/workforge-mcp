$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-update-" + [guid]::NewGuid().ToString("N"))
$ProgramsRoot = Join-Path $TestRoot "programs"
$StateRoot = Join-Path $TestRoot "state"
$OriginalProgramsRoot = [Environment]::GetEnvironmentVariable("WORKFORGE_PORTABLE_PROGRAMS_ROOT", "Process")
$OriginalStateRoot = [Environment]::GetEnvironmentVariable("WORKFORGE_PORTABLE_STATE_ROOT", "Process")
$Utf8 = [Text.UTF8Encoding]::new($false)

function Write-FixtureText {
  param([string]$Path, [string]$Text)
  $Parent = [IO.Path]::GetDirectoryName($Path)
  if (-not [string]::IsNullOrWhiteSpace($Parent)) { New-Item -ItemType Directory -Path $Parent -Force | Out-Null }
  [IO.File]::WriteAllText($Path, $Text, $Utf8)
}

function New-UpdateFixture {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Marker,
    [switch]$FailRebind
  )
  $Root = Join-Path $TestRoot ("source-" + $Version + "-" + $Marker)
  foreach ($Directory in @("dist", "runtimes\node", "runtimes\ripgrep", "runtimes\tunnel-client", "scripts", "control-ui", "plugins", "templates")) {
    New-Item -ItemType Directory -Path (Join-Path $Root $Directory) -Force | Out-Null
  }
  $Files = [ordered]@{
    ".workforge-release.json" = (@{ schemaVersion = 1; product = "WorkForge"; version = $Version; distributionKind = "portable-release" } | ConvertTo-Json)
    "package.json" = (@{ name = "workforge-mcp"; version = $Version; dependencies = @{} } | ConvertTo-Json)
    "runtime-lock.json" = (@{ schemaVersion = 1; product = "WorkForge"; runtimes = @{} } | ConvertTo-Json)
    "dist\stdio.js" = "stdio-$Marker"
    "runtimes\node\node.exe" = "node-$Marker"
    "runtimes\ripgrep\rg.exe" = "rg-$Marker"
    "runtimes\tunnel-client\tunnel-client.exe" = "tunnel-$Marker"
    "scripts\Setup.ps1" = "Write-Output setup-$Marker"
    "scripts\WorkForge.Portable.ps1" = "Set-StrictMode -Version 3.0`n# portable-$Marker"
    "scripts\Portable-Control.ps1" = "Write-Output control-$Marker"
    "scripts\Portable-Control.cmd" = "@echo off`r`nrem control-$Marker"
    "scripts\Portable-Dispatch.ps1" = "Write-Output dispatch-$Marker"
    "scripts\Portable-Dispatch.cmd" = "@echo off`r`nrem dispatch-$Marker"
    "scripts\WorkForge.Contract.ps1" = "Write-Output contract-$Marker"
    "scripts\WorkForge.ProfileRuntime.ps1" = "Write-Output profile-runtime-$Marker"
    "scripts\WorkForge.TunnelRuntime.ps1" = "Write-Output tunnel-runtime-$Marker"
    "scripts\WorkForge.Update.ps1" = "Write-Output update-module-$Marker"
    "scripts\Update.ps1" = "Write-Output update-$Marker"
    "scripts\profile-registry.ps1" = @'
function Get-WorkForgeRegistry {
  $path = Join-Path $env:WORKFORGE_PORTABLE_STATE_ROOT "profile_registry.json"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return [pscustomobject]@{ Profiles = @() } }
  $registry = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
  $profiles = @(
    foreach ($entry in @($registry.profiles)) {
      [pscustomobject]@{
        Id = [string]$entry.id
        TunnelConfigPath = Join-Path ([IO.Path]::GetDirectoryName([string]$entry.profilePath)) "tunnel.local.yaml"
      }
    }
  )
  return [pscustomobject]@{ Profiles = $profiles }
}
'@
    "scripts\tunnel-status.ps1" = @'
param([string]$ProfileId,[switch]$Snapshot)
$running = Test-Path -LiteralPath (Join-Path $env:WORKFORGE_PORTABLE_STATE_ROOT ("tunnel-" + $ProfileId + ".running")) -PathType Leaf
@{ running = [bool]$running } | ConvertTo-Json -Compress
'@
    "scripts\start-tunnel.ps1" = @'
param([string]$ProfileId)
[IO.File]::WriteAllText((Join-Path $env:WORKFORGE_PORTABLE_STATE_ROOT ("tunnel-" + $ProfileId + ".running")), "running", [Text.UTF8Encoding]::new($false))
'@
    "scripts\stop-tunnel.ps1" = @'
param([string]$ProfileId)
Remove-Item -LiteralPath (Join-Path $env:WORKFORGE_PORTABLE_STATE_ROOT ("tunnel-" + $ProfileId + ".running")) -Force -ErrorAction SilentlyContinue
'@
    "scripts\Doctor.ps1" = "param([string]`$ProfileId)`nWrite-Output doctor-$Marker"
    "control-ui\app.js" = "console.log('ui-$Marker')"
    "Setup.cmd" = "@echo off"
    "Install.cmd" = "@echo off"
    "Configure Tunnel.cmd" = "@echo off"
    "WorkForge Control.cmd" = "@echo off"
    "Uninstall.cmd" = "@echo off"
  }
  if ($FailRebind) {
    $Files["scripts\Configure-Tunnel.ps1"] = @'
param([string]$ProfileId,[switch]$RebindRuntime,[switch]$SkipDoctor)
$registryPath = Join-Path $env:WORKFORGE_PORTABLE_STATE_ROOT "profile_registry.json"
$registry = Get-Content -Raw -LiteralPath $registryPath | ConvertFrom-Json
$entry = @($registry.profiles | Where-Object { $_.id -eq $ProfileId })[0]
$config = Join-Path ([IO.Path]::GetDirectoryName([string]$entry.profilePath)) "tunnel.local.yaml"
[IO.File]::WriteAllText($config, "new-config", [Text.UTF8Encoding]::new($false))
throw "simulated rebind failure"
'@
  } else {
    $Files["scripts\Configure-Tunnel.ps1"] = "param([string]`$ProfileId,[switch]`$RebindRuntime,[switch]`$SkipDoctor)`nWrite-Output rebind-$Marker"
  }
  foreach ($Entry in $Files.GetEnumerator()) { Write-FixtureText -Path (Join-Path $Root $Entry.Key) -Text ([string]$Entry.Value + [Environment]::NewLine) }
  return $Root
}

try {
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_PROGRAMS_ROOT", $ProgramsRoot, "Process")
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_STATE_ROOT", $StateRoot, "Process")
  . (Join-Path $PSScriptRoot "WorkForge.Update.ps1")

  $ThrowingProgressCallback = { throw "simulated progress renderer failure" }
  Invoke-WorkForgeUpdateProgressCallback -ProgressCallback $ThrowingProgressCallback -Stage "test" -Percent 1 -Message "test"

  $Metadata = [pscustomobject]@{
    draft = $false
    prerelease = $false
    tag_name = "v0.2.1"
    html_url = "https://github.com/NotNull92/workforge-mcp/releases/tag/v0.2.1"
    published_at = "2026-08-10T00:00:00Z"
    assets = @(
      [pscustomobject]@{ name = "WorkForge-v0.2.1-win-x64.zip"; browser_download_url = "https://github.com/NotNull92/workforge-mcp/releases/download/v0.2.1/WorkForge-v0.2.1-win-x64.zip" },
      [pscustomobject]@{ name = "WorkForge-v0.2.1-win-x64.zip.sha256"; browser_download_url = "https://github.com/NotNull92/workforge-mcp/releases/download/v0.2.1/WorkForge-v0.2.1-win-x64.zip.sha256" }
    )
  }
  $Descriptor = Resolve-WorkForgeReleaseMetadata -Metadata $Metadata -CurrentVersion "0.2.0"
  if (-not $Descriptor.UpdateAvailable -or $Descriptor.LatestVersion -cne "0.2.1") { throw "Stable update metadata was not accepted." }
  $Metadata.assets[0].browser_download_url = "https://example.invalid/WorkForge.zip"
  try {
    $null = Resolve-WorkForgeReleaseMetadata -Metadata $Metadata -CurrentVersion "0.2.0"
    throw "Non-canonical update asset URL was accepted."
  } catch {
    if ($_.Exception.Message -notmatch "canonical GitHub") { throw }
  }

  $CurrentSource = New-UpdateFixture -Version "0.2.0" -Marker "current"
  $null = Install-WorkForgePortableVersion -SourceRoot $CurrentSource
  $TargetSource = New-UpdateFixture -Version "0.2.1" -Marker "target"
  $ProgressEvents = [Collections.Generic.List[object]]::new()
  $ProgressCallback = {
    param([string]$Stage, [int]$Percent, [string]$Message)
    $ProgressEvents.Add([pscustomobject]@{ Stage = $Stage; Percent = $Percent; Message = $Message })
  }.GetNewClosure()
  $Upgrade = Invoke-WorkForgeTransactionalUpgrade -SourceRoot $TargetSource -ProgressCallback $ProgressCallback
  if ($Upgrade.Version -cne "0.2.1" -or (Resolve-WorkForgePortableEngine).Version -cne "0.2.1") { throw "Transactional update did not activate the target version." }
  $ObservedProgressStages = @($ProgressEvents | ForEach-Object { $_.Stage })
  foreach ($ExpectedStage in @("staging", "stopping", "activating", "rebinding", "restarting", "finalizing")) {
    if ($ObservedProgressStages -notcontains $ExpectedStage) { throw "Transactional update did not emit progress stage: $ExpectedStage" }
  }
  $ObservedProgressPercents = @($ProgressEvents | ForEach-Object { [int]$_.Percent })
  for ($Index = 1; $Index -lt $ObservedProgressPercents.Count; $Index += 1) {
    if ($ObservedProgressPercents[$Index] -lt $ObservedProgressPercents[$Index - 1]) { throw "Transactional update progress moved backwards." }
  }
  $RolledBack = Invoke-WorkForgePortableRollback
  if ($RolledBack.Version -cne "0.2.0") { throw "Portable rollback did not restore the pre-update version." }

  $ProfileRoot = Join-Path $TestRoot "profile"
  $ProfilePath = Join-Path $ProfileRoot "tools\workforge-mcp\profile.json"
  $TunnelConfigPath = Join-Path $ProfileRoot "tools\workforge-mcp\tunnel.local.yaml"
  Write-FixtureText -Path $ProfilePath -Text "{}"
  Write-FixtureText -Path $TunnelConfigPath -Text "original-config"
  New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
  Write-FixtureText -Path (Join-Path $StateRoot "profile_registry.json") -Text (([ordered]@{
    version = 1
    profiles = @([ordered]@{ id = "workstation"; profilePath = $ProfilePath; profileSha256 = ("a" * 64) })
  } | ConvertTo-Json -Depth 5) + [Environment]::NewLine)

  $RunningMarker = Join-Path $StateRoot "tunnel-workstation.running"
  Write-FixtureText -Path $RunningMarker -Text "running"
  $FailingSource = New-UpdateFixture -Version "0.2.2" -Marker "failing" -FailRebind
  $ProgressEvents.Clear()
  try {
    $null = Invoke-WorkForgeTransactionalUpgrade -SourceRoot $FailingSource -ProgressCallback $ProgressCallback
    throw "Transactional update unexpectedly ignored the rebind failure."
  } catch {
    if ($_.Exception.Message -notmatch "simulated rebind failure") { throw }
  }
  if (@($ProgressEvents | ForEach-Object { $_.Stage }) -notcontains "rollback") { throw "Failed transactional update did not emit rollback progress." }
  if ((Resolve-WorkForgePortableEngine).Version -cne "0.2.0") { throw "Failed update did not restore the prior engine." }
  if ((Get-Content -Raw -LiteralPath $TunnelConfigPath).Trim() -cne "original-config") { throw "Failed update did not restore the original tunnel configuration." }
  if (-not (Test-Path -LiteralPath $RunningMarker -PathType Leaf)) { throw "Failed update did not restore the pre-update running tunnel state." }

  Write-Output "UPDATE_TEST_OK"
} finally {
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_PROGRAMS_ROOT", $OriginalProgramsRoot, "Process")
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_STATE_ROOT", $OriginalStateRoot, "Process")
  if (Test-Path -LiteralPath $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
}
