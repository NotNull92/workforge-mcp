$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$PrivacyScript = Join-Path $PSScriptRoot "test-privacy-invariants.ps1"
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-privacy-history-" + [guid]::NewGuid().ToString("N"))
$RepositoryRoot = Join-Path $TestRoot "repo"
$Utf8 = [Text.UTF8Encoding]::new($false)

function Invoke-FixtureGit {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & git.exe -C $RepositoryRoot @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Fixture Git command failed: $($Arguments -join ' ')" }
}

try {
  New-Item -ItemType Directory -Path $RepositoryRoot -Force | Out-Null
  & git.exe -C $RepositoryRoot init --initial-branch=main | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not initialize privacy-history fixture repository." }
  Invoke-FixtureGit -Arguments @("config", "user.name", "WorkForge Privacy Fixture")
  Invoke-FixtureGit -Arguments @("config", "user.email", "privacy-fixture@users.noreply.github.com")
  Invoke-FixtureGit -Arguments @("config", "core.autocrlf", "false")

  [IO.File]::WriteAllText((Join-Path $RepositoryRoot "README.md"), "clean fixture`n", $Utf8)
  Invoke-FixtureGit -Arguments @("add", "README.md")
  Invoke-FixtureGit -Arguments @("commit", "-m", "chore: add clean fixture")

  $SensitivePath = Join-Path $RepositoryRoot "removed-secret.txt"
  $SensitiveValue = "C:" + "\" + "Users" + "\" + "HistoryFixture" + "\" + "private.txt"
  [IO.File]::WriteAllText($SensitivePath, "historical path $SensitiveValue`n", $Utf8)
  Invoke-FixtureGit -Arguments @("add", "removed-secret.txt")
  Invoke-FixtureGit -Arguments @("commit", "-m", "test: add historical privacy fixture")

  Remove-Item -LiteralPath $SensitivePath -Force
  Invoke-FixtureGit -Arguments @("add", "-A")
  Invoke-FixtureGit -Arguments @("commit", "-m", "test: remove historical privacy fixture")

  if (Test-Path -LiteralPath $SensitivePath) { throw "Historical privacy fixture was not removed from HEAD." }

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe")
  $StartInfo.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PrivacyScript`" -RepositoryRoot `"$RepositoryRoot`""
  $StartInfo.WorkingDirectory = $RepositoryRoot
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $Process = [Diagnostics.Process]::Start($StartInfo)
  $Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
  $Process.WaitForExit()

  if ($Process.ExitCode -eq 0) {
    throw "Historical privacy fixture was not detected after being removed from HEAD."
  }
  if ($Output -notmatch "WindowsUserHome" -or $Output -notmatch "history/") {
    throw "Historical privacy failure did not identify the expected history-only finding. Output: $Output"
  }
  if ($Output -match [regex]::Escape($SensitiveValue)) {
    throw "Privacy failure output exposed the matched sensitive fixture value."
  }

  Write-Output "PRIVACY_HISTORY_TEST_OK"
} finally {
  if (Test-Path -LiteralPath $TestRoot) {
    Remove-Item -LiteralPath $TestRoot -Recurse -Force
  }
}
