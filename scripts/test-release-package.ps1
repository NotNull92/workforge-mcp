[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][string]$HashPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath -ErrorAction Stop).Path
$HashPath = (Resolve-Path -LiteralPath $HashPath -ErrorAction Stop).Path

$ExpectedHashLine = (Get-Content -Raw -LiteralPath $HashPath).Trim()
if ($ExpectedHashLine -notmatch '^([a-f0-9]{64})\s+(.+)$') { throw "Release checksum file has invalid syntax." }
$ExpectedHash = $Matches[1]
$ExpectedName = $Matches[2]
if ($ExpectedName -cne [IO.Path]::GetFileName($ArchivePath)) { throw "Release checksum file names a different archive." }
$ObservedHash = (Get-WorkForgeFileSha256 -Path $ArchivePath).ToLowerInvariant()
if ($ObservedHash -cne $ExpectedHash) { throw "Release archive checksum mismatch." }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$Zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  $Names = @($Zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  if ($Names.Count -lt 50) { throw "Release archive contains too few entries." }

  $RequiredSuffixes = @(
    "/.workforge-release.json",
    "/Setup.cmd",
    "/Install.cmd",
    "/Uninstall.cmd",
    "/Configure Tunnel.cmd",
    "/WorkForge Control.cmd",
    "/README.ko.md",
    "/control-ui/index.html",
    "/control-ui/app.js",
    "/control-ui/style.css",
    "/dist/stdio.js",
    "/runtime-lock.json",
    "/runtimes/node/node.exe",
    "/runtimes/ripgrep/rg.exe",
    "/runtimes/tunnel-client/tunnel-client.exe",
    "/licenses/node/LICENSE.txt",
    "/licenses/ripgrep/LICENSE.txt",
    "/licenses/tunnel-client/LICENSE.txt",
    "/plugins/workforge/plugin.json",
    "/plugins/workforge/mcp.json",
    "/plugins/workforge/.codex-plugin/plugin.json",
    "/plugins/workforge/.mcp.json",
    "/plugins/workforge/bin/workforge-stdio.cmd",
    "/node_modules/@modelcontextprotocol/sdk/package.json",
    "/node_modules/zod/package.json",
    "/scripts/Setup.ps1",
    "/scripts/Launch-Control.ps1",
    "/scripts/control-server.mjs",
    "/scripts/Portable-Control.cmd",
    "/scripts/Portable-Dispatch.cmd",
    "/scripts/Portable-Dispatch.ps1",
    "/scripts/WorkForge.Contract.ps1",
    "/scripts/WorkForge.ProfileRuntime.ps1",
    "/scripts/WorkForge.TunnelRuntime.ps1",
    "/scripts/profile-registry.ps1",
    "/scripts/Uninstall.ps1",
    "/scripts/uninstall-finalizer.ps1",
    "/scripts/WorkForge.UI.ps1",
    "/scripts/WorkForge.Prerequisites.ps1",
    "/docs/logo/logo.png",
    "/docs/UNINSTALL.md",
    "/workforge-contract.json"
  )
  foreach ($Suffix in $RequiredSuffixes) {
    if (@($Names | Where-Object { $_.EndsWith($Suffix, [StringComparison]::Ordinal) }).Count -ne 1) {
      throw "Release archive is missing required entry: $Suffix"
    }
  }

  $ManifestEntry = $Zip.Entries | Where-Object { $_.FullName.Replace('\', '/').EndsWith('/.workforge-release.json', [StringComparison]::Ordinal) } | Select-Object -First 1
  $Reader = [IO.StreamReader]::new($ManifestEntry.Open(), [Text.UTF8Encoding]::new($false, $true))
  try {
    $Manifest = $Reader.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop
  } finally {
    $Reader.Dispose()
  }
  if (
    [string]$Manifest.schemaVersion -cne "1" -or
    [string]$Manifest.product -cne "WorkForge" -or
    [string]$Manifest.distributionKind -cne "portable-release"
  ) {
    throw "Release archive contains an invalid WorkForge release manifest."
  }

  foreach ($ForbiddenPattern in @(
    '^[^/]+/runtime/',
    '^[^/]+/artifacts/',
    '(?:^|/)\.env\.local$',
    '(?:^|/)tunnel\.local\.yaml$',
    '(?:^|/)profile_registry\.json$',
    '(?:^|/)install-manifest\.json$',
    '(?:^|/).+\.jsonl$',
    '(?:^|/)uninstall-.+\.json$',
    '^[^/]+/node_modules/(?:typescript|vitest)/package\.json$',
    '^[^/]+/node_modules/@types/node/package\.json$',
    '^[^/]+/release/.+\.zip(?:\.sha256)?$'
  )) {
    $Forbidden = $Names | Where-Object { $_ -match $ForbiddenPattern } | Select-Object -First 1
    if ($Forbidden) { throw "Release archive contains forbidden entry: $Forbidden" }
  }
} finally {
  $Zip.Dispose()
}

Write-Output "RELEASE_PACKAGE_TEST_OK"
