[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArchivePath,
  [Parameter(Mandatory = $true)][string]$HashPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath -ErrorAction Stop).Path
$HashPath = (Resolve-Path -LiteralPath $HashPath -ErrorAction Stop).Path

$ExpectedHashLine = (Get-Content -Raw -LiteralPath $HashPath).Trim()
if ($ExpectedHashLine -notmatch '^([a-f0-9]{64})\s+(.+)$') { throw "Release checksum file has invalid syntax." }
$ExpectedHash = $Matches[1]
$ExpectedName = $Matches[2]
if ($ExpectedName -cne [IO.Path]::GetFileName($ArchivePath)) { throw "Release checksum file names a different archive." }
$ObservedHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ObservedHash -cne $ExpectedHash) { throw "Release archive checksum mismatch." }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$Zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  $Names = @($Zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  if ($Names.Count -lt 40) { throw "Release archive contains too few entries." }

  $RequiredSuffixes = @(
    "/Setup.cmd",
    "/Install.cmd",
    "/Configure Tunnel.cmd",
    "/WorkForge Control.cmd",
    "/dist/stdio.js",
    "/node_modules/@modelcontextprotocol/sdk/package.json",
    "/node_modules/zod/package.json",
    "/scripts/Setup.ps1"
  )
  foreach ($Suffix in $RequiredSuffixes) {
    if (@($Names | Where-Object { $_.EndsWith($Suffix, [StringComparison]::Ordinal) }).Count -ne 1) {
      throw "Release archive is missing required entry: $Suffix"
    }
  }

  foreach ($ForbiddenPattern in @(
    '^[^/]+/runtime/',
    '^[^/]+/artifacts/',
    '(?:^|/)\.env\.local$',
    '(?:^|/)tunnel\.local\.yaml$',
    '(?:^|/)profile_registry\.json$',
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
