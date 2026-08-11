[CmdletBinding()]
param(
  [ValidateSet("Auto", "Install", "Repair", "Upgrade")]
  [string]$Mode = "Auto",

  [string]$WorkspaceRoot = (Join-Path $env:USERPROFILE "WorkForge"),

  [string]$ProfileId = "workstation",

  [string]$DisplayName = "WorkForge",

  [string]$TunnelId,

  [switch]$SkipTunnelConfiguration,

  [switch]$ReconfigureTunnel,

  [switch]$SkipStart,

  [switch]$SkipOnlineDoctor,

  [switch]$NoBrowser,

  [switch]$SkipTunnelDownload,

  [switch]$NoDesktopShortcut,

  [switch]$InstallMissingPrerequisites,

  [switch]$InstallGit,

  [switch]$NonInteractive,

  [string]$RegistryPath,

  [switch]$Plain,

  [switch]$NoLog
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$SourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$SetupPath = Join-Path $PSScriptRoot "Setup.ps1"
$PortableModule = Join-Path $PSScriptRoot "WorkForge.Portable.ps1"
$SetupArguments = @{}
foreach ($Entry in $PSBoundParameters.GetEnumerator()) {
  $SetupArguments[$Entry.Key] = $Entry.Value
}

if (Test-Path -LiteralPath (Join-Path $SourceRoot ".workforge-release.json") -PathType Leaf) {
  . $PortableModule
  if (Test-Path -LiteralPath (Join-Path $SourceRoot ".workforge-install.json") -PathType Leaf) {
    $Runtime = Resolve-WorkForgePortableEngine
    if (-not $Runtime.EngineRoot.Equals($SourceRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Setup must run from the active portable WorkForge version."
    }
  } else {
    $Release = Get-WorkForgePortableRelease -SourceRoot $SourceRoot
    $Roots = Get-WorkForgePortableRoots
    $Runtime = $null
    $CurrentPath = Join-Path $Roots.ProgramsRoot "current.json"
    if (Test-Path -LiteralPath $CurrentPath -PathType Leaf) {
      $CurrentRuntime = Resolve-WorkForgePortableEngine
      $CurrentVersion = [version]$CurrentRuntime.Version
      $ReleaseVersion = [version]$Release.Version
      if ($ReleaseVersion -lt $CurrentVersion) {
        throw "Setup refuses to downgrade WorkForge. Use the explicit portable rollback path instead."
      }
      if ($ReleaseVersion -gt $CurrentVersion -and (Test-Path -LiteralPath (Join-Path $Roots.StateRoot "profile_registry.json") -PathType Leaf)) {
        . (Join-Path $PSScriptRoot "WorkForge.Update.ps1")
        $Upgrade = Invoke-WorkForgeTransactionalUpgrade -SourceRoot $SourceRoot
        Write-Output ("WorkForge updated from {0} to {1}. Existing profiles, credentials, and workspace files were preserved." -f $Upgrade.PreviousVersion, $Upgrade.Version)
        $SetupArguments["SkipStart"] = $true
        $Runtime = Resolve-WorkForgePortableEngine
      }
    }
    if ($null -eq $Runtime) { $Runtime = Install-WorkForgePortableVersion -SourceRoot $SourceRoot }
  }
  $SetupPath = Join-Path $Runtime.EngineRoot "scripts\Setup.ps1"
}

& $SetupPath @SetupArguments
$SetupSucceeded = $?
exit $(if ($SetupSucceeded) { 0 } else { 1 })
