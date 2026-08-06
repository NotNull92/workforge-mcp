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
$SupervisorPath = Get-WorkForgeTunnelSupervisorScriptPath
$PowerShellPath = Get-WorkForgePowerShellExecutablePath

if ($ValidateOnly) {
  [pscustomobject]@{
    ok = $true
    profileId = $Profile.Id
    profilePath = $Profile.ProfilePath
    tunnelConfigPath = $Profile.TunnelConfigPath
    tunnelExecutablePath = $ExecutablePath
    supervisorPath = $SupervisorPath
    registryPath = $Profile.RegistryPath
    runtimeDirectory = $Paths.RuntimeRoot
    tunnelPidPath = $Paths.TunnelPidPath
    supervisorPidPath = $Paths.SupervisorPidPath
    stopRequestPath = $Paths.StopRequestPath
    credentialSource = (Initialize-WorkForgeControlPlaneCredential).Source
    nodePath = $StdioRuntime.NodePath
    stdioPath = $StdioRuntime.StdioPath
    runtimeDependencies = @($StdioRuntime.Dependencies)
  } | ConvertTo-Json -Depth 4
  return
}

if (-not (Test-Path -LiteralPath $SupervisorPath -PathType Leaf)) {
  throw "Tunnel supervisor script is missing: $SupervisorPath"
}

New-Item -ItemType Directory -Force -Path $Paths.RuntimeRoot | Out-Null
$null = Initialize-WorkForgeControlPlaneCredential
$OperationLock = Enter-WorkForgeTunnelOperationLock -ProfileId $Profile.Id
$SupervisorProcess = $null
$RunIntentWritten = $false
try {
  if (Test-Path -LiteralPath $Paths.SupervisorPidPath -PathType Leaf) {
    $ExistingSupervisor = Get-WorkForgeVerifiedTunnelSupervisorProcess `
      -Profile $Profile `
      -RecordedPidPath $Paths.SupervisorPidPath
    if ($ExistingSupervisor) {
      throw "Tunnel supervisor for profile $($Profile.Id) is already running as PID $($ExistingSupervisor.ProcessId)."
    }
    Remove-Item -LiteralPath $Paths.SupervisorPidPath -Force
  }

  if (Test-Path -LiteralPath $Paths.TunnelPidPath -PathType Leaf) {
    $ExistingTunnel = Get-WorkForgeVerifiedTunnelProcess `
      -Profile $Profile `
      -RecordedPidPath $Paths.TunnelPidPath `
      -ExecutablePath $ExecutablePath
    if ($ExistingTunnel) {
      throw "Tunnel profile $($Profile.Id) is already running as legacy direct PID $($ExistingTunnel.ProcessId); restart it explicitly to enable supervision."
    }
    Remove-Item -LiteralPath $Paths.TunnelPidPath -Force
  }

  Remove-Item -LiteralPath $Paths.HealthUrlPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Paths.StopRequestPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Paths.RecoveryStatePath -Force -ErrorAction SilentlyContinue
  Set-Content -LiteralPath $Paths.DesiredRunningPath -Value $Profile.Id -Encoding ascii
  [IO.File]::WriteAllBytes($Paths.SupervisorStdinPath, [byte[]]::new(0))
  $RunIntentWritten = $true

  $SupervisorArguments = @(
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$SupervisorPath`"",
    "-ProfileId", $Profile.Id
  )
  $SupervisorProcess = Start-Process `
    -FilePath $PowerShellPath `
    -ArgumentList $SupervisorArguments `
    -WorkingDirectory $ToolRoot `
    -RedirectStandardInput $Paths.SupervisorStdinPath `
    -RedirectStandardOutput $Paths.SupervisorStdoutPath `
    -RedirectStandardError $Paths.SupervisorStderrPath `
    -WindowStyle Hidden `
    -PassThru
} catch {
  if ($RunIntentWritten -and $null -eq $SupervisorProcess) {
    Remove-Item -LiteralPath $Paths.DesiredRunningPath -Force -ErrorAction SilentlyContinue
    Set-Content -LiteralPath $Paths.StopRequestPath -Value $Profile.Id -Encoding ascii
  }
  throw
} finally {
  Exit-WorkForgeTunnelOperationLock -Lock $OperationLock
}

$Ready = $false
$HealthBaseUrl = $null
$LastReadyStatus = "not reached"
$LastReadyDetail = ""
$Deadline = [DateTimeOffset]::Now.AddSeconds(25)
while ([DateTimeOffset]::Now -lt $Deadline) {
  if ($SupervisorProcess.HasExited) {
    $LastReadyDetail = "supervisor exited with code $($SupervisorProcess.ExitCode)"
    break
  }
  try {
    $HealthBaseUrl = Read-WorkForgeHealthBaseUrl -Path $Paths.HealthUrlPath -ProfileId $Profile.Id
    $HealthResponse = Invoke-WebRequest -UseBasicParsing -Uri "$HealthBaseUrl/healthz" -TimeoutSec 2
    $ReadyResponse = Invoke-WebRequest -UseBasicParsing -Uri "$HealthBaseUrl/readyz" -TimeoutSec 2
    $LastReadyStatus = [string]$ReadyResponse.StatusCode
    if ($HealthResponse.StatusCode -eq 200 -and $ReadyResponse.StatusCode -eq 200) {
      $Ready = $true
      break
    }
  } catch {
    $ResponseProperty = $_.Exception.PSObject.Properties["Response"]
    if ($ResponseProperty -and $ResponseProperty.Value) {
      $LastReadyStatus = [string][int]$ResponseProperty.Value.StatusCode
    } else {
      $LastReadyStatus = $_.Exception.GetType().Name
    }
    $LastReadyDetail = $_.Exception.Message
  }
  Start-Sleep -Milliseconds 500
}

if (-not $Ready) {
  Set-Content -LiteralPath $Paths.StopRequestPath -Value $Profile.Id -Encoding ascii
  Remove-Item -LiteralPath $Paths.DesiredRunningPath -Force -ErrorAction SilentlyContinue
  if (-not $SupervisorProcess.HasExited) {
    Stop-WorkForgeProcessTree -TargetProcessId $SupervisorProcess.Id
  }
  Remove-Item -LiteralPath $Paths.SupervisorPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Paths.TunnelPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $Paths.HealthUrlPath -Force -ErrorAction SilentlyContinue
  throw "Tunnel profile $($Profile.Id) did not become ready (last /readyz status: $LastReadyStatus; detail: $LastReadyDetail). See its project-local supervisor and tunnel logs."
}

Write-Output "Secure MCP Tunnel profile $($Profile.Id) started under bounded same-profile supervision."
Write-Output "Admin UI: $HealthBaseUrl/ui"
Write-Output "Supervisor PID: $($SupervisorProcess.Id)"
