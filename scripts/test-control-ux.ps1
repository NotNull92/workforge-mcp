$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$ControlPath = Join-Path $PSScriptRoot "Control.ps1"
$LaunchPath = Join-Path $PSScriptRoot "Launch-Control.ps1"
$ServerPath = Join-Path $PSScriptRoot "control-server.mjs"
$WrapperPath = Join-Path $ToolRoot "WorkForge Control.cmd"
$Wrapper = Get-Content -Raw -LiteralPath $WrapperPath

if ($Wrapper -notmatch 'Launch-Control\.ps1') { throw "Control wrapper does not launch the HTML dashboard." }
if ($Wrapper -notmatch '--cli') { throw "Control wrapper does not expose the CLI fallback." }
if ($Wrapper -notmatch 'Control\.ps1') { throw "Control wrapper lost the CLI fallback implementation." }
if ($Wrapper -notmatch 'Portable-Control\.cmd') { throw "Release-root Control wrapper does not delegate to the installed portable engine." }
if ($Wrapper -notmatch 'if not "%EXIT_CODE%"=="0"') { throw "Control wrapper does not preserve a visible error path." }
if ($Wrapper -notmatch 'exit /b %EXIT_CODE%') { throw "Control wrapper does not propagate the launcher exit code." }

$ReleaseDispatchWrappers = [ordered]@{
  "Install.cmd" = "Install"
  "Configure Tunnel.cmd" = "Configure-Tunnel"
  "Uninstall.cmd" = "Uninstall"
}
foreach ($Entry in $ReleaseDispatchWrappers.GetEnumerator()) {
  $ReleaseWrapperText = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot $Entry.Key)
  if ($ReleaseWrapperText -notmatch '\.workforge-release\.json') {
    throw "$($Entry.Key) does not distinguish a portable release root from a source checkout."
  }
  if ($ReleaseWrapperText -notmatch 'Portable-Dispatch\.cmd') {
    throw "$($Entry.Key) does not delegate release-root lifecycle work to the installed engine."
  }
  if ($ReleaseWrapperText.IndexOf([string]$Entry.Value, [StringComparison]::Ordinal) -lt 0) {
    throw "$($Entry.Key) does not dispatch the expected installed-engine action $($Entry.Value)."
  }
}

$LaunchText = Get-Content -Raw -LiteralPath $LaunchPath
if ($LaunchText -notmatch 'Start-Process') { throw "Control launcher does not detach the local dashboard process." }
if ($LaunchText -notmatch 'WindowStyle Hidden') { throw "Control launcher does not hide the background server window." }
if ($LaunchText -notmatch 'control-server\.mjs') { throw "Control launcher does not target the dashboard server." }

$ServerText = Get-Content -Raw -LiteralPath $ServerPath
if ($ServerText -notmatch "host: '127\.0\.0\.1'") { throw "Control server is not explicitly bound to loopback." }
if ($ServerText -match '0\.0\.0\.0') { throw "Control server must never bind to all interfaces." }
if ($ServerText -notmatch 'HttpOnly; SameSite=Strict') { throw "Control server session cookie is not hardened." }
if ($ServerText -notmatch 'request\.headers\.origin !== expectedOrigin') { throw "Control server does not verify mutation Origin." }
if ($ServerText -notmatch 'request\.headers\.host !== expectedHost') { throw "Control server does not protect against Host rebinding." }

$ControlText = Get-Content -Raw -LiteralPath $ControlPath
if ($ControlText -notmatch 'Uninstall') { throw "CLI Control menu does not expose the uninstall flow." }
if ($ControlText -notmatch 'WorkForge\.UI\.ps1') { throw "CLI Control does not use the shared ForgeUI renderer." }

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
