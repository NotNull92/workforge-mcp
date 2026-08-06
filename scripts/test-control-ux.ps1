$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$ControlPath = Join-Path $PSScriptRoot "Control.ps1"
$WrapperPath = Join-Path $ToolRoot "WorkForge Control.cmd"
$Wrapper = Get-Content -Raw -LiteralPath $WrapperPath
if ($Wrapper -notmatch 'if not "%EXIT_CODE%"=="0"') { throw "Control wrapper does not preserve a visible error path." }
if ($Wrapper -notmatch 'exit /b %EXIT_CODE%') { throw "Control wrapper does not propagate the PowerShell exit code." }

$StartInfo = [Diagnostics.ProcessStartInfo]::new()
$StartInfo.FileName = "powershell.exe"
$StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ControlPath`" -Action start -ProfileId missing-control-test -NoPause"
$StartInfo.WorkingDirectory = $ToolRoot
$StartInfo.UseShellExecute = $false
$StartInfo.RedirectStandardOutput = $true
$StartInfo.RedirectStandardError = $true
$Process = [Diagnostics.Process]::Start($StartInfo)
$Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
$Process.WaitForExit()

if ($Process.ExitCode -ne 1) { throw "Expected direct control failure exit 1; observed $($Process.ExitCode). Output: $Output" }
if ($Output -notmatch 'Action failed: start') { throw "Control failure did not identify the action. Output: $Output" }
if ($Output -notmatch 'Run Doctor') { throw "Control failure did not provide an actionable Doctor hint. Output: $Output" }
if ($Output -match 'CONTROL_PLANE_API_KEY=') { throw "Control failure output leaked credential-shaped content." }

Write-Output "CONTROL_UX_TEST_OK"
