[CmdletBinding()]
param(
  [string]$ProfileId = "workstation",
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$ServerPath = Join-Path $PSScriptRoot "control-server.mjs"
if (-not (Test-Path -LiteralPath $ServerPath -PathType Leaf)) {
  throw "WorkForge Control server is missing: $ServerPath"
}
if ($ProfileId -cnotmatch '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$') {
  throw "ProfileId is invalid."
}

$Node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Node) {
  throw "Node.js is not available. Run Setup.cmd first, or use scripts\Control.ps1 as the CLI fallback."
}

$ArgumentList = @(
  ('"{0}"' -f $ServerPath),
  '--profile',
  $ProfileId
)
if ($NoBrowser) { $ArgumentList += '--no-browser' }

$Process = Start-Process `
  -FilePath $Node.Source `
  -ArgumentList ($ArgumentList -join ' ') `
  -WorkingDirectory ([IO.Path]::GetTempPath()) `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Milliseconds 700
if ($Process.HasExited) {
  throw "WorkForge Control dashboard could not start. Use scripts\Control.ps1 for diagnostics."
}

Write-Output "WorkForge Control dashboard launched."
