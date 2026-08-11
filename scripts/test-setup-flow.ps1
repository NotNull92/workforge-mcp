$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")
$SetupPath = Join-Path $PSScriptRoot "Setup-Entry.ps1"
$SetupImplementationPath = Join-Path $PSScriptRoot "Setup.ps1"
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-setup-" + [guid]::NewGuid().ToString("N"))
$WorkspaceRoot = Join-Path $TestRoot "workspace"
$RegistryPath = Join-Path $TestRoot "runtime\profile_registry.json"
$Utf8 = [Text.UTF8Encoding]::new($false)
$SetupText = Get-Content -Raw -LiteralPath $SetupImplementationPath
$SetupEntryText = Get-Content -Raw -LiteralPath $SetupPath
foreach ($RequiredUpgradeToken in @(
  "Invoke-WorkForgeTransactionalUpgrade",
  "profile_registry.json",
  "Setup refuses to downgrade WorkForge",
  '$PSBoundParameters',
  '$SetupArguments["SkipStart"] = $true'
)) {
  if ($SetupEntryText.IndexOf($RequiredUpgradeToken, [StringComparison]::Ordinal) -lt 0) {
    throw "Portable Setup entry lost the transactional upgrade bridge: $RequiredUpgradeToken"
  }
}
if ($SetupEntryText.Contains('$SetupArguments += "-SkipStart"')) {
  throw "Portable Setup entry must not inject SkipStart as a positional array token."
}

$SetupAst = [Management.Automation.Language.Parser]::ParseFile($SetupImplementationPath, [ref]$null, [ref]$null)
$SetupEntryAst = [Management.Automation.Language.Parser]::ParseFile($SetupPath, [ref]$null, [ref]$null)
$SetupParameterNames = @($SetupAst.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath } | Sort-Object)
$SetupEntryParameterNames = @($SetupEntryAst.ParamBlock.Parameters | ForEach-Object { $_.Name.VariablePath.UserPath } | Sort-Object)
$ParameterDifference = @(Compare-Object -ReferenceObject $SetupParameterNames -DifferenceObject $SetupEntryParameterNames)
if ($ParameterDifference.Count -gt 0) {
  throw "Setup-Entry.ps1 parameter surface drifted from Setup.ps1: $($ParameterDifference | Out-String)"
}

$UnqualifiedTunnelAssignments = [regex]::Matches($SetupText, '(?m)^\s*\$TunnelConfigured\s*=')
if ($UnqualifiedTunnelAssignments.Count -gt 0) {
  throw "Setup loses successful tunnel state when a stage body assigns TunnelConfigured in its child scope."
}
if ([regex]::Matches($SetupText, '(?m)^\s*\$script:TunnelConfigured\s*=').Count -lt 3) {
  throw "Setup must initialize and update tunnel state in script scope."
}
foreach ($RequiredHandoffText in @(
  "Plugin search",
  "Authentication to None",
  "confirm WorkForge appears under Installed",
  "new Chat conversation (not Work)",
  "full local project path",
  "Keep the WorkForge tunnel running"
)) {
  if (-not $SetupText.Contains($RequiredHandoffText)) {
    throw "Setup ChatGPT handoff is missing required guidance: $RequiredHandoffText"
  }
}

function Invoke-TestSetup {
  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = "powershell.exe"
  $StartInfo.Arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$SetupPath`"",
    "-Mode", "Auto",
    "-WorkspaceRoot", "`"$WorkspaceRoot`"",
    "-RegistryPath", "`"$RegistryPath`"",
    "-SkipTunnelConfiguration",
    "-SkipStart",
    "-NoBrowser",
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
  return [pscustomobject]@{ ExitCode = $Process.ExitCode; Output = $Output }
}

try {
  $First = Invoke-TestSetup
  if ($First.ExitCode -ne 0) { throw "Initial Setup test failed with exit $($First.ExitCode). Output: $($First.Output)" }
  if ($First.Output -notmatch '\[2/6\] RUNTIME AND PROFILE') { throw "Setup did not report the runtime and profile stage. Output: $($First.Output)" }
  if ($First.Output -notmatch 'WorkForge Install completed') { throw "Auto mode did not choose Install for a missing profile. Output: $($First.Output)" }
  if ($First.Output -notmatch 'Tunnel configuration skipped by request') { throw "Setup did not honor the tunnel skip. Output: $($First.Output)" }
  if ($First.Output -notmatch 'WORKFORGE READY') { throw "Setup did not report completion. Output: $($First.Output)" }

  $ProfilePath = Join-Path $WorkspaceRoot "tools\workforge-mcp\profile.json"
  $AgentsPath = Join-Path $WorkspaceRoot "AGENTS.md"
  if (-not (Test-Path -LiteralPath $ProfilePath -PathType Leaf)) { throw "Setup did not create the profile manifest." }
  if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) { throw "Setup did not create the selected registry." }

  $CustomPolicy = "# Setup repair fixture`n`nPreserve this user-owned policy.`n"
  [IO.File]::WriteAllText($AgentsPath, $CustomPolicy, $Utf8)
  $PolicyHash = Get-WorkForgeFileSha256 -Path $AgentsPath

  $Second = Invoke-TestSetup
  if ($Second.ExitCode -ne 0) { throw "Repeated Setup test failed with exit $($Second.ExitCode). Output: $($Second.Output)" }
  if ($Second.Output -notmatch 'WorkForge Repair completed') { throw "Auto mode did not choose Repair for an existing profile. Output: $($Second.Output)" }
  if ((Get-WorkForgeFileSha256 -Path $AgentsPath) -ne $PolicyHash) {
    throw "Repeated Setup overwrote the user-owned policy."
  }

  Write-Output "SETUP_FLOW_TEST_OK"
} finally {
  if (Test-Path -LiteralPath $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
}
