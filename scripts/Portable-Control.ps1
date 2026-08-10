$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")

$Runtime = Resolve-WorkForgePortableEngine
$Arguments = @($args)
$ScriptName = "Launch-Control.ps1"
if ($Arguments.Count -gt 0 -and $Arguments[0] -ceq "--cli") {
  $ScriptName = "Control.ps1"
  $Arguments = @($Arguments | Select-Object -Skip 1)
}
& (Join-Path $Runtime.EngineRoot ("scripts\" + $ScriptName)) @Arguments
$ControlSucceeded = $?
exit $(if ($ControlSucceeded) { 0 } else { 1 })
