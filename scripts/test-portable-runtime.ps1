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
  foreach ($Directory in @("dist", "runtimes\node", "runtimes\ripgrep", "runtimes\tunnel-client", "scripts")) {
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

  [IO.File]::AppendAllText((Join-Path $RolledBack.EngineRoot "dist\stdio.js"), "tampered", $Utf8)
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
