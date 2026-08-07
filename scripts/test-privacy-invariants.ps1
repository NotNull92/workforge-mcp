$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$SelfRelativePath = "scripts/test-privacy-invariants.ps1"
$Utf8Strict = [Text.UTF8Encoding]::new($false, $true)
$Failures = [Collections.Generic.List[object]]::new()

function Add-PrivacyFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Type,
    [Parameter(Mandatory = $true)][string]$File,
    [int]$Line = 0
  )
  $Failures.Add([pscustomobject]@{ Type = $Type; File = $File.Replace("\", "/"); Line = $Line })
}

function Get-LineNumber {
  param([Parameter(Mandatory = $true)][string]$Text, [Parameter(Mandatory = $true)][int]$Index)
  if ($Index -le 0) { return 1 }
  return ($Text.Substring(0, $Index) -split "`n").Count
}

$Tracked = @(& git.exe -C $ToolRoot ls-files --cached --others --exclude-standard | Sort-Object -Unique)
if ($LASTEXITCODE -ne 0) { throw "Could not enumerate repository files for privacy validation." }

$ForbiddenFileNames = @(".env.local", "tunnel.local.yaml", "profile_registry.json", "install-manifest.json", ".workforge-release.json")
foreach ($Relative in $Tracked) {
  $Normalized = $Relative.Replace("\", "/")
  if ($ForbiddenFileNames -contains [IO.Path]::GetFileName($Relative)) {
    Add-PrivacyFailure -Type "ForbiddenRuntimeFile" -File $Normalized
  }
  if ($Normalized -match "^(?:runtime|artifacts|node_modules|dist)/") {
    Add-PrivacyFailure -Type "ForbiddenGeneratedDirectory" -File $Normalized
  }
  if ([IO.Path]::GetExtension($Relative) -ieq ".jsonl" -or [IO.Path]::GetFileName($Relative) -match '^uninstall-.+\.json$') {
    Add-PrivacyFailure -Type "ForbiddenGeneratedLogOrReceipt" -File $Normalized
  }
}

$Patterns = [ordered]@{
  WindowsUserHome = '(?i)[A-Z]:\\Users\\[^\s"]+'
  MacUserHome = '(?i)/Users/[^\s"]+'
  LinuxUserHome = '(?i)/home/[^\s"]+'
  OpenAITunnelId = "(?i)\btunnel_[a-f0-9]{32}\b"
  OpenAIKey = "(?i)\b(?:sk|rk)-(?:proj-)?[A-Za-z0-9_-]{16,}\b"
  GitHubClassicToken = "(?i)\bgh[pousr]_[A-Za-z0-9]{20,}\b"
  GitHubFineGrainedToken = "(?i)\bgithub_pat_[A-Za-z0-9_]{20,}\b"
  AwsAccessKey = "\bAKIA[0-9A-Z]{16}\b"
  GoogleApiKey = "\bAIza[0-9A-Za-z_-]{35}\b"
  SlackToken = "(?i)\bxox[baprs]-[A-Za-z0-9-]{10,}\b"
  KoreanPhone = "(?<!\d)01[016789][- ]?\d{3,4}[- ]?\d{4}(?!\d)"
  InternationalPhone = "(?<![\w])\+[1-9]\d{7,14}(?!\d)"
}
$AllowedEmailDomains = @(
  "users.noreply.github.com",
  "example.invalid",
  "example.com",
  "example.org",
  "example.net"
)

foreach ($Relative in $Tracked) {
  $Normalized = $Relative.Replace("\", "/")
  if ($Normalized -ceq $SelfRelativePath) { continue }
  $Path = Join-Path $ToolRoot $Relative
  $Bytes = [IO.File]::ReadAllBytes($Path)
  if ($Bytes -contains 0) { continue }
  try {
    $Text = $Utf8Strict.GetString($Bytes)
  } catch {
    Add-PrivacyFailure -Type "InvalidUtf8Text" -File $Normalized
    continue
  }

  foreach ($Entry in $Patterns.GetEnumerator()) {
    foreach ($Match in [regex]::Matches($Text, [string]$Entry.Value)) {
      Add-PrivacyFailure -Type ([string]$Entry.Key) -File $Normalized -Line (Get-LineNumber -Text $Text -Index $Match.Index)
    }
  }

  foreach ($Match in [regex]::Matches($Text, "(?i)(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9.-])")) {
    $Domain = ($Match.Value -split "@")[-1].ToLowerInvariant()
    if ($AllowedEmailDomains -notcontains $Domain) {
      Add-PrivacyFailure -Type "NonPublicEmail" -File $Normalized -Line (Get-LineNumber -Text $Text -Index $Match.Index)
    }
  }

  foreach ($Match in [regex]::Matches($Text, "(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")) {
    $Ip = $Match.Value
    $Parts = @($Ip.Split(".") | ForEach-Object { [int]$_ })
    if ($Parts.Count -ne 4 -or @($Parts | Where-Object { $_ -gt 255 }).Count -gt 0) { continue }
    $Allowed = $Ip -eq "127.0.0.1" -or $Ip -eq "0.0.0.0" -or $Ip -eq "255.255.255.255" -or
      ($Parts[0] -eq 192 -and $Parts[1] -eq 0 -and $Parts[2] -eq 2) -or
      ($Parts[0] -eq 198 -and $Parts[1] -eq 51 -and $Parts[2] -eq 100) -or
      ($Parts[0] -eq 203 -and $Parts[1] -eq 0 -and $Parts[2] -eq 113)
    if (-not $Allowed) {
      Add-PrivacyFailure -Type "NonExampleIpAddress" -File $Normalized -Line (Get-LineNumber -Text $Text -Index $Match.Index)
    }
  }
}

$CommitRows = @(& git.exe -C $ToolRoot log --all --format="%H%x09%ae%x09%ce")
if ($LASTEXITCODE -ne 0) { throw "Could not inspect commit metadata for privacy validation." }
foreach ($Row in $CommitRows) {
  $Fields = $Row -split "`t", 3
  if ($Fields.Count -ne 3) { throw "Unexpected commit metadata format." }
  if ($Fields[1] -notmatch "(?i)^[^@]+@users\.noreply\.github\.com$") {
    Add-PrivacyFailure -Type "CommitAuthorEmailIsNotNoreply" -File $Fields[0]
  }
  if ($Fields[2] -notmatch "(?i)^[^@]+@users\.noreply\.github\.com$") {
    Add-PrivacyFailure -Type "CommitterEmailIsNotNoreply" -File $Fields[0]
  }
}

$ConfiguredEmail = (& git.exe -C $ToolRoot config --get user.email 2>$null | Out-String).Trim()
if (-not [string]::IsNullOrWhiteSpace($ConfiguredEmail) -and $ConfiguredEmail -notmatch "(?i)^[^@]+@users\.noreply\.github\.com$") {
  Add-PrivacyFailure -Type "LocalGitEmailIsNotNoreply" -File ".git/config"
}

if ($Failures.Count -gt 0) {
  $Failures | Sort-Object Type, File, Line | Format-Table -AutoSize | Out-String | Write-Error
  throw "Privacy invariant validation failed with $($Failures.Count) finding(s). Values are intentionally omitted from logs."
}

Write-Output "PRIVACY_INVARIANTS_TEST_OK"
