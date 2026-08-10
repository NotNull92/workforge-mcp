$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$InstallPath = Join-Path $PSScriptRoot "Install.ps1"
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-multi-profile-" + [guid]::NewGuid().ToString("N"))
$RegistryPath = Join-Path $TestRoot "runtime\profile_registry.json"
$OriginalRegistryEnvironment = [Environment]::GetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", "Process")
$Utf8 = [Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot "profile-registry.ps1")

function Invoke-TestProfileInstall {
  param(
    [Parameter(Mandatory = $true)][string]$ProfileId,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot
  )

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe")
  $StartInfo.Arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$InstallPath`"",
    "-Mode", "Install",
    "-ProfileId", $ProfileId,
    "-DisplayName", "WorkForge $ProfileId",
    "-WorkspaceRoot", "`"$WorkspaceRoot`"",
    "-RegistryPath", "`"$RegistryPath`"",
    "-SkipTunnelDownload",
    "-NoDesktopShortcut",
    "-NonInteractive",
    "-Plain",
    "-NoLog"
  ) -join " "
  $StartInfo.WorkingDirectory = $ToolRoot
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $Process = [Diagnostics.Process]::Start($StartInfo)
  $Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
  $Process.WaitForExit()
  if ($Process.ExitCode -ne 0) {
    throw "Profile $ProfileId install failed: $Output"
  }
}

try {
  $FirstRoot = Join-Path $TestRoot "one"
  $SecondRoot = Join-Path $TestRoot "two"
  Invoke-TestProfileInstall -ProfileId "one" -WorkspaceRoot $FirstRoot
  Invoke-TestProfileInstall -ProfileId "two" -WorkspaceRoot $SecondRoot

  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $RegistryPath, "Process")
  $Registry = Get-WorkForgeRegistry
  if ($Registry.Profiles.Count -ne 2) { throw "Expected two registered profiles." }
  $Ids = @($Registry.Profiles | ForEach-Object { [string]$_.Id } | Sort-Object)
  if (($Ids -join "|") -cne "one|two") { throw "Registered profile ids are incorrect." }
  if (@($Registry.Profiles | Where-Object { $null -ne $_.HttpPort }).Count -ne 0) {
    throw "New profiles unexpectedly retained the deprecated httpPort field."
  }

  # Backward compatibility: older v1 profiles may still contain httpPort. The field is
  # validated when present but no longer participates in profile identity or uniqueness.
  $RegistryJson = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json -ErrorAction Stop
  foreach ($Entry in @($RegistryJson.profiles)) {
    $ProfileJson = Get-Content -Raw -LiteralPath ([string]$Entry.profilePath) | ConvertFrom-Json -ErrorAction Stop
    $ProfileJson | Add-Member -NotePropertyName httpPort -NotePropertyValue 2198 -Force
    [IO.File]::WriteAllText([string]$Entry.profilePath, (($ProfileJson | ConvertTo-Json -Depth 8) + [Environment]::NewLine), $Utf8)
    $Entry.profileSha256 = (Get-WorkForgeProfileFileSha256 -Path ([string]$Entry.profilePath)).ToLowerInvariant()
  }
  [IO.File]::WriteAllText($RegistryPath, (($RegistryJson | ConvertTo-Json -Depth 8) + [Environment]::NewLine), $Utf8)

  $LegacyCompatible = Get-WorkForgeRegistry
  if ($LegacyCompatible.Profiles.Count -ne 2) { throw "Deprecated httpPort compatibility broke multi-profile loading." }
  if (@($LegacyCompatible.Profiles | Where-Object { $_.HttpPort -ne 2198 }).Count -ne 0) {
    throw "Deprecated httpPort values were not preserved for compatibility."
  }

  Write-Output "MULTI_PROFILE_TEST_OK"
} finally {
  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $OriginalRegistryEnvironment, "Process")
  if (Test-Path -LiteralPath $TestRoot) {
    Remove-Item -LiteralPath $TestRoot -Recurse -Force
  }
}
