[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProfileId,

  [ValidateRange(10, 120)]
  [int]$TimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-registry.ps1")

$Profile = Get-WorkForgeProfile -ProfileId $ProfileId -RequireTunnelConfig
$Paths = Get-WorkForgeTunnelRuntimePaths -Profile $Profile
$StatusScript = Join-Path $PSScriptRoot "tunnel-status.ps1"
$Before = ((& $StatusScript -ProfileId $Profile.Id | Out-String) | ConvertFrom-Json -ErrorAction Stop)
if (-not $Before.supervised -or $Before.ready -ne "ready") {
  throw "Profile $($Profile.Id) must be supervised and ready before the recovery test."
}

$Verified = Get-WorkForgeVerifiedTunnelProcess `
  -Profile $Profile `
  -RecordedPidPath $Paths.TunnelPidPath `
  -ExecutablePath (Get-WorkForgeTunnelExecutablePath)
if (-not $Verified -or [int]$Verified.ProcessId -ne [int]$Before.pid) {
  throw "Refusing to stop an unverified tunnel process for profile $($Profile.Id)."
}

$OldTunnelPid = [int]$Before.pid
$SupervisorPid = [int]$Before.supervisorPid
Stop-WorkForgeProcessTree -TargetProcessId $OldTunnelPid

$Deadline = [DateTimeOffset]::Now.AddSeconds($TimeoutSeconds)
$After = $null
while ([DateTimeOffset]::Now -lt $Deadline) {
  Start-Sleep -Milliseconds 500
  try {
    $Candidate = ((& $StatusScript -ProfileId $Profile.Id 2>$null | Out-String) | ConvertFrom-Json -ErrorAction Stop)
    if (
      $Candidate.supervised -and
      [int]$Candidate.supervisorPid -eq $SupervisorPid -and
      [int]$Candidate.pid -ne $OldTunnelPid -and
      $Candidate.health -eq "live" -and
      $Candidate.ready -eq "ready"
    ) {
      $After = $Candidate
      break
    }
  } catch {
    # A missing child PID and health URL are expected during the bounded backoff.
  }
}

if (-not $After) {
  throw "Profile $($Profile.Id) did not recover under the same supervisor within $TimeoutSeconds seconds."
}

$Recovery = Read-WorkForgeTunnelRecoveryState -Path $Paths.RecoveryStatePath
[pscustomobject]@{
  profileId = $Profile.Id
  supervisorPidBefore = $SupervisorPid
  supervisorPidAfter = [int]$After.supervisorPid
  tunnelPidBefore = $OldTunnelPid
  tunnelPidAfter = [int]$After.pid
  health = [string]$After.health
  ready = [string]$After.ready
  recoveryState = if ($Recovery) { [string]$Recovery.state } else { $null }
  recoveryFailureCount = if ($Recovery) { [int]$Recovery.failureCount } else { $null }
} | ConvertTo-Json -Depth 4
