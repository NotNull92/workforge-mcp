[CmdletBinding()]
param(
  [ValidateSet("menu", "start", "stop", "status", "doctor", "uninstall")]
  [string]$Action = "menu",

  [string]$ProfileId = "workstation",

  [switch]$NoPause,

  [switch]$Plain,

  [switch]$NoLog
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$Package = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "package.json") | ConvertFrom-Json -ErrorAction Stop
$Version = [string]$Package.version
. (Join-Path $PSScriptRoot "WorkForge.UI.ps1")
. (Join-Path $PSScriptRoot "profile-registry.ps1")
$Ui = Initialize-WorkForgeUi -Operation "control" -Version $Version -ToolRoot $ToolRoot -Plain:$Plain -NoLog:$NoLog

function Invoke-ControlAction {
  param([Parameter(Mandatory = $true)][string]$Selected)

  switch ($Selected) {
    "start" { & (Join-Path $PSScriptRoot "start-tunnel.ps1") -ProfileId $ProfileId }
    "stop" { & (Join-Path $PSScriptRoot "stop-tunnel.ps1") -ProfileId $ProfileId }
    "status" { & (Join-Path $PSScriptRoot "tunnel-status.ps1") -ProfileId $ProfileId -Snapshot }
    "doctor" { & (Join-Path $PSScriptRoot "Doctor.ps1") -ProfileId $ProfileId -Online }
    "uninstall" { & (Join-Path $PSScriptRoot "Uninstall.ps1") -Mode Prompt -ProfileId $ProfileId -Embedded -Plain:$Plain -NoLog:$NoLog }
    default { throw "Unsupported control action: $Selected" }
  }
}

function Get-ControlLogDirectory {
  try {
    $Profile = Get-WorkForgeProfile -ProfileId $ProfileId
    return (Get-WorkForgeTunnelRuntimePaths -Profile $Profile).RuntimeRoot
  } catch {
    return $null
  }
}

function Write-ControlFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Selected,
    [Parameter(Mandatory = $true)][Management.Automation.ErrorRecord]$ErrorRecord
  )

  $LogDirectory = Get-ControlLogDirectory
  $Fix = if ($Selected -eq "uninstall") {
    "Review the uninstall target and retry from Uninstall.cmd."
  } else {
    "Run Doctor after correcting the reported problem."
  }
  $Reason = $ErrorRecord.Exception.Message
  if ($LogDirectory) { $Reason = "$Reason Logs: $LogDirectory" }
  Write-WorkForgeErrorPanel -Title ("ACTION FAILED: {0}" -f $Selected.ToUpperInvariant()) -Reason $Reason -Stage $Selected -Fix $Fix
}

function Wait-ControlInput {
  if (-not $NoPause -and $Host.Name -match "ConsoleHost") {
    Read-Host "Press Enter to continue" | Out-Null
  }
}

if ($Action -ne "menu") {
  try {
    Invoke-ControlAction -Selected $Action
    exit 0
  } catch {
    Write-ControlFailure -Selected $Action -ErrorRecord $_
    exit 1
  }
}

while ($true) {
  Write-WorkForgeLine
  Write-WorkForgePanel -Title "WORKFORGE CONTROL" -Lines @(
    "1. Start       Open the secure tunnel",
    "2. Status      Inspect health and readiness",
    "3. Stop        Close tunnel and supervisor",
    "4. Doctor      Validate local and online state",
    "5. Uninstall   Remove WorkForge safely",
    "0. Exit"
  ) -Tone "primary"
  $Choice = Read-Host "Select"
  $Selected = switch ($Choice) {
    "1" { "start" }
    "2" { "status" }
    "3" { "stop" }
    "4" { "doctor" }
    "5" { "uninstall" }
    "0" { "exit" }
    default { $null }
  }

  if ($Selected -eq "exit") { break }
  if (-not $Selected) {
    Write-WorkForgeNotice -Level "warning" -Message "Unknown selection."
    Wait-ControlInput
    continue
  }

  try {
    Invoke-ControlAction -Selected $Selected
    if ($Selected -eq "uninstall") { break }
  } catch {
    Write-ControlFailure -Selected $Selected -ErrorRecord $_
  }
  Wait-ControlInput
}
