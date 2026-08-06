[CmdletBinding()]
param(
  [string]$ProfileId = "workstation",
  [switch]$Online
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-registry.ps1")
$Profile = Get-WorkForgeProfile -ProfileId $ProfileId -RequireTunnelConfig
$TunnelExecutable = Get-WorkForgeTunnelExecutablePath
$Stdio = Get-WorkForgeStdioRuntime
$Credential = Initialize-WorkForgeControlPlaneCredential
& (Join-Path $PSScriptRoot "start-tunnel.ps1") -ProfileId $ProfileId -ValidateOnly
if ($Online) {
  & $TunnelExecutable doctor --profile-file $Profile.TunnelConfigPath --explain
  if ($LASTEXITCODE -ne 0) { throw "Online tunnel-client doctor failed." }
}
[pscustomobject]@{
  ok = $true
  profileId = $Profile.Id
  profileRoot = $Profile.RepoRoot
  node = $Stdio.NodePath
  tunnelClient = $TunnelExecutable
  credentialSource = $Credential.Source
  onlineDoctor = [bool]$Online
} | ConvertTo-Json -Depth 4
