[CmdletBinding()]
param([string]$ProfileId = "workstation")

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")

if ($ProfileId -cnotmatch '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$') {
  throw "ProfileId is invalid."
}
$Runtime = Resolve-WorkForgePortableEngine
[Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", (Join-Path $Runtime.StateRoot "profile_registry.json"), "Process")
[Environment]::SetEnvironmentVariable("WORKFORGE_RIPGREP_PATH", $Runtime.RipgrepPath, "Process")
[Environment]::SetEnvironmentVariable("CONTROL_PLANE_API_KEY", $null, "Process")
& $Runtime.NodePath $Runtime.StdioPath --profile $ProfileId
exit $LASTEXITCODE
