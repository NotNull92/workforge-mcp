[CmdletBinding()]
param(
  [string]$ProfileId = "workstation",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
. (Join-Path $PSScriptRoot "profile-registry.ps1")
$ServerPath = Join-Path $PSScriptRoot "control-server.mjs"
if (-not (Test-Path -LiteralPath $ServerPath -PathType Leaf)) {
  throw "WorkForge Control server is missing: $ServerPath"
}
if ($ProfileId -cnotmatch '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$') {
  throw "ProfileId is invalid."
}

$Runtime = Get-WorkForgeStdioRuntime -ToolRoot $ToolRoot
if ($null -ne $script:WorkForgePortableRuntime) {
  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", (Join-Path $script:WorkForgePortableRuntime.StateRoot "profile_registry.json"), "Process")
  [Environment]::SetEnvironmentVariable("WORKFORGE_RIPGREP_PATH", $script:WorkForgePortableRuntime.RipgrepPath, "Process")
}

$ArgumentList = @(
  ('"{0}"' -f $ServerPath),
  '--profile',
  $ProfileId
)
if ($NoBrowser) { $ArgumentList += '--no-browser' }

$Process = Start-Process `
  -FilePath $Runtime.NodePath `
  -ArgumentList ($ArgumentList -join ' ') `
  -WorkingDirectory ([IO.Path]::GetTempPath()) `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Milliseconds 700
if ($Process.HasExited) {
  throw "WorkForge Control dashboard could not start. Use scripts\Control.ps1 for diagnostics."
}

Write-Output "WorkForge Control dashboard launched."
