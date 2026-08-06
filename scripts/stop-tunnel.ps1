[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProfileId
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-registry.ps1")

$Profile = Get-WorkForgeProfile -ProfileId $ProfileId
$ExecutablePath = Get-WorkForgeTunnelExecutablePath
$Paths = Get-WorkForgeTunnelRuntimePaths -Profile $Profile
New-Item -ItemType Directory -Force -Path $Paths.RuntimeRoot | Out-Null

# Record stop intent before touching either process so a racing supervisor cannot relaunch.
Set-Content -LiteralPath $Paths.StopRequestPath -Value $Profile.Id -Encoding ascii
Remove-Item -LiteralPath $Paths.DesiredRunningPath -Force -ErrorAction SilentlyContinue

$OperationLock = Enter-WorkForgeTunnelOperationLock -ProfileId $Profile.Id
$StoppedAnything = $false
try {
  if (Test-Path -LiteralPath $Paths.TunnelPidPath -PathType Leaf) {
    $TunnelProcess = Get-WorkForgeVerifiedTunnelProcess `
      -Profile $Profile `
      -RecordedPidPath $Paths.TunnelPidPath `
      -ExecutablePath $ExecutablePath
    if ($TunnelProcess) {
      Stop-WorkForgeProcessTree -TargetProcessId ([int]$TunnelProcess.ProcessId)
      Start-Sleep -Milliseconds 150
      if (Get-Process -Id ([int]$TunnelProcess.ProcessId) -ErrorAction SilentlyContinue) {
        throw "Verified tunnel-client PID $($TunnelProcess.ProcessId) did not stop."
      }
      Write-Output "Stopped tunnel profile $($Profile.Id) PID $($TunnelProcess.ProcessId)."
      $StoppedAnything = $true
    } else {
      Write-Output "Recorded tunnel profile $($Profile.Id) process is no longer running."
    }
    Remove-Item -LiteralPath $Paths.TunnelPidPath -Force -ErrorAction SilentlyContinue
  }
} finally {
  Exit-WorkForgeTunnelOperationLock -Lock $OperationLock
}

$SupervisorProcess = $null
if (Test-Path -LiteralPath $Paths.SupervisorPidPath -PathType Leaf) {
  $SupervisorProcess = Get-WorkForgeVerifiedTunnelSupervisorProcess `
    -Profile $Profile `
    -RecordedPidPath $Paths.SupervisorPidPath
  if ($SupervisorProcess) {
    $Deadline = [DateTimeOffset]::Now.AddSeconds(5)
    while ([DateTimeOffset]::Now -lt $Deadline -and (Get-Process -Id ([int]$SupervisorProcess.ProcessId) -ErrorAction SilentlyContinue)) {
      Start-Sleep -Milliseconds 200
    }
    if (Get-Process -Id ([int]$SupervisorProcess.ProcessId) -ErrorAction SilentlyContinue) {
      Stop-WorkForgeProcessTree -TargetProcessId ([int]$SupervisorProcess.ProcessId)
      Start-Sleep -Milliseconds 150
    }
    if (Get-Process -Id ([int]$SupervisorProcess.ProcessId) -ErrorAction SilentlyContinue) {
      throw "Verified tunnel supervisor PID $($SupervisorProcess.ProcessId) did not stop."
    }
    Write-Output "Stopped tunnel supervisor for profile $($Profile.Id) PID $($SupervisorProcess.ProcessId)."
    $StoppedAnything = $true
  }
  Remove-Item -LiteralPath $Paths.SupervisorPidPath -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $Paths.HealthUrlPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $Paths.RecoveryStatePath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $Paths.StopRequestPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $Paths.SupervisorStdinPath -Force -ErrorAction SilentlyContinue
if (-not $StoppedAnything) {
  Write-Output "Tunnel profile $($Profile.Id) is not recorded as running."
}
