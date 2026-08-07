$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$InstallPath = Join-Path $PSScriptRoot "Install.ps1"
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-no-git-" + [guid]::NewGuid().ToString("N"))
$WorkspaceRoot = Join-Path $TestRoot "workspace"
$RegistryPath = Join-Path $TestRoot "runtime\profile_registry.json"

function Get-ApplicationDirectory {
  param([Parameter(Mandatory = $true)][string]$Name)
  $Command = Get-Command $Name -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $Path = [string]$Command.Source
  if ([string]::IsNullOrWhiteSpace($Path)) { $Path = [string]$Command.Path }
  return [IO.Path]::GetDirectoryName($Path)
}

try {
  $CandidateDirectories = @(
    (Get-ApplicationDirectory -Name "node.exe"),
    (Get-ApplicationDirectory -Name "rg.exe"),
    (Join-Path $env:SystemRoot "System32"),
    (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0")
  )
  $SafeDirectories = [Collections.Generic.List[string]]::new()
  foreach ($Directory in $CandidateDirectories) {
    if ([string]::IsNullOrWhiteSpace($Directory)) { continue }
    if (Test-Path -LiteralPath (Join-Path $Directory "git.exe") -PathType Leaf) { continue }
    if (-not $SafeDirectories.Contains($Directory)) { $SafeDirectories.Add($Directory) }
  }
  $IsolatedPath = $SafeDirectories -join ";"
  if ([string]::IsNullOrWhiteSpace($IsolatedPath)) { throw "Could not build an isolated PATH without Git." }

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe")
  $StartInfo.Arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$InstallPath`"",
    "-Mode", "Install",
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
  $StartInfo.EnvironmentVariables["Path"] = $IsolatedPath
  $Process = [Diagnostics.Process]::Start($StartInfo)
  $Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
  $Process.WaitForExit()

  if ($Process.ExitCode -ne 0) { throw "Install without Git failed: $Output" }
  if ($Output -notmatch "Git for Windows is optional") { throw "Install without Git did not explain local folder mode. Output: $Output" }
  if ($Output -notmatch "normal local folder") { throw "Install without Git did not report the profile fallback. Output: $Output" }
  if (-not (Test-Path -LiteralPath (Join-Path $WorkspaceRoot "tools\workforge-mcp\profile.json") -PathType Leaf)) {
    throw "Install without Git did not create the WorkForge profile."
  }
  if (Test-Path -LiteralPath (Join-Path $WorkspaceRoot ".git") -PathType Container) {
    throw "Install without Git unexpectedly created a Git repository."
  }
  if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) {
    throw "Install without Git did not register the profile."
  }

  Write-Output "INSTALL_WITHOUT_GIT_TEST_OK"
} finally {
  if (Test-Path -LiteralPath $TestRoot) {
    Remove-Item -LiteralPath $TestRoot -Recurse -Force
  }
}
