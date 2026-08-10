[CmdletBinding()]
param(
  [string]$TunnelId,
  [string]$ProfileId = "workstation",
  [switch]$SkipDoctor,
  [switch]$RebindRuntime
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "profile-registry.ps1")

# Validate the selected profile and exact runtime before touching local state.
$Profile = Get-WorkForgeProfile -ProfileId $ProfileId
$TunnelExecutable = Get-WorkForgeTunnelExecutablePath
$StdioRuntime = Get-WorkForgeStdioRuntime

if ($RebindRuntime) {
  $ExistingConfig = Assert-WorkForgeRegularFile -Path $Profile.TunnelConfigPath -MaximumBytes 1048576 -Description "Tunnel config for workforge profile $ProfileId"
  $ConfigText = [IO.File]::ReadAllText($ExistingConfig.FullName, [Text.UTF8Encoding]::new($false, $true))
  $TunnelIds = @([regex]::Matches($ConfigText, '\btunnel_[a-f0-9]{32}\b', [Text.RegularExpressions.RegexOptions]::IgnoreCase) | ForEach-Object { $_.Value.ToLowerInvariant() } | Sort-Object -Unique)
  if ($TunnelIds.Count -ne 1) {
    throw "Existing tunnel configuration must contain exactly one tunnel_id before runtime rebinding."
  }
  $TunnelId = $TunnelIds[0]
  $null = Initialize-WorkForgeControlPlaneCredential
} else {
  if ([string]::IsNullOrWhiteSpace($TunnelId)) { $TunnelId = Read-Host "OpenAI tunnel_id" }
}
if ($TunnelId -cnotmatch '^tunnel_[a-f0-9]{32}$') { throw "tunnel_id is invalid." }

$McpNodePath = $StdioRuntime.NodePath.Replace("\", "/")
$McpStdioPath = $StdioRuntime.StdioPath.Replace("\", "/")
$McpCommand = ('"{0}" "{1}" --profile {2}' -f $McpNodePath, $McpStdioPath, $ProfileId)
$RunsRoot = Get-WorkForgeRunsRoot
New-Item -ItemType Directory -Path $RunsRoot -Force | Out-Null
$CredentialPath = Join-Path $RunsRoot ".env.local"

if (-not $RebindRuntime) {
  $CredentialExists = Test-Path -LiteralPath $CredentialPath
  if ($CredentialExists) {
    $null = Assert-WorkForgePathHasNoReparsePoint -Path $CredentialPath -Description "Local tunnel credential"
    $null = Assert-WorkForgeRegularFile -Path $CredentialPath -MaximumBytes 8192 -Description "Local tunnel credential"
    Assert-WorkForgeRestrictedCredentialAcl -Path $CredentialPath
  }
  $ExistingKey = [Environment]::GetEnvironmentVariable("CONTROL_PLANE_API_KEY", "Process")
  $SecureKey = if ([string]::IsNullOrWhiteSpace($ExistingKey)) { Read-Host "Runtime CONTROL_PLANE_API_KEY" -AsSecureString } else { $null }
  $Bstr = if ($SecureKey) { [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey) } else { [IntPtr]::Zero }
  try {
    $PlainKey = if ($SecureKey) { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr) } else { $ExistingKey }
    Assert-WorkForgeControlPlaneKeyValue -Value $PlainKey
    if (-not $CredentialExists) {
      New-WorkForgeRestrictedCredentialFile -Path $CredentialPath
    }
    [IO.File]::WriteAllText($CredentialPath, "CONTROL_PLANE_API_KEY=$PlainKey", [Text.UTF8Encoding]::new($false))
    Assert-WorkForgeRestrictedCredentialAcl -Path $CredentialPath
  } finally {
    if ($Bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
    Remove-Variable PlainKey -ErrorAction SilentlyContinue
  }
}

$BuildDirectory = Join-Path (Get-WorkForgeRunsRoot) ("tunnel-profile-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $BuildDirectory -Force | Out-Null
try {
  & $TunnelExecutable init --sample sample_mcp_stdio_local --profile $ProfileId --profile-dir $BuildDirectory --tunnel-id $TunnelId --mcp-command $McpCommand --health-listen-addr "127.0.0.1:0" --force
  if ($LASTEXITCODE -ne 0) { throw "tunnel-client init failed." }
  $Generated = @(Get-ChildItem -LiteralPath $BuildDirectory -File -Filter "*.yaml")
  if ($Generated.Count -ne 1) { throw "Expected exactly one generated tunnel profile." }
  Copy-Item -LiteralPath $Generated[0].FullName -Destination $Profile.TunnelConfigPath -Force
} finally {
  if (Test-Path -LiteralPath $BuildDirectory) { Remove-Item -LiteralPath $BuildDirectory -Recurse -Force }
}

$null = Initialize-WorkForgeControlPlaneCredential
if (-not $SkipDoctor) {
  & $TunnelExecutable doctor --profile-file $Profile.TunnelConfigPath --explain
  if ($LASTEXITCODE -ne 0) { throw "tunnel-client doctor failed." }
}
$Verb = if ($RebindRuntime) { "rebound" } else { "configured" }
Write-Output "Tunnel $Verb for profile $ProfileId. It remains stopped until you start it manually."
