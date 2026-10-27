$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-registry.ps1")

$Now = [DateTimeOffset]::Now
$Cases = @(
  @{ Failures = @(); Allowed = $true; Exhausted = $false; Delay = 0 },
  @{ Failures = @($Now.AddSeconds(-1)); Allowed = $true; Exhausted = $false; Delay = 2 },
  @{ Failures = @($Now.AddSeconds(-2), $Now.AddSeconds(-1)); Allowed = $true; Exhausted = $false; Delay = 10 },
  @{ Failures = @($Now.AddSeconds(-3), $Now.AddSeconds(-2), $Now.AddSeconds(-1)); Allowed = $true; Exhausted = $false; Delay = 30 },
  @{ Failures = @($Now.AddSeconds(-4), $Now.AddSeconds(-3), $Now.AddSeconds(-2), $Now.AddSeconds(-1)); Allowed = $false; Exhausted = $true; Delay = $null }
)

foreach ($Case in $Cases) {
  $Decision = Get-WorkForgeTunnelRecoveryDecision -FailureTimes $Case.Failures -Now $Now
  if ($Decision.RestartAllowed -ne $Case.Allowed) { throw "Unexpected RestartAllowed result." }
  if ($Decision.Exhausted -ne $Case.Exhausted) { throw "Unexpected Exhausted result." }
  if ($Decision.DelaySeconds -ne $Case.Delay) { throw "Unexpected recovery delay result." }
}

$Expired = Get-WorkForgeTunnelRecoveryDecision -FailureTimes @($Now.AddMinutes(-10)) -Now $Now
if (-not $Expired.RestartAllowed -or $Expired.FailureCount -ne 0 -or $Expired.DelaySeconds -ne 0) {
  throw "Expired recovery failures were not discarded."
}

$EmptyOptions = @(Get-WorkForgeCommandLineOptionValues -CommandLine "" -OptionName "--profile-file")
if ($EmptyOptions.Count -ne 0) {
  throw "Empty process command lines must produce no parsed option values."
}

$RetryState = [pscustomobject]@{ Count = 0 }
$RetryLookup = {
  param([int]$LookupProcessId)
  $RetryState.Count += 1
  if ($RetryState.Count -eq 1) {
    return [pscustomobject]@{ ProcessId = $LookupProcessId; ExecutablePath = "C:\\fake.exe"; CommandLine = $null }
  }
  return [pscustomobject]@{ ProcessId = $LookupProcessId; ExecutablePath = "C:\\fake.exe"; CommandLine = '"C:\\fake.exe" --profile-file "C:\\profile.yaml"' }
}.GetNewClosure()
$RecoveredProcess = Get-WorkForgeProcessForVerification -TargetProcessId 4242 -ProcessLookup $RetryLookup -Attempts 3 -DelayMilliseconds 0
if ($RetryState.Count -ne 2 -or [string]::IsNullOrWhiteSpace([string]$RecoveredProcess.CommandLine)) {
  throw "Transient empty process metadata was not retried."
}

$PersistentState = [pscustomobject]@{ Count = 0 }
$PersistentLookup = {
  param([int]$LookupProcessId)
  $PersistentState.Count += 1
  return [pscustomobject]@{ ProcessId = $LookupProcessId; ExecutablePath = "C:\\fake.exe"; CommandLine = "" }
}.GetNewClosure()
$PersistentProcess = Get-WorkForgeProcessForVerification -TargetProcessId 5252 -ProcessLookup $PersistentLookup -Attempts 3 -DelayMilliseconds 0
if ($PersistentState.Count -ne 3 -or -not [string]::IsNullOrWhiteSpace([string]$PersistentProcess.CommandLine)) {
  throw "Persistent empty process metadata did not exhaust the bounded retry window."
}

$PidFixtureRoot = Join-Path $env:TEMP ("workforge-pid-test-" + [guid]::NewGuid().ToString("N"))
$Child = $null
try {
  New-Item -ItemType Directory -Path $PidFixtureRoot | Out-Null
  $PidFile = Join-Path $PidFixtureRoot "fixture.pid"
  $Child = Start-Process -FilePath (Get-WorkForgePowerShellExecutablePath) -ArgumentList @('-NoProfile', '-Command', 'Start-Sleep -Seconds 30') -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath $PidFile -Value $Child.Id -Encoding ascii
  $Profile = [pscustomobject]@{ Id = 'fixture'; TunnelConfigPath = (Join-Path $PidFixtureRoot 'fixture.yaml') }
  (Get-Item -LiteralPath $PidFile).LastWriteTimeUtc = [DateTime]::UtcNow.AddHours(-1)
  if (Get-WorkForgeVerifiedTunnelProcess -Profile $Profile -RecordedPidPath $PidFile -ExecutablePath 'C:\fixture.exe') { throw 'Stale tunnel PID was accepted.' }
  if (Get-WorkForgeVerifiedTunnelSupervisorProcess -Profile $Profile -RecordedPidPath $PidFile) { throw 'Stale supervisor PID was accepted.' }
  (Get-Item -LiteralPath $PidFile).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(1)
  foreach ($Kind in @('tunnel', 'supervisor')) {
    $Failed = $false
    try {
      if ($Kind -eq 'tunnel') { $null = Get-WorkForgeVerifiedTunnelProcess -Profile $Profile -RecordedPidPath $PidFile -ExecutablePath 'C:\fixture.exe' }
      else { $null = Get-WorkForgeVerifiedTunnelSupervisorProcess -Profile $Profile -RecordedPidPath $PidFile }
    } catch { $Failed = $_.Exception.Message -match 'does not match' }
    if (-not $Failed) { throw "Current $Kind PID identity mismatch was not rejected." }
  }
} finally {
  if ($Child -and -not $Child.HasExited) { Stop-Process -Id $Child.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $PidFixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "RECOVERY_POLICY_TEST_OK"
