[CmdletBinding()]
param(
  [ValidateSet("Install", "Resolve", "Rollback")]
  [string]$Action = "Resolve",
  [string]$SourceRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")

switch ($Action) {
  "Install" {
    if ([string]::IsNullOrWhiteSpace($SourceRoot)) { throw "Install requires -SourceRoot." }
    Install-WorkForgePortableVersion -SourceRoot $SourceRoot
  }
  "Resolve" { Resolve-WorkForgePortableEngine }
  "Rollback" {
    . (Join-Path $PSScriptRoot "WorkForge.Update.ps1")
    $ActiveEngine = Resolve-WorkForgePortableEngine
    foreach ($Profile in @(Get-WorkForgeUpdateProfileRecords -EngineRoot $ActiveEngine.EngineRoot)) {
      if (Get-WorkForgeUpdateTunnelRunning -EngineRoot $ActiveEngine.EngineRoot -ProfileId $Profile.Id) {
        throw "Stop all WorkForge tunnels before rolling back."
      }
    }
    Invoke-WorkForgePortableRollback
  }
}
