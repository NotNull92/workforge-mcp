$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$ControlPath = Join-Path $PSScriptRoot "Control.ps1"

function Invoke-ControlWrapperFixture {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Arguments
  )

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $env:ComSpec
  $StartInfo.Arguments = "/d /c " + [char]34 + [char]34 + $Path + [char]34 + " " + $Arguments + [char]34
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardInput = $true
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $Process = [Diagnostics.Process]::Start($StartInfo)
  $Process.StandardInput.Close()
  $Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
  $Process.WaitForExit()
  return [pscustomobject]@{ ExitCode = $Process.ExitCode; Output = $Output }
}

$FixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-control-ux-" + [guid]::NewGuid().ToString("N"))
try {
  $SourceRoot = Join-Path $FixtureRoot "source"
  $ReleaseRoot = Join-Path $FixtureRoot "release"
  foreach ($Root in @($SourceRoot, $ReleaseRoot)) {
    New-Item -ItemType Directory -Path (Join-Path $Root "scripts") -Force | Out-Null
  }

  Copy-Item -LiteralPath (Join-Path $ToolRoot "WorkForge Control.cmd") -Destination $SourceRoot
  Set-Content -LiteralPath (Join-Path $SourceRoot "scripts\Launch-Control.ps1") -Encoding UTF8 -Value 'Write-Output "DASHBOARD_LAUNCH"'
  Set-Content -LiteralPath (Join-Path $SourceRoot "scripts\Control.ps1") -Encoding UTF8 -Value 'Write-Output "CLI_LAUNCH"'
  $DashboardLaunch = Invoke-ControlWrapperFixture -Path (Join-Path $SourceRoot "WorkForge Control.cmd")
  if ($DashboardLaunch.ExitCode -ne 0 -or $DashboardLaunch.Output -notmatch 'DASHBOARD_LAUNCH') {
    throw "Control wrapper did not launch the dashboard entrypoint. Output: $($DashboardLaunch.Output)"
  }
  $CliLaunch = Invoke-ControlWrapperFixture -Path (Join-Path $SourceRoot "WorkForge Control.cmd") -Arguments "--cli"
  if ($CliLaunch.ExitCode -ne 0 -or $CliLaunch.Output -notmatch 'CLI_LAUNCH') {
    throw "Control wrapper did not launch the CLI fallback. Output: $($CliLaunch.Output)"
  }

  Set-Content -LiteralPath (Join-Path $ReleaseRoot ".workforge-release.json") -Encoding UTF8 -Value '{}'
  $NewLine = [Environment]::NewLine
  Set-Content -LiteralPath (Join-Path $ReleaseRoot "scripts\Portable-Dispatch.cmd") -Encoding ASCII -Value ("@echo off" + $NewLine + "echo DISPATCH:%~1" + $NewLine + "exit /b 0")
  Set-Content -LiteralPath (Join-Path $ReleaseRoot "scripts\Portable-Control.cmd") -Encoding ASCII -Value ("@echo off" + $NewLine + "echo PORTABLE_CONTROL" + $NewLine + "exit /b 0")
  foreach ($Case in @(
    [pscustomobject]@{ Wrapper = "Install.cmd"; Arguments = ""; Expected = "DISPATCH:Install" },
    [pscustomobject]@{ Wrapper = "Configure Tunnel.cmd"; Arguments = ""; Expected = "DISPATCH:Configure-Tunnel" },
    [pscustomobject]@{ Wrapper = "Uninstall.cmd"; Arguments = "-NonInteractive"; Expected = "DISPATCH:Uninstall" },
    [pscustomobject]@{ Wrapper = "WorkForge Control.cmd"; Arguments = ""; Expected = "PORTABLE_CONTROL" }
  )) {
    Copy-Item -LiteralPath (Join-Path $ToolRoot $Case.Wrapper) -Destination $ReleaseRoot
    $Observed = Invoke-ControlWrapperFixture -Path (Join-Path $ReleaseRoot $Case.Wrapper) -Arguments $Case.Arguments
    if ($Observed.ExitCode -ne 0 -or $Observed.Output.IndexOf($Case.Expected, [StringComparison]::Ordinal) -lt 0) {
      throw "$($Case.Wrapper) did not dispatch through the installed portable runtime. Output: $($Observed.Output)"
    }
  }
} finally {
  if (Test-Path -LiteralPath $FixtureRoot) {
    Remove-Item -LiteralPath $FixtureRoot -Recurse -Force
  }
}

$StartInfo = [Diagnostics.ProcessStartInfo]::new()
$StartInfo.FileName = "powershell.exe"
$StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ControlPath`" -Action start -ProfileId missing-control-test -NoPause -Plain -NoLog"
$StartInfo.WorkingDirectory = $ToolRoot
$StartInfo.UseShellExecute = $false
$StartInfo.RedirectStandardOutput = $true
$StartInfo.RedirectStandardError = $true
$Process = [Diagnostics.Process]::Start($StartInfo)
$Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
$Process.WaitForExit()

if ($Process.ExitCode -ne 1) { throw "Expected direct control failure exit 1; observed $($Process.ExitCode). Output: $Output" }
if ($Output -notmatch 'ACTION FAILED: START') { throw "CLI Control failure did not identify the action. Output: $Output" }
if ($Output -notmatch 'Run Doctor') { throw "CLI Control failure did not provide an actionable Doctor hint. Output: $Output" }
if ($Output -match 'CONTROL_PLANE_API_KEY=') { throw "Control failure output leaked credential-shaped content." }

Write-Output "CONTROL_UX_TEST_OK"
