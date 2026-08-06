$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$InstallerPath = Join-Path $PSScriptRoot "Install.ps1"
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-install-platform-" + [guid]::NewGuid().ToString("N"))
$ProfileDirectory = Join-Path $TestRoot "tools\workforge-mcp"

try {
  New-Item -ItemType Directory -Path $ProfileDirectory -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $ProfileDirectory "profile.json"), "{}")

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = "powershell.exe"
  $StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$InstallerPath`" -WorkspaceRoot `"$TestRoot`" -SkipTunnelDownload -NoDesktopShortcut"
  $StartInfo.WorkingDirectory = $ToolRoot
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $StartInfo.EnvironmentVariables.Remove("OS")

  $Process = [Diagnostics.Process]::Start($StartInfo)
  $StandardOutput = $Process.StandardOutput.ReadToEnd()
  $StandardError = $Process.StandardError.ReadToEnd()
  $Process.WaitForExit()
  $ObservedOutput = $StandardOutput + $StandardError

  if ($Process.ExitCode -ne 1) {
    throw "Expected the existing-profile guard to exit 1; observed $($Process.ExitCode). Output: $ObservedOutput"
  }
  if ($ObservedOutput -notmatch "Profile already exists") {
    throw "Installer rejected Windows when the OS environment variable was absent. Output: $ObservedOutput"
  }
  if ($ObservedOutput -match "currently supports Windows only") {
    throw "Installer used the OS environment variable as the Windows platform check. Output: $ObservedOutput"
  }

  Write-Output "Install platform detection test passed."
}
finally {
  if (Test-Path -LiteralPath $TestRoot) {
    Remove-Item -LiteralPath $TestRoot -Recurse -Force
  }
}
