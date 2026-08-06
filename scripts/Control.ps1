[CmdletBinding()]
param(
  [ValidateSet("menu", "start", "stop", "status", "doctor")]
  [string]$Action = "menu",

  [string]$ProfileId = "workstation",

  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "profile-registry.ps1")

function Invoke-ControlAction {
  param([Parameter(Mandatory = $true)][string]$Selected)

  switch ($Selected) {
    "start" { & (Join-Path $PSScriptRoot "start-tunnel.ps1") -ProfileId $ProfileId }
    "stop" { & (Join-Path $PSScriptRoot "stop-tunnel.ps1") -ProfileId $ProfileId }
    "status" { & (Join-Path $PSScriptRoot "tunnel-status.ps1") -ProfileId $ProfileId -Snapshot }
    "doctor" { & (Join-Path $PSScriptRoot "Doctor.ps1") -ProfileId $ProfileId -Online }
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

  Write-Host ""
  Write-Host "Action failed: $Selected" -ForegroundColor Red
  Write-Host $ErrorRecord.Exception.Message -ForegroundColor Yellow
  $LogDirectory = Get-ControlLogDirectory
  if ($LogDirectory) {
    Write-Host "Logs: $LogDirectory"
  } else {
    Write-Host "Logs: unavailable until the selected profile can be resolved."
  }
  Write-Host "Run Doctor from this menu after correcting the reported problem."
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
  Write-Host ""
  Write-Host "WorkForge" -ForegroundColor Cyan
  Write-Host "1. Start"
  Write-Host "2. Status"
  Write-Host "3. Stop"
  Write-Host "4. Doctor"
  Write-Host "0. Exit"
  $Choice = Read-Host "Select"
  $Selected = switch ($Choice) {
    "1" { "start" }
    "2" { "status" }
    "3" { "stop" }
    "4" { "doctor" }
    "0" { "exit" }
    default { $null }
  }

  if ($Selected -eq "exit") { break }
  if (-not $Selected) {
    Write-Host "Unknown selection." -ForegroundColor Yellow
    Wait-ControlInput
    continue
  }

  try {
    Invoke-ControlAction -Selected $Selected
  } catch {
    Write-ControlFailure -Selected $Selected -ErrorRecord $_
  }
  Wait-ControlInput
}
