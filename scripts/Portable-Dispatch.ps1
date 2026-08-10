[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Install", "Configure-Tunnel", "Uninstall")]
  [string]$Action,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ForwardedArguments
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")

$Runtime = Resolve-WorkForgePortableEngine
$Target = switch ($Action) {
  "Install" { Join-Path $Runtime.EngineRoot "scripts\Install.ps1" }
  "Configure-Tunnel" { Join-Path $Runtime.EngineRoot "scripts\Configure-Tunnel.ps1" }
  "Uninstall" { Join-Path $Runtime.EngineRoot "scripts\Uninstall.ps1" }
}

if (-not (Test-Path -LiteralPath $Target -PathType Leaf)) {
  throw "Installed WorkForge action is missing: $Action"
}

if ($Action -ceq "Install") {
  & $Target -Mode Install @ForwardedArguments
} else {
  & $Target @ForwardedArguments
}

exit $(if ($?) { 0 } else { 1 })
