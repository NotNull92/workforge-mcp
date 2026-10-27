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
    $EngineMutex = [Threading.Mutex]::new($false, 'Local\WorkForgeMcp-Engine')
    $EngineLockAcquired = $false
    try {
    try { $EngineLockAcquired = $EngineMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $EngineLockAcquired = $true }
    if (-not $EngineLockAcquired) { throw 'Another WorkForge update, rollback or uninstall is running.' }
    . (Join-Path $PSScriptRoot "WorkForge.Update.ps1")
    $ActiveEngine = Resolve-WorkForgePortableEngine
    foreach ($Profile in @(Get-WorkForgeUpdateProfileRecords -EngineRoot $ActiveEngine.EngineRoot)) {
      if (Get-WorkForgeUpdateTunnelRunning -EngineRoot $ActiveEngine.EngineRoot -ProfileId $Profile.Id) {
        throw "Stop all WorkForge tunnels before rolling back."
      }
    }
    Invoke-WorkForgePortableRollback
    } finally {
      if ($EngineLockAcquired) { $EngineMutex.ReleaseMutex() }
      $EngineMutex.Dispose()
    }
  }
}
