Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Contract.ps1")

$script:WorkForgePortableRuntime = $null
$PortableModulePath = Join-Path $PSScriptRoot "WorkForge.Portable.ps1"
if (Test-Path -LiteralPath $PortableModulePath -PathType Leaf) {
  . $PortableModulePath
  $CandidateRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
  if (Test-Path -LiteralPath (Join-Path $CandidateRoot ".workforge-release.json") -PathType Leaf) {
    $null = Get-WorkForgePortableRelease -SourceRoot $CandidateRoot
    $ResolvedPortableRuntime = Resolve-WorkForgePortableEngine
    if (-not $ResolvedPortableRuntime.EngineRoot.Equals($CandidateRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "The active portable WorkForge version does not match this engine root."
    }
    $script:WorkForgePortableRuntime = $ResolvedPortableRuntime
    [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", (Join-Path $ResolvedPortableRuntime.StateRoot "profile_registry.json"), "Process")
    [Environment]::SetEnvironmentVariable("WORKFORGE_RIPGREP_PATH", $ResolvedPortableRuntime.RipgrepPath, "Process")
  }
}

. (Join-Path $PSScriptRoot "WorkForge.ProfileRuntime.ps1")
. (Join-Path $PSScriptRoot "WorkForge.TunnelRuntime.ps1")
