$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$UiPath = Join-Path $PSScriptRoot "WorkForge.UI.ps1"
$GoldenRoot = Join-Path $ToolRoot "tests\golden"
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-ui-test-" + [guid]::NewGuid().ToString("N"))
$Utf8 = [Text.UTF8Encoding]::new($false)

function Invoke-UiFixture {
  param([Parameter(Mandatory = $true)][ValidateSet("setup", "uninstall", "rich")][string]$Kind)

  $FixturePath = Join-Path $TestRoot "$Kind.ps1"
  $EscapedUiPath = $UiPath.Replace("'", "''")
  $Body = switch ($Kind) {
    "setup" {
@"
. '$EscapedUiPath'
`$ui = Initialize-WorkForgeUi -Operation setup -Version 1.2.0 -ToolRoot '$($ToolRoot.Replace("'", "''"))' -Plain -NoLog
Write-WorkForgeBanner -Action SETUP
Write-WorkForgePlan -Items @('Environment','Runtime','Handoff')
`$stage = Start-WorkForgeStage -Number 1 -Total 3 -Name Environment
Complete-WorkForgeStage -Stage `$stage -Detail 'Windows x64' -DurationMs 120
`$stage = Start-WorkForgeStage -Number 2 -Total 3 -Name Runtime
Skip-WorkForgeStage -Stage `$stage -Reason 'Prebuilt runtime already verified'
`$stage = Start-WorkForgeStage -Number 3 -Total 3 -Name Handoff
Fail-WorkForgeStage -Stage `$stage -Reason 'Browser disabled'
Write-WorkForgeSummary -Title 'SETUP READY' -Values ([ordered]@{Profile='%USERPROFILE%\WorkForge';Startup='manual'})
"@
    }
    "uninstall" {
@"
. '$EscapedUiPath'
`$ui = Initialize-WorkForgeUi -Operation uninstall -Version 1.2.0 -ToolRoot '$($ToolRoot.Replace("'", "''"))' -Plain -NoLog
Write-WorkForgeBanner -Action UNINSTALL -Subtitle 'Remove the gateway without leaving a loose thread'
Write-WorkForgePlan -Items @('Verify installation identity','Preserve the workspace')
`$stage = Start-WorkForgeStage -Number 1 -Total 2 -Name Preflight
Complete-WorkForgeStage -Stage `$stage -Detail 'last profile; engine release' -DurationMs 80
`$stage = Start-WorkForgeStage -Number 2 -Total 2 -Name Engine
Skip-WorkForgeStage -Stage `$stage -Reason 'Source checkout protected'
Write-WorkForgeSummary -Title 'UNINSTALL COMPLETE' -Values ([ordered]@{Mode='KeepWorkspace';Workspace='preserved';Engine='source'})
"@
    }
    "rich" {
@"
. '$EscapedUiPath'
`$ui = Initialize-WorkForgeUi -Operation setup -Version 1.2.0 -ToolRoot '$($ToolRoot.Replace("'", "''"))' -ForceRich -NoLog
Write-WorkForgeBanner -Action SETUP
"@
    }
  }
  [IO.File]::WriteAllText($FixturePath, $Body, $Utf8)

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = "powershell.exe"
  $StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$FixturePath`""
  $StartInfo.WorkingDirectory = $ToolRoot
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $Process = [Diagnostics.Process]::Start($StartInfo)
  $Output = $Process.StandardOutput.ReadToEnd()
  $ErrorText = $Process.StandardError.ReadToEnd()
  $Process.WaitForExit()
  if ($Process.ExitCode -ne 0) {
    throw "UI fixture $Kind failed with exit $($Process.ExitCode): $ErrorText"
  }
  return $Output.Replace("`r`n", "`n")
}

try {
  New-Item -ItemType Directory -Path $TestRoot -Force | Out-Null

  foreach ($Fixture in @("setup", "uninstall")) {
    $Observed = Invoke-UiFixture -Kind $Fixture
    $Expected = ([IO.File]::ReadAllText((Join-Path $GoldenRoot "$Fixture-plain.txt"), [Text.UTF8Encoding]::new($false, $true))).Replace("`r`n", "`n")
    if ($Observed -cne $Expected) {
      throw "Plain UI output changed for $Fixture.`n--- EXPECTED ---`n$Expected`n--- OBSERVED ---`n$Observed"
    }
  }

  $Rich = Invoke-UiFixture -Kind "rich"
  $Escape = [string][char]27
  $TopLeft = [string][char]0x256D
  if ($Rich.IndexOf($Escape, [StringComparison]::Ordinal) -lt 0) { throw "Rich UI output did not contain ANSI styling." }
  if ($Rich.IndexOf($TopLeft, [StringComparison]::Ordinal) -lt 0) { throw "Rich UI output did not contain the expected panel border." }

  . $UiPath
  $LogPath = Join-Path $TestRoot "redaction.jsonl"
  $ui = Initialize-WorkForgeUi -Operation setup -Version 1.2.0 -ToolRoot $ToolRoot -Plain -LogPath $LogPath
  $TunnelFixture = "tunnel_" + ("a" * 32)
  $KeyFixture = "sk-" + ("A" * 24)
  $Sensitive = "$env:USERPROFILE $TunnelFixture $KeyFixture"
  Write-WorkForgeLogEvent -Level "error" -Event "redaction_test" -Detail $Sensitive
  $LogText = Get-Content -Raw -LiteralPath $LogPath
  foreach ($Forbidden in @($env:USERPROFILE, $TunnelFixture, $KeyFixture)) {
    if ($LogText.IndexOf($Forbidden, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      throw "UI log redaction failed."
    }
  }
  if ($LogText -notmatch '%USERPROFILE%' -or $LogText -notmatch 'redacted') {
    throw "UI log did not preserve redaction markers."
  }

  Write-Output "UI_RENDERING_TEST_OK"
} finally {
  if (Test-Path -LiteralPath $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
}
