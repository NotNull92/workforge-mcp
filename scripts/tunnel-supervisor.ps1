[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProfileId,

  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-registry.ps1")

$Profile = Get-WorkForgeProfile -ProfileId $ProfileId -RequireTunnelConfig
$ToolRoot = Get-WorkForgeToolRoot
$ExecutablePath = Get-WorkForgeTunnelExecutablePath
$StdioRuntime = Get-WorkForgeStdioRuntime
$Paths = Get-WorkForgeTunnelRuntimePaths -Profile $Profile
$MaximumRestarts = 3
$RecoveryWindowSeconds = 300
$StableResetSeconds = 600
$StartupTimeoutSeconds = 20

function Write-SupervisorLog {
  param([string]$Message)

  $Line = "{0} {1}{2}" -f ([DateTimeOffset]::Now.ToString("o")), $Message, [Environment]::NewLine
  [IO.File]::AppendAllText($Paths.SupervisorLogPath, $Line, [Text.UTF8Encoding]::new($false))
}

function Write-RecoveryState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$State,

    [int]$FailureCount = 0,

    [Nullable[int]]$LastExitCode = $null,

    [Nullable[int]]$NextDelaySeconds = $null,

    [string]$Detail = ""
  )

  $Payload = [ordered]@{
    version = 1
    profileId = $Profile.Id
    state = $State
    supervisorPid = $PID
    failureCount = $FailureCount
    lastExitCode = $LastExitCode
    nextDelaySeconds = $NextDelaySeconds
    detail = $Detail
    updatedAt = [DateTimeOffset]::Now.ToString("o")
  }
  $Json = $Payload | ConvertTo-Json -Depth 4
  $TemporaryPath = "$($Paths.RecoveryStatePath).tmp.$PID.$([guid]::NewGuid().ToString('N'))"
  $BackupPath = "$($Paths.RecoveryStatePath).bak.$PID.$([guid]::NewGuid().ToString('N'))"
  try {
    [IO.File]::WriteAllText($TemporaryPath, $Json, [Text.UTF8Encoding]::new($false))
    $Written = $false
    $LastWriteError = $null
    for ($Attempt = 1; $Attempt -le 10 -and -not $Written; $Attempt += 1) {
      try {
        if (Test-Path -LiteralPath $Paths.RecoveryStatePath -PathType Leaf) {
          [IO.File]::Replace($TemporaryPath, $Paths.RecoveryStatePath, $BackupPath, $true)
        } else {
          [IO.File]::Move($TemporaryPath, $Paths.RecoveryStatePath)
        }
        $Written = $true
      } catch [IO.IOException] {
        $LastWriteError = $_.Exception
        Start-Sleep -Milliseconds 50
      } catch [UnauthorizedAccessException] {
        $LastWriteError = $_.Exception
        Start-Sleep -Milliseconds 50
      }
    }
    if (-not $Written) {
      Write-SupervisorLog "Recovery-state update skipped after bounded retries: $($LastWriteError.Message)"
    }
  } finally {
    Remove-Item -LiteralPath $TemporaryPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $BackupPath -Force -ErrorAction SilentlyContinue
  }
}

function Test-RunRequested {
  if (Test-Path -LiteralPath $Paths.StopRequestPath -PathType Leaf) {
    return $false
  }
  if (-not (Test-Path -LiteralPath $Paths.DesiredRunningPath -PathType Leaf)) {
    return $false
  }
  $DesiredProfile = (Get-Content -Raw -LiteralPath $Paths.DesiredRunningPath).Trim()
  return $DesiredProfile -ceq $Profile.Id
}

function Wait-Interruptibly {
  param([int]$Seconds)

  $Deadline = [DateTimeOffset]::Now.AddSeconds($Seconds)
  while ([DateTimeOffset]::Now -lt $Deadline) {
    if (-not (Test-RunRequested)) {
      return $false
    }
    Start-Sleep -Milliseconds 250
  }
  return $true
}

function Wait-TunnelReady {
  param([Diagnostics.Process]$Process)

  $Deadline = [DateTimeOffset]::Now.AddSeconds($StartupTimeoutSeconds)
  $LastDetail = "health URL not written"
  while ([DateTimeOffset]::Now -lt $Deadline) {
    if ($Process.HasExited -or -not (Test-RunRequested)) {
      return [pscustomobject]@{ Ready = $false; Detail = $LastDetail }
    }
    try {
      $HealthBaseUrl = Read-WorkForgeHealthBaseUrl -Path $Paths.HealthUrlPath -ProfileId $Profile.Id
      $Health = Invoke-WebRequest -UseBasicParsing -Uri "$HealthBaseUrl/healthz" -TimeoutSec 2
      $Ready = Invoke-WebRequest -UseBasicParsing -Uri "$HealthBaseUrl/readyz" -TimeoutSec 2
      if ($Health.StatusCode -eq 200 -and $Ready.StatusCode -eq 200) {
        return [pscustomobject]@{ Ready = $true; Detail = "ready" }
      }
      $LastDetail = "health=$($Health.StatusCode), ready=$($Ready.StatusCode)"
    } catch {
      $LastDetail = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 500
  }
  return [pscustomobject]@{ Ready = $false; Detail = $LastDetail }
}

if ($ValidateOnly) {
  [pscustomobject]@{
    ok = $true
    profileId = $Profile.Id
    supervisorPath = Get-WorkForgeTunnelSupervisorScriptPath
    runtimeDirectory = $Paths.RuntimeRoot
    tunnelPidPath = $Paths.TunnelPidPath
    supervisorPidPath = $Paths.SupervisorPidPath
    stopRequestPath = $Paths.StopRequestPath
    maximumRestarts = $MaximumRestarts
    recoveryWindowSeconds = $RecoveryWindowSeconds
    stableResetSeconds = $StableResetSeconds
    tunnelExecutablePath = $ExecutablePath
    nodePath = $StdioRuntime.NodePath
    stdioPath = $StdioRuntime.StdioPath
  } | ConvertTo-Json -Depth 4
  return
}

New-Item -ItemType Directory -Force -Path $Paths.RuntimeRoot | Out-Null
$null = Initialize-WorkForgeControlPlaneCredential

if (-not (Test-RunRequested)) {
  throw "Tunnel supervisor for profile $($Profile.Id) was started without a running request."
}

if (Test-Path -LiteralPath $Paths.SupervisorPidPath -PathType Leaf) {
  $ExistingSupervisor = Get-WorkForgeVerifiedTunnelSupervisorProcess -Profile $Profile -RecordedPidPath $Paths.SupervisorPidPath
  if ($ExistingSupervisor -and [int]$ExistingSupervisor.ProcessId -ne $PID) {
    throw "Tunnel supervisor for profile $($Profile.Id) is already running as PID $($ExistingSupervisor.ProcessId)."
  }
  if (-not $ExistingSupervisor) {
    Remove-Item -LiteralPath $Paths.SupervisorPidPath -Force
  }
}
Set-Content -LiteralPath $Paths.SupervisorPidPath -Value ([string]$PID) -Encoding ascii

$FailureTimes = [Collections.Generic.List[DateTimeOffset]]::new()
$FinalState = "stopped"
try {
  Write-SupervisorLog "Supervisor started for profile $($Profile.Id) as PID $PID."
  while (Test-RunRequested) {
    $OperationLock = Enter-WorkForgeTunnelOperationLock -ProfileId $Profile.Id
    $TunnelProcess = $null
    try {
      if (-not (Test-RunRequested)) {
        break
      }
      if (Test-Path -LiteralPath $Paths.TunnelPidPath -PathType Leaf) {
        $ExistingTunnel = Get-WorkForgeVerifiedTunnelProcess `
          -Profile $Profile `
          -RecordedPidPath $Paths.TunnelPidPath `
          -ExecutablePath $ExecutablePath
        if ($ExistingTunnel) {
          throw "A tunnel process already exists for profile $($Profile.Id); supervisor will not adopt or replace it."
        }
        Remove-Item -LiteralPath $Paths.TunnelPidPath -Force
      }
      Remove-Item -LiteralPath $Paths.HealthUrlPath -Force -ErrorAction SilentlyContinue

      $Arguments = @(
        "run",
        "--profile-file", "`"$($Profile.TunnelConfigPath)`"",
        "--control-plane.api-key", "env:CONTROL_PLANE_API_KEY",
        "--pid.file", "`"$($Paths.TunnelPidPath)`"",
        "--health.listen-addr", "127.0.0.1:0",
        "--health.url-file", "`"$($Paths.HealthUrlPath)`"",
        "--log.file", "`"$($Paths.TunnelLogPath)`""
      )
      Write-RecoveryState -State "starting" -FailureCount $FailureTimes.Count
      $TunnelProcess = Start-Process `
        -FilePath $ExecutablePath `
        -ArgumentList $Arguments `
        -WorkingDirectory $ToolRoot `
        -RedirectStandardOutput $Paths.TunnelProcessStdoutPath `
        -RedirectStandardError $Paths.TunnelStderrPath `
        -WindowStyle Hidden `
        -PassThru
    } finally {
      Exit-WorkForgeTunnelOperationLock -Lock $OperationLock
    }

    $StartedAt = [DateTimeOffset]::Now
    $ReadyResult = Wait-TunnelReady -Process $TunnelProcess
    if (-not $ReadyResult.Ready) {
      if (-not $TunnelProcess.HasExited) {
        Stop-WorkForgeProcessTree -TargetProcessId $TunnelProcess.Id
        $TunnelProcess.WaitForExit(5000) | Out-Null
      }
      Write-SupervisorLog "Profile $($Profile.Id) failed readiness: $($ReadyResult.Detail)"
    } else {
      Write-RecoveryState -State "ready" -FailureCount $FailureTimes.Count
      Write-SupervisorLog "Profile $($Profile.Id) tunnel PID $($TunnelProcess.Id) became ready."
      $StableResetRecorded = $FailureTimes.Count -eq 0
      while (-not $TunnelProcess.HasExited -and (Test-RunRequested)) {
        Start-Sleep -Milliseconds 500
        if (
          -not $StableResetRecorded -and
          ([DateTimeOffset]::Now - $StartedAt).TotalSeconds -ge $StableResetSeconds
        ) {
          $FailureTimes.Clear()
          Write-RecoveryState -State "ready" -FailureCount 0
          Write-SupervisorLog "Profile $($Profile.Id) recovery budget reset after $StableResetSeconds stable seconds."
          $StableResetRecorded = $true
        }
      }
      if (-not (Test-RunRequested) -and -not $TunnelProcess.HasExited) {
        Stop-WorkForgeProcessTree -TargetProcessId $TunnelProcess.Id
        $TunnelProcess.WaitForExit(5000) | Out-Null
      }
    }

    if (-not (Test-RunRequested)) {
      $FinalState = "stopped"
      break
    }

    if (-not $TunnelProcess.HasExited) {
      Stop-WorkForgeProcessTree -TargetProcessId $TunnelProcess.Id
      $TunnelProcess.WaitForExit(5000) | Out-Null
    }
    $ExitCode = if ($TunnelProcess.HasExited) { $TunnelProcess.ExitCode } else { $null }
    $RunSeconds = ([DateTimeOffset]::Now - $StartedAt).TotalSeconds
    if ($RunSeconds -ge $StableResetSeconds) {
      $FailureTimes.Clear()
    }
    $FailureTimes.Add([DateTimeOffset]::Now)
    $Decision = Get-WorkForgeTunnelRecoveryDecision `
      -FailureTimes $FailureTimes.ToArray() `
      -Now ([DateTimeOffset]::Now) `
      -WindowSeconds $RecoveryWindowSeconds `
      -MaxRestarts $MaximumRestarts
    $FailureTimes.Clear()
    foreach ($FailureTime in $Decision.RecentFailureTimes) {
      $FailureTimes.Add($FailureTime)
    }

    Remove-Item -LiteralPath $Paths.TunnelPidPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Paths.HealthUrlPath -Force -ErrorAction SilentlyContinue
    if (-not $Decision.RestartAllowed) {
      $FinalState = "exhausted"
      Write-RecoveryState `
        -State "exhausted" `
        -FailureCount $Decision.FailureCount `
        -LastExitCode $ExitCode `
        -Detail "Automatic recovery exhausted after $MaximumRestarts same-profile restarts in $RecoveryWindowSeconds seconds."
      Write-SupervisorLog "Profile $($Profile.Id) exhausted its bounded same-profile restart budget."
      break
    }

    Write-RecoveryState `
      -State "backoff" `
      -FailureCount $Decision.FailureCount `
      -LastExitCode $ExitCode `
      -NextDelaySeconds $Decision.DelaySeconds `
      -Detail "The failed tunnel process will be replaced; MCP commands are never replayed by this supervisor."
    Write-SupervisorLog "Profile $($Profile.Id) tunnel exited with code $ExitCode; retrying the same profile in $($Decision.DelaySeconds) seconds."
    if (-not (Wait-Interruptibly -Seconds $Decision.DelaySeconds)) {
      $FinalState = "stopped"
      break
    }
  }
} catch {
  $FinalState = "faulted"
  Write-RecoveryState -State "faulted" -FailureCount $FailureTimes.Count -Detail $_.Exception.Message
  Write-SupervisorLog "Supervisor faulted for profile $($Profile.Id): $($_.Exception.Message)"
  throw
} finally {
  if ($FinalState -eq "stopped") {
    Write-RecoveryState -State "stopped" -FailureCount $FailureTimes.Count
  }
  if (Test-Path -LiteralPath $Paths.SupervisorPidPath -PathType Leaf) {
    $RecordedPid = (Get-Content -Raw -LiteralPath $Paths.SupervisorPidPath).Trim()
    if ($RecordedPid -ceq [string]$PID) {
      Remove-Item -LiteralPath $Paths.SupervisorPidPath -Force -ErrorAction SilentlyContinue
    }
  }
  Write-SupervisorLog "Supervisor stopped for profile $($Profile.Id) with state $FinalState."
}
