[CmdletBinding()]
param(
  [ValidateSet("Check", "Apply")]
  [string]$Action = "Check",
  [switch]$Json
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Update.ps1")

try {
  if ($Action -eq "Check") {
    $Result = Get-WorkForgeUpdateInfo
  } else {
    $Descriptor = Get-WorkForgeUpdateDescriptor
    if (-not $Descriptor.UpdateAvailable) {
      $Result = [pscustomobject]@{
        updated = $false
        currentVersion = $Descriptor.CurrentVersion
        latestVersion = $Descriptor.LatestVersion
        message = "WorkForge is already up to date."
      }
    } else {
      $Downloaded = Receive-WorkForgeUpdateRelease -Descriptor $Descriptor
      try {
        $Upgrade = Invoke-WorkForgeTransactionalUpgrade -SourceRoot $Downloaded.Root
        $Result = [pscustomobject]@{
          updated = $true
          previousVersion = $Upgrade.PreviousVersion
          version = $Upgrade.Version
          profilesRebound = $Upgrade.ProfilesRebound
          profilesRestarted = $Upgrade.ProfilesRestarted
          sha256 = $Downloaded.Sha256
          message = "WorkForge updated successfully. Reopen WorkForge Control to use the new dashboard."
        }
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
