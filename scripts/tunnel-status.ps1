[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProfileId,

  [switch]$Snapshot
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-registry.ps1")

$Profile = Get-WorkForgeProfile -ProfileId $ProfileId
$ExecutablePath = Get-WorkForgeTunnelExecutablePath
$Paths = Get-WorkForgeTunnelRuntimePaths -Profile $Profile
$Recovery = Read-WorkForgeTunnelRecoveryState -Path $Paths.RecoveryStatePath

if ($Snapshot) {
  $DesiredRunning = Test-Path -LiteralPath $Paths.DesiredRunningPath -PathType Leaf
  $StopRequested = Test-Path -LiteralPath $Paths.StopRequestPath -PathType Leaf
  $SupervisorProcess = $null
  $SupervisorState = "not-recorded"
  $SupervisorError = $null
  if (Test-Path -LiteralPath $Paths.SupervisorPidPath -PathType Leaf) {
    try {
      $SupervisorProcess = Get-WorkForgeVerifiedTunnelSupervisorProcess `
        -Profile $Profile `
        -RecordedPidPath $Paths.SupervisorPidPath
      if ($SupervisorProcess) {
        $SupervisorState = "running"
      } else {
        $SupervisorState = "stale-record"
        $SupervisorError = "Recorded tunnel supervisor for profile $($Profile.Id) is no longer running."
      }
    } catch {
      $SupervisorState = "verification-error"
      $SupervisorError = $_.Exception.Message
    }
  }

  $TunnelProcess = $null
  $ProcessState = "not-recorded"
  $ProcessError = $null
  if (Test-Path -LiteralPath $Paths.TunnelPidPath -PathType Leaf) {
    try {
      $TunnelProcess = Get-WorkForgeVerifiedTunnelProcess `
        -Profile $Profile `
        -RecordedPidPath $Paths.TunnelPidPath `
        -ExecutablePath $ExecutablePath
      if ($TunnelProcess) {
        $ProcessState = "running"
      } else {
        $ProcessState = "stale-record"
        $ProcessError = "Recorded tunnel profile $($Profile.Id) process is no longer running."
      }
    } catch {
      $ProcessState = "verification-error"
      $ProcessError = $_.Exception.Message
    }
  }

  $HealthBaseUrl = $null
  $Health = $null
  $Ready = $null
  $HealthError = $null
  $ReadyError = $null
  if ($TunnelProcess) {
    try {
      $HealthBaseUrl = Read-WorkForgeHealthBaseUrl -Path $Paths.HealthUrlPath -ProfileId $Profile.Id
    } catch {
      $HealthError = $_.Exception.Message
      $ReadyError = "Readiness was not queried because the local health URL could not be verified."
    }

    if ($HealthBaseUrl) {
      try {
        $Health = Invoke-RestMethod -Uri "$HealthBaseUrl/healthz" -TimeoutSec 2
      } catch {
        $HealthError = $_.Exception.Message
      }
      try {
        $Ready = Invoke-RestMethod -Uri "$HealthBaseUrl/readyz" -TimeoutSec 2
      } catch {
        $ReadyError = $_.Exception.Message
      }
    }
  }

  $Errors = @(
    @($SupervisorError, $ProcessError, $HealthError, $ReadyError) |
      Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
  )
  [pscustomobject]@{
    profileId = $Profile.Id
    running = $null -ne $TunnelProcess
    pid = if ($TunnelProcess) { [int]$TunnelProcess.ProcessId } else { $null }
    processState = $ProcessState
    desiredRunning = $DesiredRunning
    stopRequested = $StopRequested
    health = $Health
    ready = $Ready
    healthError = $HealthError
    readyError = $ReadyError
    adminUi = if ($HealthBaseUrl) { "$HealthBaseUrl/ui" } else { $null }
    stateDirectory = $Paths.RuntimeRoot
    supervised = $null -ne $SupervisorProcess
    supervisorPid = if ($SupervisorProcess) { [int]$SupervisorProcess.ProcessId } else { $null }
    supervisorState = $SupervisorState
    supervisorError = $SupervisorError
    legacyState = $null -ne $TunnelProcess -and $null -eq $SupervisorProcess
    recoveryState = if ($Recovery) { [string]$Recovery.state } else { $null }
    recoveryFailureCount = if ($Recovery) { [int]$Recovery.failureCount } else { $null }
    recoveryLastExitCode = if ($Recovery -and $null -ne $Recovery.lastExitCode) { [int]$Recovery.lastExitCode } else { $null }
    recoveryNextDelaySeconds = if ($Recovery -and $null -ne $Recovery.nextDelaySeconds) { [int]$Recovery.nextDelaySeconds } else { $null }
    recoveryDetail = if ($Recovery) { [string]$Recovery.detail } else { $null }
    recoveryUpdatedAt = if ($Recovery) { [string]$Recovery.updatedAt } else { $null }
    error = if ($Errors.Count -gt 0) { $Errors -join " | " } else { $null }
  } | ConvertTo-Json -Depth 8
  return
}

$SupervisorProcess = $null
if (Test-Path -LiteralPath $Paths.SupervisorPidPath -PathType Leaf) {
  $SupervisorProcess = Get-WorkForgeVerifiedTunnelSupervisorProcess `
    -Profile $Profile `
    -RecordedPidPath $Paths.SupervisorPidPath
  if (-not $SupervisorProcess) {
    throw "Recorded tunnel supervisor for profile $($Profile.Id) is no longer running."
  }
}

if (-not (Test-Path -LiteralPath $Paths.TunnelPidPath -PathType Leaf)) {
  $RecoveryDetail = if ($Recovery -and $Recovery.state) { " Recovery state: $($Recovery.state)." } else { "" }
  throw "Tunnel profile $($Profile.Id) is not recorded as running.$RecoveryDetail"
}

$TunnelProcess = Get-WorkForgeVerifiedTunnelProcess `
  -Profile $Profile `
  -RecordedPidPath $Paths.TunnelPidPath `
  -ExecutablePath $ExecutablePath
if (-not $TunnelProcess) {
  throw "Recorded tunnel profile $($Profile.Id) process is no longer running."
}

$HealthBaseUrl = Read-WorkForgeHealthBaseUrl -Path $Paths.HealthUrlPath -ProfileId $Profile.Id
$Health = Invoke-RestMethod -Uri "$HealthBaseUrl/healthz" -TimeoutSec 5
$Ready = Invoke-RestMethod -Uri "$HealthBaseUrl/readyz" -TimeoutSec 5
[pscustomobject]@{
  profileId = $Profile.Id
  pid = [int]$TunnelProcess.ProcessId
  health = $Health
  ready = $Ready
  adminUi = "$HealthBaseUrl/ui"
  stateDirectory = $Paths.RuntimeRoot
  supervised = $null -ne $SupervisorProcess
  supervisorPid = if ($SupervisorProcess) { [int]$SupervisorProcess.ProcessId } else { $null }
  legacyState = $null -eq $SupervisorProcess
  recoveryState = if ($Recovery) { [string]$Recovery.state } else { $null }
  recoveryFailureCount = if ($Recovery) { [int]$Recovery.failureCount } else { $null }
} | ConvertTo-Json -Depth 8
