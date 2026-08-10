$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$SourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$SetupPath = Join-Path $PSScriptRoot "Setup.ps1"
$PortableModule = Join-Path $PSScriptRoot "WorkForge.Portable.ps1"

if (Test-Path -LiteralPath (Join-Path $SourceRoot ".workforge-release.json") -PathType Leaf) {
  . $PortableModule
  if (Test-Path -LiteralPath (Join-Path $SourceRoot ".workforge-install.json") -PathType Leaf) {
    $Runtime = Resolve-WorkForgePortableEngine
    if (-not $Runtime.EngineRoot.Equals($SourceRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Setup must run from the active portable WorkForge version."
    }
  } else {
    $Runtime = Install-WorkForgePortableVersion -SourceRoot $SourceRoot
  }
  $SetupPath = Join-Path $Runtime.EngineRoot "scripts\Setup.ps1"
}

& $SetupPath @args
$SetupSucceeded = $?
exit $(if ($SetupSucceeded) { 0 } else { 1 })
