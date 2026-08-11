Set-StrictMode -Version 3.0

function Get-WorkForgeTunnelExecutablePath {
  if ($null -ne $script:WorkForgePortableRuntime) {
    return $script:WorkForgePortableRuntime.TunnelClientPath
  }
  $Path = Join-Path (Get-WorkForgeRunsRoot) "tunnel-client\v0.0.10\tunnel-client.exe"
  $Item = Assert-WorkForgeRegularFile -Path $Path -MaximumBytes 268435456 -Description "Verified tunnel-client v0.0.10"
  $ExpectedHash = "D893D8127EEE35070D265C1BE29BFE008F8D9FCB476E7FEBF56C8FDC6C0615C8"
  $ObservedHash = Get-WorkForgeProfileFileSha256 -Path $Item.FullName
  if (-not $ObservedHash.Equals($ExpectedHash, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Shared tunnel-client v0.0.10 failed its pinned SHA-256 check."
  }
  return $Item.FullName
}

function Get-WorkForgeCommandLineOptionValues {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$CommandLine,

    [Parameter(Mandatory = $true)]
    [string]$OptionName
  )

  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return @() }

  $Pattern = '(?:^|\s)' + [regex]::Escape($OptionName) + '(?:\s+|=)(?:"([^"]+)"|([^\s"]+))'
  return @(
    foreach ($Match in [regex]::Matches($CommandLine, $Pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      if ($Match.Groups[1].Success) {
        $Match.Groups[1].Value
      } else {
        $Match.Groups[2].Value
      }
    }
  )
}

function Get-WorkForgeProcessForVerification {
  param(
    [Parameter(Mandatory = $true)]
    [int]$TargetProcessId,

    [scriptblock]$ProcessLookup,

    [ValidateRange(1, 10)]
    [int]$Attempts = 4,

    [ValidateRange(0, 1000)]
    [int]$DelayMilliseconds = 75
  )

  if ($null -eq $ProcessLookup) {
    $ProcessLookup = {
      param([int]$LookupProcessId)
      Get-CimInstance Win32_Process -Filter "ProcessId = $LookupProcessId" -ErrorAction SilentlyContinue
    }
  }

  $LastProcess = $null
  for ($Attempt = 1; $Attempt -le $Attempts; $Attempt += 1) {
    $LastProcess = & $ProcessLookup $TargetProcessId
    if (-not $LastProcess) { return $null }

    $Executable = [string]$LastProcess.ExecutablePath
    $CommandLine = [string]$LastProcess.CommandLine
    if (-not [string]::IsNullOrWhiteSpace($Executable) -and -not [string]::IsNullOrWhiteSpace($CommandLine)) {
      return $LastProcess
    }

    if ($Attempt -lt $Attempts -and $DelayMilliseconds -gt 0) {
      Start-Sleep -Milliseconds $DelayMilliseconds
    }
  }
  return $LastProcess
}

function Get-WorkForgeTunnelRuntimePaths {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Profile
  )

  $RuntimeRoot = Join-Path $Profile.RuntimeRoot "tunnel"
  return [pscustomobject]@{
    RuntimeRoot = $RuntimeRoot
    TunnelPidPath = Join-Path $RuntimeRoot "tunnel.pid"
    SupervisorPidPath = Join-Path $RuntimeRoot "supervisor.pid"
    HealthUrlPath = Join-Path $RuntimeRoot "health.url"
    DesiredRunningPath = Join-Path $RuntimeRoot "desired.running"
    StopRequestPath = Join-Path $RuntimeRoot "stop.requested"
    RecoveryStatePath = Join-Path $RuntimeRoot "recovery.json"
    TunnelProcessStdoutPath = Join-Path $RuntimeRoot "tunnel.process.stdout.log"
    TunnelStderrPath = Join-Path $RuntimeRoot "tunnel.stderr.log"
    TunnelLogPath = Join-Path $RuntimeRoot "tunnel.log"
    SupervisorStdoutPath = Join-Path $RuntimeRoot "supervisor.process.stdout.log"
    SupervisorStderrPath = Join-Path $RuntimeRoot "supervisor.process.stderr.log"
    SupervisorStdinPath = Join-Path $RuntimeRoot "supervisor.process.stdin"
    SupervisorLogPath = Join-Path $RuntimeRoot "supervisor.log"
  }
}

function Get-WorkForgeTunnelSupervisorScriptPath {
  return (Join-Path $PSScriptRoot "tunnel-supervisor.ps1")
}

function Get-WorkForgePowerShellExecutablePath {
  $Path = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  return (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
}

function Enter-WorkForgeTunnelOperationLock {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProfileId,

    [int]$TimeoutSeconds = 30
  )

  if ($ProfileId -cnotmatch "^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$" -or $ProfileId.Length -gt 32) {
    throw "Requested workforge profile id is invalid."
  }
  if ($TimeoutSeconds -lt 1 -or $TimeoutSeconds -gt 300) {
    throw "Tunnel operation-lock timeout is outside its bounded range."
  }

  $Mutex = [Threading.Mutex]::new($false, "Local\WorkForgeMcp-Tunnel-$ProfileId")
  $Acquired = $false
  try {
    try {
      $Acquired = $Mutex.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds))
    } catch [Threading.AbandonedMutexException] {
      $Acquired = $true
    }
    if (-not $Acquired) {
      throw "Timed out waiting for the tunnel operation lock for profile $ProfileId."
    }
    return [pscustomobject]@{ Mutex = $Mutex; Acquired = $true }
  } catch {
    $Mutex.Dispose()
    throw
  }
}

function Exit-WorkForgeTunnelOperationLock {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Lock
  )

  if ($Lock.Acquired) {
    $Lock.Mutex.ReleaseMutex()
  }
  $Lock.Mutex.Dispose()
}

function Stop-WorkForgeProcessTree {
  param(
    [Parameter(Mandatory = $true)]
    [int]$TargetProcessId
  )

  $TaskkillPath = Join-Path $env:SystemRoot "System32\taskkill.exe"
  if (Test-Path -LiteralPath $TaskkillPath -PathType Leaf) {
    $StopProcess = Start-Process `
      -FilePath $TaskkillPath `
      -ArgumentList @("/PID", [string]$TargetProcessId, "/T", "/F") `
      -WindowStyle Hidden `
      -Wait `
      -PassThru
    if ($StopProcess.ExitCode -ne 0 -and (Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue)) {
      throw "Failed to stop process tree rooted at PID $TargetProcessId (taskkill exit $($StopProcess.ExitCode))."
    }
  } else {
    Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Get-WorkForgeVerifiedTunnelProcess {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Profile,

    [Parameter(Mandatory = $true)]
    [string]$RecordedPidPath,

    [string]$ExecutablePath = (Get-WorkForgeTunnelExecutablePath)
  )

  if (-not (Test-Path -LiteralPath $RecordedPidPath -PathType Leaf)) {
    return $null
  }
  $PidText = (Get-Content -Raw -LiteralPath $RecordedPidPath).Trim()
  if ($PidText -notmatch "^[0-9]+$") {
    throw "Refusing to use an invalid tunnel PID file for profile $($Profile.Id)."
  }

  $TunnelPid = [int]$PidText
  $Process = Get-WorkForgeProcessForVerification -TargetProcessId $TunnelPid
  if (-not $Process) {
    return $null
  }

  $ObservedExecutableText = [string]$Process.ExecutablePath
  $ObservedCommandLineText = [string]$Process.CommandLine
  if ([string]::IsNullOrWhiteSpace($ObservedExecutableText) -or [string]::IsNullOrWhiteSpace($ObservedCommandLineText)) {
    throw "PID $TunnelPid could not be verified because Windows did not expose complete process identity metadata."
  }

  $ObservedExecutable = $ObservedExecutableText.ToLowerInvariant()
  $ExpectedExecutable = $ExecutablePath.ToLowerInvariant()
  $CommandLine = $ObservedCommandLineText.Replace("/", "\")
  $ObservedProfileFiles = @(Get-WorkForgeCommandLineOptionValues -CommandLine $CommandLine -OptionName "--profile-file")
  $ObservedPidFiles = @(Get-WorkForgeCommandLineOptionValues -CommandLine $CommandLine -OptionName "--pid.file")
  if (
    $ObservedExecutable -ne $ExpectedExecutable -or
    $ObservedProfileFiles.Count -ne 1 -or
    -not $ObservedProfileFiles[0].Equals($Profile.TunnelConfigPath, [StringComparison]::OrdinalIgnoreCase) -or
    $ObservedPidFiles.Count -ne 1 -or
    -not $ObservedPidFiles[0].Equals($RecordedPidPath, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "PID $TunnelPid does not match tunnel profile $($Profile.Id) and its project-local PID file."
  }
  return $Process
}

function Get-WorkForgeVerifiedTunnelSupervisorProcess {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Profile,

    [Parameter(Mandatory = $true)]
    [string]$RecordedPidPath
  )

  if (-not (Test-Path -LiteralPath $RecordedPidPath -PathType Leaf)) {
    return $null
  }
  $PidText = (Get-Content -Raw -LiteralPath $RecordedPidPath).Trim()
  if ($PidText -notmatch "^[0-9]+$") {
    throw "Refusing to use an invalid tunnel supervisor PID file for profile $($Profile.Id)."
  }

  $SupervisorPid = [int]$PidText
  $Process = Get-WorkForgeProcessForVerification -TargetProcessId $SupervisorPid
  if (-not $Process) {
    return $null
  }

  $ObservedExecutableText = [string]$Process.ExecutablePath
  $ObservedCommandLineText = [string]$Process.CommandLine
  if ([string]::IsNullOrWhiteSpace($ObservedExecutableText) -or [string]::IsNullOrWhiteSpace($ObservedCommandLineText)) {
    throw "PID $SupervisorPid could not be verified because Windows did not expose complete supervisor identity metadata."
  }

  $ObservedExecutable = $ObservedExecutableText.ToLowerInvariant()
  $ExpectedExecutable = (Get-WorkForgePowerShellExecutablePath).ToLowerInvariant()
  $CommandLine = $ObservedCommandLineText.Replace("/", "\")
  $ExpectedScript = (Get-WorkForgeTunnelSupervisorScriptPath)
  $ObservedScripts = @(Get-WorkForgeCommandLineOptionValues -CommandLine $CommandLine -OptionName "-File")
  $ObservedProfiles = @(Get-WorkForgeCommandLineOptionValues -CommandLine $CommandLine -OptionName "-ProfileId")
  if (
    $ObservedExecutable -ne $ExpectedExecutable -or
    $ObservedScripts.Count -ne 1 -or
    -not $ObservedScripts[0].Equals($ExpectedScript, [StringComparison]::OrdinalIgnoreCase) -or
    $ObservedProfiles.Count -ne 1 -or
    $ObservedProfiles[0] -cne $Profile.Id
  ) {
    throw "PID $SupervisorPid does not match the tunnel supervisor for profile $($Profile.Id)."
  }
  return $Process
}

function Read-WorkForgeHealthBaseUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$ProfileId
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Tunnel profile $ProfileId health URL file is missing."
  }
  $RawUrl = (Get-Content -Raw -LiteralPath $Path).Trim()
  $ParsedUrl = $null
  if (-not [Uri]::TryCreate($RawUrl, [UriKind]::Absolute, [ref]$ParsedUrl)) {
    throw "Tunnel profile $ProfileId wrote an invalid health URL."
  }
  if ($ParsedUrl.Scheme -ne "http" -or $ParsedUrl.Host -ne "127.0.0.1") {
    throw "Tunnel profile $ProfileId health URL is not loopback HTTP."
  }
  return $ParsedUrl.AbsoluteUri.TrimEnd("/")
}

function Read-WorkForgeTunnelRecoveryState {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }
  return (Read-WorkForgeUtf8Json -Path $Path -MaximumBytes 65536 -Description "Tunnel recovery state").Value
}

function Get-WorkForgeTunnelRecoveryDecision {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [DateTimeOffset[]]$FailureTimes,

    [Parameter(Mandatory = $true)]
    [DateTimeOffset]$Now,

    [int]$WindowSeconds = 300,

    [int]$MaxRestarts = 3
  )

  if ($WindowSeconds -lt 30 -or $WindowSeconds -gt 86400) {
    throw "Tunnel recovery window is outside its bounded range."
  }
  if ($MaxRestarts -lt 1 -or $MaxRestarts -gt 10) {
    throw "Tunnel recovery restart count is outside its bounded range."
  }

  $Cutoff = $Now.AddSeconds(-$WindowSeconds)
  $RecentFailures = @($FailureTimes | Where-Object { $_ -ge $Cutoff -and $_ -le $Now.AddMinutes(1) })
  $FailureCount = $RecentFailures.Count
  if ($FailureCount -gt $MaxRestarts) {
    return [pscustomobject]@{
      RestartAllowed = $false
      Exhausted = $true
      DelaySeconds = $null
      FailureCount = $FailureCount
      RecentFailureTimes = $RecentFailures
    }
  }

  $Delays = @(2, 10, 30)
  $DelayIndex = [Math]::Max(0, [Math]::Min($FailureCount - 1, $Delays.Count - 1))
  return [pscustomobject]@{
    RestartAllowed = $true
    Exhausted = $false
    DelaySeconds = if ($FailureCount -eq 0) { 0 } else { $Delays[$DelayIndex] }
    FailureCount = $FailureCount
    RecentFailureTimes = $RecentFailures
  }
}
