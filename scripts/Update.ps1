[CmdletBinding()]
param(
  [ValidateSet("Check", "Apply")]
  [string]$Action = "Check",
  [switch]$Json,
  [switch]$EmitProgress
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Update.ps1")

$ProgressCallback = $null
if ($EmitProgress) {
  $ProgressCallback = {
    param([string]$Stage, [int]$Percent, [string]$Message)
    $Payload = [ordered]@{
      stage = $Stage
      percent = [Math]::Max(0, [Math]::Min(100, $Percent))
      message = $Message
    }
    [Console]::Error.WriteLine("WORKFORGE_UPDATE_PROGRESS " + ($Payload | ConvertTo-Json -Compress))
  }.GetNewClosure()
}

function Publish-WorkForgeUpdateProgress {
  param([string]$Stage, [int]$Percent, [string]$Message)
  if ($null -ne $ProgressCallback) { $null = & $ProgressCallback $Stage $Percent $Message }
}

try {
  $EngineRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..")).TrimEnd([char[]]@('\', '/'))
  $VersionsRoot = [IO.Path]::GetFullPath((Join-Path (Get-WorkForgePortableRoots).ProgramsRoot "versions")).TrimEnd([char[]]@('\', '/')) + '\'
  if (-not $EngineRoot.StartsWith($VersionsRoot, [StringComparison]::OrdinalIgnoreCase)) {
    if ($Action -eq "Apply") {
      throw "Automatic updates are unavailable for a source checkout. Run git pull and npm run build in the repository."
    }
    $Package = Get-Content -Raw -LiteralPath (Join-Path $EngineRoot "package.json") | ConvertFrom-Json
    $Result = [pscustomobject]@{
      supported = $false
      reason = "source-checkout"
      currentVersion = [string]$Package.version
      latestVersion = $null
      updateAvailable = $false
    }
  } elseif ($Action -eq "Check") {
    $Result = Get-WorkForgeUpdateInfo
  } else {
    Publish-WorkForgeUpdateProgress -Stage "checking" -Percent 5 -Message "Checking the latest stable WorkForge release..."
    $Descriptor = Get-WorkForgeUpdateDescriptor
    if (-not $Descriptor.UpdateAvailable) {
      $Result = [pscustomobject]@{
        updated = $false
        currentVersion = $Descriptor.CurrentVersion
        latestVersion = $Descriptor.LatestVersion
        message = "WorkForge is already up to date."
      }
      Publish-WorkForgeUpdateProgress -Stage "completed" -Percent 100 -Message "WorkForge is already up to date."
    } else {
      $Downloaded = Receive-WorkForgeUpdateRelease -Descriptor $Descriptor -ProgressCallback $ProgressCallback
      try {
        $Upgrade = Invoke-WorkForgeTransactionalUpgrade -SourceRoot $Downloaded.Root -ProgressCallback $ProgressCallback
        $Result = [pscustomobject]@{
          updated = $true
          previousVersion = $Upgrade.PreviousVersion
          version = $Upgrade.Version
          profilesRebound = $Upgrade.ProfilesRebound
          profilesRestarted = $Upgrade.ProfilesRestarted
          sha256 = $Downloaded.Sha256
          message = "WorkForge updated successfully. Reopen WorkForge Control to use the new dashboard."
        }
        Publish-WorkForgeUpdateProgress -Stage "completed" -Percent 100 -Message "WorkForge $($Upgrade.Version) is ready."
      } finally {
        if ($null -ne $Downloaded -and (Test-Path -LiteralPath $Downloaded.TempRoot)) {
          Remove-Item -LiteralPath $Downloaded.TempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }

  if ($Json) {
    $Result | ConvertTo-Json -Depth 6 -Compress
  } else {
    $Result | Format-List | Out-String | Write-Output
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
