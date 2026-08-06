[CmdletBinding()]
param(
  [string]$TunnelId,
  [string]$ProfileId = "workstation",
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "profile-registry.ps1")

if ([string]::IsNullOrWhiteSpace($TunnelId)) { $TunnelId = Read-Host "OpenAI tunnel_id" }
if ($TunnelId -cnotmatch '^tunnel_[a-f0-9]{32}$') { throw "tunnel_id is invalid." }
$ExistingKey = [Environment]::GetEnvironmentVariable("CONTROL_PLANE_API_KEY", "Process")
$SecureKey = if ([string]::IsNullOrWhiteSpace($ExistingKey)) { Read-Host "Runtime CONTROL_PLANE_API_KEY" -AsSecureString } else { $null }
$Bstr = if ($SecureKey) { [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey) } else { [IntPtr]::Zero }
try {
  $PlainKey = if ($SecureKey) { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr) } else { $ExistingKey }
  Assert-WorkForgeControlPlaneKeyValue -Value $PlainKey
  $RunsRoot = Get-WorkForgeRunsRoot
  New-Item -ItemType Directory -Path $RunsRoot -Force | Out-Null
  $CredentialPath = Join-Path $RunsRoot ".env.local"
  [IO.File]::WriteAllText($CredentialPath, "CONTROL_PLANE_API_KEY=$PlainKey", [Text.UTF8Encoding]::new($false))
  $Acl = [Security.AccessControl.FileSecurity]::new()
  $CurrentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $Acl.SetOwner($CurrentSid)
  $Acl.SetAccessRuleProtection($true, $false)
  foreach ($Sid in @($CurrentSid, [Security.Principal.SecurityIdentifier]::new("S-1-5-18"), [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544"))) {
    $Rule = [Security.AccessControl.FileSystemAccessRule]::new($Sid, [Security.AccessControl.FileSystemRights]::FullControl, [Security.AccessControl.AccessControlType]::Allow)
    $null = $Acl.AddAccessRule($Rule)
  }
  Set-Acl -LiteralPath $CredentialPath -AclObject $Acl
} finally {
  if ($Bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
  Remove-Variable PlainKey -ErrorAction SilentlyContinue
}

$Profile = Get-WorkForgeProfile -ProfileId $ProfileId
$TunnelExecutable = Get-WorkForgeTunnelExecutablePath
$BuildDirectory = Join-Path (Get-WorkForgeRunsRoot) ("tunnel-profile-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $BuildDirectory -Force | Out-Null
try {
  & $TunnelExecutable init --sample sample_mcp_stdio_local --profile $ProfileId --profile-dir $BuildDirectory --tunnel-id $TunnelId --mcp-command "node.exe dist/stdio.js --profile $ProfileId" --health-listen-addr "127.0.0.1:0" --force
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
Write-Output "Tunnel configured for profile $ProfileId. It remains stopped until you start it manually."
