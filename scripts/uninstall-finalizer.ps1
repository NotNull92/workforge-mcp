[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][int]$ParentProcessId,
  [Parameter(Mandatory = $true)][string]$EngineRoot,
  [Parameter(Mandatory = $true)][string]$ExpectedManifestSha256,
  [Parameter(Mandatory = $true)][string]$ResultPath,
  [ValidateRange(5, 120)][int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
$Utf8 = [Text.UTF8Encoding]::new($false)
$FinalizerPath = $PSCommandPath
$FinalizerDirectory = Split-Path -Parent $FinalizerPath

function Write-FinalizerResult {
  param(
    [Parameter(Mandatory = $true)][bool]$Removed,
    [Parameter(Mandatory = $true)][string]$State,
    [string]$Detail
  )

  $Payload = [ordered]@{
    time = [DateTimeOffset]::UtcNow.ToString("o")
    removed = $Removed
    state = $State
  }
  if (-not [string]::IsNullOrWhiteSpace($Detail)) { $Payload.detail = $Detail }
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($ResultPath)) -Force | Out-Null
  [IO.File]::WriteAllText($ResultPath, ($Payload | ConvertTo-Json -Depth 4) + [Environment]::NewLine, $Utf8)
}

function Assert-FinalizerSafePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $FullPath = [IO.Path]::GetFullPath($Path).TrimEnd([char[]]@('\', '/'))
  $Root = [IO.Path]::GetPathRoot($FullPath).TrimEnd([char[]]@('\', '/'))
  if ($FullPath.Equals($Root, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Engine root cannot be a drive root."
  }
  $UserProfile = [Environment]::GetFolderPath("UserProfile").TrimEnd([char[]]@('\', '/'))
  if ($FullPath.Equals($UserProfile, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Engine root cannot be the user profile root."
  }
  if (Test-Path -LiteralPath (Join-Path $FullPath ".git")) {
    throw "Source repositories cannot be removed by the release finalizer."
  }
  return $FullPath
}

try {
  $EngineRoot = Assert-FinalizerSafePath -Path $EngineRoot
  $Deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTimeOffset]::UtcNow -lt $Deadline -and (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue)) {
    Start-Sleep -Milliseconds 250
  }
  if (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue) {
    throw "Timed out waiting for the uninstaller process to exit."
  }

  $ManifestPath = Join-Path $EngineRoot ".workforge-release.json"
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Release manifest is missing."
  }
  $ObservedManifestHash = (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash
  if (-not $ObservedManifestHash.Equals($ExpectedManifestSha256, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Release manifest hash changed after uninstall preflight."
  }

  $Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json -ErrorAction Stop
  if (
    [string]$Manifest.schemaVersion -cne "1" -or
    [string]$Manifest.product -cne "WorkForge" -or
    [string]$Manifest.distributionKind -cne "release"
  ) {
    throw "Release manifest identity is invalid."
  }

  Remove-Item -LiteralPath $EngineRoot -Recurse -Force -ErrorAction Stop
  if (Test-Path -LiteralPath $EngineRoot) {
    throw "Engine directory still exists after removal."
  }
  Write-FinalizerResult -Removed $true -State "completed"
} catch {
  Write-FinalizerResult -Removed $false -State "failed" -Detail $_.Exception.Message
  exit 1
} finally {
  Remove-Item -LiteralPath $FinalizerPath -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $FinalizerDirectory -PathType Container) {
    $Remaining = @(Get-ChildItem -LiteralPath $FinalizerDirectory -Force -ErrorAction SilentlyContinue)
    if ($Remaining.Count -eq 0) {
      Remove-Item -LiteralPath $FinalizerDirectory -Force -ErrorAction SilentlyContinue
    }
  }
}
