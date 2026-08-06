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

Write-Output "RECOVERY_POLICY_TEST_OK"
