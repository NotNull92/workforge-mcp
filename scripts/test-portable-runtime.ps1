$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-portable-" + [guid]::NewGuid().ToString("N"))
$ProgramsRoot = Join-Path $TestRoot "programs"
$StateRoot = Join-Path $TestRoot "state"
$OriginalProgramsRoot = [Environment]::GetEnvironmentVariable("WORKFORGE_PORTABLE_PROGRAMS_ROOT", "Process")
$OriginalStateRoot = [Environment]::GetEnvironmentVariable("WORKFORGE_PORTABLE_STATE_ROOT", "Process")
$Utf8 = [Text.UTF8Encoding]::new($false)

function New-PortableFixture {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$Marker
  )

  $Root = Join-Path $TestRoot ("source-" + $Version)
  foreach ($Directory in @("dist", "runtimes\node", "runtimes\ripgrep", "runtimes\tunnel-client", "scripts", "control-ui", "plugins", "templates")) {
    New-Item -ItemType Directory -Path (Join-Path $Root $Directory) -Force | Out-Null
  }
  $Files = [ordered]@{
    ".workforge-release.json" = (@{ schemaVersion = 1; product = "WorkForge"; version = $Version; distributionKind = "portable-release" } | ConvertTo-Json)
    "package.json" = (@{ name = "workforge-mcp"; version = $Version; dependencies = @{ "@modelcontextprotocol/sdk" = "1.29.0"; zod = "4.4.3" } } | ConvertTo-Json -Depth 4)
    "runtime-lock.json" = (@{ schemaVersion = 1; product = "WorkForge"; runtimes = @{} } | ConvertTo-Json)
    "dist\stdio.js" = "stdio-$Marker"
    "runtimes\node\node.exe" = "node-$Marker"
    "runtimes\ripgrep\rg.exe" = "rg-$Marker"
    "runtimes\tunnel-client\tunnel-client.exe" = "tunnel-$Marker"
    "scripts\Setup.ps1" = "Write-Output setup-$Marker"
    "scripts\WorkForge.Portable.ps1" = "Set-StrictMode -Version 3.0"
    "scripts\Portable-Control.ps1" = "Write-Output control-$Marker"
    "scripts\Portable-Control.cmd" = "@echo off"
    "scripts\Portable-Dispatch.ps1" = "Write-Output dispatch-$Marker"
    "scripts\Portable-Dispatch.cmd" = "@echo off"
    "scripts\Configure-Tunnel.ps1" = "Write-Output configure-$Marker"
    "scripts\Doctor.ps1" = "Write-Output doctor-$Marker"
    "scripts\start-tunnel.ps1" = "Write-Output start-$Marker"
    "scripts\stop-tunnel.ps1" = "Write-Output stop-$Marker"
    "scripts\profile-registry.ps1" = "Write-Output profile-$Marker"
    "scripts\WorkForge.Contract.ps1" = "Write-Output contract-$Marker"
    "scripts\WorkForge.ProfileRuntime.ps1" = "Write-Output profile-runtime-$Marker"
    "scripts\WorkForge.TunnelRuntime.ps1" = "Write-Output tunnel-runtime-$Marker"
    "scripts\WorkForge.Update.ps1" = "Write-Output update-module-$Marker"
    "scripts\Update.ps1" = "Write-Output update-$Marker"
    "control-ui\app.js" = "console.log('ui-$Marker')"
    "Setup.cmd" = "@echo off"
    "Install.cmd" = "@echo off"
    "Configure Tunnel.cmd" = "@echo off"
    "WorkForge Control.cmd" = "@echo off"
    "Uninstall.cmd" = "@echo off"
  }
  foreach ($Entry in $Files.GetEnumerator()) {
    [IO.File]::WriteAllText((Join-Path $Root $Entry.Key), ([string]$Entry.Value + [Environment]::NewLine), $Utf8)
  }
  return $Root
}

try {
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_PROGRAMS_ROOT", $ProgramsRoot, "Process")
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_STATE_ROOT", $StateRoot, "Process")
  . (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")

  $LegacySource = New-PortableFixture -Version "0.1.0" -Marker "legacy"
  $LegacyDestination = Join-Path $ProgramsRoot "versions\0.1.0"
  New-Item -ItemType Directory -Path $LegacyDestination -Force | Out-Null
  foreach ($Item in Get-ChildItem -LiteralPath $LegacySource -Force) {
    Copy-Item -LiteralPath $Item.FullName -Destination (Join-Path $LegacyDestination $Item.Name) -Recurse -Force
  }
  $LegacyFiles = @(
    foreach ($RelativePath in $script:WorkForgePortableLegacyCriticalFiles) {
      [ordered]@{
        path = $RelativePath
        sha256 = (Get-WorkForgeFileSha256 -Path (Join-Path $LegacyDestination $RelativePath)).ToLowerInvariant()
      }
    }
  )
  Write-WorkForgePortableAtomicJson -Path (Join-Path $LegacyDestination ".workforge-install.json") -Value ([ordered]@{
    schemaVersion = 1
    product = "WorkForge"
    version = "0.1.0"
    files = $LegacyFiles
  })
  $LegacyInstalled = Set-WorkForgePortableCurrent -Version "0.1.0"
  if ([string]$LegacyInstalled.ManifestSchemaVersion -cne "1") {
    throw "Legacy v0.1.0 install manifest compatibility was lost."
  }

  $CurrentSource = New-PortableFixture -Version "0.2.0" -Marker "current"
  $null = Install-WorkForgePortableVersion -SourceRoot $CurrentSource
  $ResolvedCurrent = Resolve-WorkForgePortableEngine
  if ($ResolvedCurrent.Version -cne "0.2.0") {
    throw "v0.1.0 to v0.2.0 portable upgrade did not switch current.json."
  }
  $CurrentPointer = (Read-WorkForgePortableJson -Path (Join-Path $ProgramsRoot "current.json") -Description "Portable current pointer").Value
  if ([string]$CurrentPointer.previousVersion -cne "0.1.0") {
    throw "v0.2.0 portable upgrade did not retain v0.1.0 as the rollback target."
  }
  $RolledBackToV010 = Invoke-WorkForgePortableRollback
  if ($RolledBackToV010.Version -cne "0.1.0") {
    throw "v0.2.0 rollback did not restore the legacy v0.1.0 engine."
  }
  $VerifiedV010AfterRollback = Read-WorkForgePortableInstalledVersion -EngineRoot $RolledBackToV010.EngineRoot -Version "0.1.0"
  if ([string]$VerifiedV010AfterRollback.ManifestSchemaVersion -cne "1") {
    throw "v0.2.0 rollback restored v0.1.0 without preserving legacy manifest compatibility."
  }

  $V1Source = New-PortableFixture -Version "1.3.0" -Marker "one"
  $V1 = Install-WorkForgePortableVersion -SourceRoot $V1Source
  $ResolvedV1 = Resolve-WorkForgePortableEngine
  if ($ResolvedV1.Version -cne "1.3.0" -or $ResolvedV1.EngineRoot -cne $V1.EngineRoot) {
    throw "Initial portable version did not become current."
  }
  if ($ResolvedV1.StateRoot -cne [IO.Path]::GetFullPath($StateRoot)) {
    throw "Portable state was not separated from the immutable engine."
  }

  $V2Source = New-PortableFixture -Version "1.3.1" -Marker "two"
  $null = Install-WorkForgePortableVersion -SourceRoot $V2Source
  $ResolvedV2 = Resolve-WorkForgePortableEngine
  if ($ResolvedV2.Version -cne "1.3.1") { throw "Portable update did not switch current.json." }

  function Get-FileHash {
    throw "Get-FileHash must not be required by portable runtime verification."
  }
  try {
    $ResolvedWithoutFileHashCmdlet = Resolve-WorkForgePortableEngine
    if ($ResolvedWithoutFileHashCmdlet.Version -cne "1.3.1") {
      throw "Portable runtime did not resolve without Get-FileHash."
    }
  } finally {
    Remove-Item -LiteralPath Function:\Get-FileHash -Force
  }

  $RolledBack = Invoke-WorkForgePortableRollback
  if ($RolledBack.Version -cne "1.3.0") { throw "Portable rollback did not restore the prior version." }

  $StagedSource = New-PortableFixture -Version "1.3.2" -Marker "staged"
  $Staged = Stage-WorkForgePortableVersion -SourceRoot $StagedSource
  $OriginalReadInstalled = ${function:Read-WorkForgePortableInstalledVersion}
  function Read-WorkForgePortableInstalledVersion { throw "redundant installed-engine validation" }
  try {
    $Activated = Activate-WorkForgePortableVersion -Version "1.3.2" -PreviousVersion "1.3.1" -ValidatedInstalled $Staged
    if ($Activated.Version -cne "1.3.2") { throw "Validated staged record did not activate the staged engine." }
  } finally {
    Set-Item -LiteralPath Function:\Read-WorkForgePortableInstalledVersion -Value $OriginalReadInstalled
  }

  $script:ReadInstalledCallCount = 0
  function Read-WorkForgePortableInstalledVersion {
    param(
      [Parameter(Mandatory = $true)][string]$EngineRoot,
      [Parameter(Mandatory = $true)][string]$Version,
      [string]$ExpectedManifestHash
    )
    $script:ReadInstalledCallCount += 1
    return & $OriginalReadInstalled @PSBoundParameters
  }
  try {
    $null = Activate-WorkForgePortableVersion -Version "1.3.2" -PreviousVersion "1.3.1"
    if ($script:ReadInstalledCallCount -le 0) { throw "Activation without a validated staged record did not validate the installed engine." }
  } finally {
    Set-Item -LiteralPath Function:\Read-WorkForgePortableInstalledVersion -Value $OriginalReadInstalled
  }

  [IO.File]::AppendAllText((Join-Path $RolledBack.EngineRoot "control-ui\app.js"), "tampered", $Utf8)
  try {
    $null = Resolve-WorkForgePortableEngine
    throw "Tampered portable engine unexpectedly resolved."
  } catch {
    if ($_.Exception.Message -notmatch "SHA-256") { throw }
  }

  if (Test-Path -LiteralPath (Join-Path $ProgramsRoot "Startup")) {
    throw "Portable installation created a startup surface."
  }
  Write-Output "PORTABLE_RUNTIME_TEST_OK"
} finally {
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_PROGRAMS_ROOT", $OriginalProgramsRoot, "Process")
  [Environment]::SetEnvironmentVariable("WORKFORGE_PORTABLE_STATE_ROOT", $OriginalStateRoot, "Process")
  if (Test-Path -LiteralPath $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
}
