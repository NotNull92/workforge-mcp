Set-StrictMode -Version 3.0

$script:WorkForgeUiContext = $null

function Test-WorkForgeUiPlainMode {
  param(
    [switch]$Plain,
    [switch]$ForceRich
  )

  if ($ForceRich) { return $false }
  if ($Plain) { return $true }
  if (-not [string]::IsNullOrWhiteSpace($env:NO_COLOR)) { return $true }
  if ($env:WORKFORGE_PLAIN_UI -eq "1") { return $true }
  if ($env:CI -eq "true" -or $env:CI -eq "1") { return $true }
  try {
    if ([Console]::IsOutputRedirected) { return $true }
  } catch {}
  return $Host.Name -notmatch "ConsoleHost"
}

function Test-WorkForgeAnsiSupport {
  param([switch]$ForceRich)

  if ($ForceRich) { return $true }
  try {
    $Property = $Host.UI.PSObject.Properties["SupportsVirtualTerminal"]
    if ($null -ne $Property -and [bool]$Property.Value) { return $true }
  } catch {}
  if (-not [string]::IsNullOrWhiteSpace($env:WT_SESSION)) { return $true }
  if (-not [string]::IsNullOrWhiteSpace($env:TERM) -and $env:TERM -ne "dumb") { return $true }
  return $false
}

function Get-WorkForgeUiWidth {
  param([int]$RequestedWidth = 72)

  $Width = $RequestedWidth
  try {
    if ([Console]::WindowWidth -gt 0) {
      $Width = [Math]::Min($RequestedWidth, [Console]::WindowWidth - 2)
    }
  } catch {}
  return [Math]::Max(48, $Width)
}

function Get-WorkForgeGlyph {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("pending", "running", "success", "warning", "failed", "skipped", "bullet", "horizontal", "topLeft", "topRight", "bottomLeft", "bottomRight", "vertical", "ellipsis")]
    [string]$Name
  )

  $CodePoint = switch ($Name) {
    "pending" { 0x25CB }
    "running" { 0x25C6 }
    "success" { 0x2713 }
    "warning" { 0x0021 }
    "failed" { 0x00D7 }
    "skipped" { 0x2013 }
    "bullet" { 0x00B7 }
    "horizontal" { 0x2500 }
    "topLeft" { 0x256D }
    "topRight" { 0x256E }
    "bottomLeft" { 0x2570 }
    "bottomRight" { 0x256F }
    "vertical" { 0x2502 }
    "ellipsis" { 0x2026 }
  }
  return [string][char]$CodePoint
}

function Protect-WorkForgeDisplayText {
  param(
    [AllowNull()][AllowEmptyString()][string]$Text,
    [string]$ToolRoot
  )

  if ($null -eq $Text) { return "" }
  $Protected = [string]$Text
  $UserProfile = [Environment]::GetFolderPath("UserProfile")
  if (-not [string]::IsNullOrWhiteSpace($UserProfile)) {
    $Protected = [regex]::Replace(
      $Protected,
      [regex]::Escape($UserProfile),
      "%USERPROFILE%",
      [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
  }
  if (-not [string]::IsNullOrWhiteSpace($ToolRoot)) {
    $Protected = [regex]::Replace(
      $Protected,
      [regex]::Escape($ToolRoot),
      "%WORKFORGE_ROOT%",
      [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
  }

  $Protected = [regex]::Replace($Protected, '(?i)\btunnel_[a-f0-9]{32}\b', 'tunnel_<redacted>')
  $Protected = [regex]::Replace($Protected, '(?i)\b(?:sk|rk)-(?:proj-)?[A-Za-z0-9_-]{16,}\b', '<redacted-key>')
  $Protected = [regex]::Replace($Protected, '(?i)\bgh[pousr]_[A-Za-z0-9]{20,}\b', '<redacted-token>')
  $Protected = [regex]::Replace($Protected, '(?i)\bgithub_pat_[A-Za-z0-9_]{20,}\b', '<redacted-token>')
  $Protected = [regex]::Replace($Protected, '(?i)(CONTROL_PLANE_API_KEY\s*=\s*)[^\s;]+', '$1<redacted>')
  return $Protected
}

function Initialize-WorkForgeUi {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Operation,
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$ToolRoot,
    [switch]$Plain,
    [switch]$ForceRich,
    [switch]$NoLog,
    [string]$LogPath,
    [string]$LogDirectory
  )

  $IsPlain = Test-WorkForgeUiPlainMode -Plain:$Plain -ForceRich:$ForceRich
  $SupportsAnsi = -not $IsPlain -and (Test-WorkForgeAnsiSupport -ForceRich:$ForceRich)
  $ResolvedLogPath = $null
  if (-not $NoLog) {
    if (-not [string]::IsNullOrWhiteSpace($LogPath)) {
      $ResolvedLogPath = [IO.Path]::GetFullPath($LogPath)
    } else {
      $Directory = $LogDirectory
      if ([string]::IsNullOrWhiteSpace($Directory)) {
        $Directory = Join-Path $ToolRoot "runtime\logs"
      }
      $Directory = [IO.Path]::GetFullPath($Directory)
      New-Item -ItemType Directory -Path $Directory -Force | Out-Null
      $Stamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMdd-HHmmss")
      $ResolvedLogPath = Join-Path $Directory ("$($Operation.ToLowerInvariant())-$Stamp-$PID.jsonl")
    }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($ResolvedLogPath)) -Force | Out-Null
  }

  $script:WorkForgeUiContext = [pscustomobject]@{
    Operation = $Operation.ToLowerInvariant()
    Version = $Version
    ToolRoot = [IO.Path]::GetFullPath($ToolRoot)
    Plain = $IsPlain
    SupportsAnsi = $SupportsAnsi
    Unicode = -not $IsPlain
    Width = Get-WorkForgeUiWidth
    LogPath = $ResolvedLogPath
    StartedAt = [DateTimeOffset]::UtcNow
  }

  Write-WorkForgeLogEvent -Level "info" -Event "operation_started" -Detail $Operation
  return $script:WorkForgeUiContext
}

function Get-WorkForgeUiContext {
  if ($null -eq $script:WorkForgeUiContext) {
    throw "WorkForge UI has not been initialized."
  }
  return $script:WorkForgeUiContext
}

function Get-WorkForgeUiLogPath {
  if ($null -eq $script:WorkForgeUiContext) { return $null }
  return $script:WorkForgeUiContext.LogPath
}

function Get-WorkForgeAnsiCode {
  param([string]$Tone)

  switch ($Tone) {
    "primary" { return "38;2;255;122;24" }
    "accent" { return "38;2;245;190;75" }
    "info" { return "38;2;88;200;220" }
    "success" { return "38;2;76;217;100" }
    "warning" { return "38;2;245;166;35" }
    "error" { return "38;2;255;92;122" }
    "muted" { return "38;2;130;139;151" }
    default { return "38;2;230;232;238" }
  }
}

function Write-WorkForgeLine {
  param(
    [AllowEmptyString()][string]$Text = "",
    [ValidateSet("text", "primary", "accent", "info", "success", "warning", "error", "muted")]
    [string]$Tone = "text"
  )

  $Context = Get-WorkForgeUiContext
  $Rendered = [string]$Text
  if ($Context.SupportsAnsi) {
    $Escape = [char]27
    $Rendered = "$Escape[$(Get-WorkForgeAnsiCode -Tone $Tone)m$Rendered$Escape[0m"
  }
  [Console]::Out.WriteLine($Rendered)
}

function Write-WorkForgeLogEvent {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("debug", "info", "warning", "error")][string]$Level,
    [Parameter(Mandatory = $true)][string]$Event,
    [string]$Stage,
    [string]$Detail,
    [Nullable[long]]$DurationMs
  )

  if ($null -eq $script:WorkForgeUiContext -or [string]::IsNullOrWhiteSpace($script:WorkForgeUiContext.LogPath)) {
    return
  }

  $Payload = [ordered]@{
    time = [DateTimeOffset]::UtcNow.ToString("o")
    level = $Level
    operation = $script:WorkForgeUiContext.Operation
    event = $Event
  }
  if (-not [string]::IsNullOrWhiteSpace($Stage)) { $Payload.stage = $Stage }
  if (-not [string]::IsNullOrWhiteSpace($Detail)) {
    $Payload.detail = Protect-WorkForgeDisplayText -Text $Detail -ToolRoot $script:WorkForgeUiContext.ToolRoot
  }
  if ($null -ne $DurationMs) { $Payload.durationMs = [long]$DurationMs }

  $Line = ($Payload | ConvertTo-Json -Compress -Depth 5) + [Environment]::NewLine
  [IO.File]::AppendAllText($script:WorkForgeUiContext.LogPath, $Line, [Text.UTF8Encoding]::new($false))
}

function Get-WorkForgeStatusSymbol {
  param([ValidateSet("pending", "running", "success", "warning", "failed", "skipped")][string]$State)

  $Context = Get-WorkForgeUiContext
  if (-not $Context.Unicode) {
    switch ($State) {
      "pending" { return "[ ]" }
      "running" { return "[..]" }
      "success" { return "[OK]" }
      "warning" { return "[WARN]" }
      "failed" { return "[FAIL]" }
      "skipped" { return "[SKIP]" }
    }
  }
  return Get-WorkForgeGlyph -Name $State
}

function Get-WorkForgePanelLine {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][int]$InnerWidth
  )

  $Safe = $Text
  if ($Safe.Length -gt $InnerWidth) {
    $Safe = $Safe.Substring(0, [Math]::Max(1, $InnerWidth - 1)) + (Get-WorkForgeGlyph -Name "ellipsis")
  }
  return $Safe.PadRight($InnerWidth)
}

function Write-WorkForgePanel {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string[]]$Lines,
    [ValidateSet("text", "primary", "accent", "info", "success", "warning", "error", "muted")]
    [string]$Tone = "text"
  )

  $Context = Get-WorkForgeUiContext
  if ($Context.Plain) {
    Write-WorkForgeLine -Text $Title.ToUpperInvariant() -Tone $Tone
    foreach ($Line in $Lines) { Write-WorkForgeLine -Text "  $Line" }
    return
  }

  $Width = $Context.Width
  $Inner = $Width - 4
  $Horizontal = Get-WorkForgeGlyph -Name "horizontal"
  $Vertical = Get-WorkForgeGlyph -Name "vertical"
  $TopTitle = "$Horizontal $Title "
  $TopFill = [Math]::Max(0, $Width - $TopTitle.Length - 2)
  Write-WorkForgeLine -Text ((Get-WorkForgeGlyph -Name "topLeft") + $TopTitle + ($Horizontal * $TopFill) + (Get-WorkForgeGlyph -Name "topRight")) -Tone $Tone
  foreach ($Line in $Lines) {
    Write-WorkForgeLine -Text ($Vertical + " " + (Get-WorkForgePanelLine -Text $Line -InnerWidth $Inner) + " " + $Vertical) -Tone $Tone
  }
  Write-WorkForgeLine -Text ((Get-WorkForgeGlyph -Name "bottomLeft") + ($Horizontal * ($Width - 2)) + (Get-WorkForgeGlyph -Name "bottomRight")) -Tone $Tone
}

function Write-WorkForgeBanner {
  param(
    [Parameter(Mandatory = $true)][string]$Action,
    [string]$Subtitle = "Secure local workstation gateway"
  )

  $Context = Get-WorkForgeUiContext
  if ($Context.Plain) {
    Write-WorkForgeLine -Text ("WORKFORGE {0} {1}" -f $Action.ToUpperInvariant(), $Context.Version) -Tone "primary"
    Write-WorkForgeLine -Text $Subtitle -Tone "muted"
    return
  }

  Write-WorkForgePanel -Title ("WORKFORGE {0}  v{1}" -f $Action.ToUpperInvariant(), $Context.Version) -Lines @(
    $Subtitle,
    "Windows x64 | safe lifecycle | manual startup"
  ) -Tone "primary"
}

function Write-WorkForgePlan {
  param([Parameter(Mandatory = $true)][string[]]$Items)

  $Context = Get-WorkForgeUiContext
  Write-WorkForgeLine
  if ($Context.Plain) { Write-WorkForgeLine -Text "PLAN" -Tone "accent" }
  foreach ($Item in $Items) {
    $Symbol = Get-WorkForgeStatusSymbol -State "pending"
    Write-WorkForgeLine -Text ("  {0}  {1}" -f $Symbol, $Item) -Tone "muted"
  }
  Write-WorkForgeLine
}

function Start-WorkForgeStage {
  param(
    [Parameter(Mandatory = $true)][int]$Number,
    [Parameter(Mandatory = $true)][int]$Total,
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$Detail
  )

  $Context = Get-WorkForgeUiContext
  $SafeDetail = Protect-WorkForgeDisplayText -Text $Detail -ToolRoot $Context.ToolRoot
  if ($Context.Plain) {
    Write-WorkForgeLine -Text ("[{0}/{1}] {2}" -f $Number, $Total, $Name.ToUpperInvariant()) -Tone "primary"
  } else {
    $Suffix = if ([string]::IsNullOrWhiteSpace($SafeDetail)) { "" } else { "  $SafeDetail" }
    Write-WorkForgeLine -Text ("  {0}  {1}{2}" -f (Get-WorkForgeStatusSymbol -State "running"), $Name, $Suffix) -Tone "primary"
  }
  Write-WorkForgeLogEvent -Level "info" -Event "stage_started" -Stage $Name -Detail $SafeDetail
  return [pscustomobject]@{
    Number = $Number
    Total = $Total
    Name = $Name
    StartedAt = [DateTimeOffset]::UtcNow
  }
}

function Complete-WorkForgeStage {
  param(
    [Parameter(Mandatory = $true)][object]$Stage,
    [string]$Detail,
    [Nullable[long]]$DurationMs
  )

  $Context = Get-WorkForgeUiContext
  $Elapsed = if ($null -ne $DurationMs) { [long]$DurationMs } else { [long]([DateTimeOffset]::UtcNow - $Stage.StartedAt).TotalMilliseconds }
  $SafeDetail = Protect-WorkForgeDisplayText -Text $Detail -ToolRoot $Context.ToolRoot
  $Seconds = "{0:0.0}s" -f ($Elapsed / 1000.0)
  if ($Context.Plain) {
    $Suffix = if ([string]::IsNullOrWhiteSpace($SafeDetail)) { "" } else { ": $SafeDetail" }
    Write-WorkForgeLine -Text ("[OK] {0}{1} ({2})" -f $Stage.Name, $Suffix, $Seconds) -Tone "success"
  } else {
    $Suffix = if ([string]::IsNullOrWhiteSpace($SafeDetail)) { "" } else { "  $SafeDetail" }
    Write-WorkForgeLine -Text ("  {0}  {1}{2}  {3}" -f (Get-WorkForgeStatusSymbol -State "success"), $Stage.Name, $Suffix, $Seconds) -Tone "success"
  }
  Write-WorkForgeLogEvent -Level "info" -Event "stage_completed" -Stage $Stage.Name -Detail $SafeDetail -DurationMs $Elapsed
}

function Skip-WorkForgeStage {
  param(
    [Parameter(Mandatory = $true)][object]$Stage,
    [Parameter(Mandatory = $true)][string]$Reason
  )

  $Context = Get-WorkForgeUiContext
  $SafeReason = Protect-WorkForgeDisplayText -Text $Reason -ToolRoot $Context.ToolRoot
  if ($Context.Plain) {
    Write-WorkForgeLine -Text ("[SKIP] {0}: {1}" -f $Stage.Name, $SafeReason) -Tone "muted"
  } else {
    Write-WorkForgeLine -Text ("  {0}  {1}  {2}" -f (Get-WorkForgeStatusSymbol -State "skipped"), $Stage.Name, $SafeReason) -Tone "muted"
  }
  Write-WorkForgeLogEvent -Level "info" -Event "stage_skipped" -Stage $Stage.Name -Detail $SafeReason
}

function Fail-WorkForgeStage {
  param(
    [Parameter(Mandatory = $true)][object]$Stage,
    [Parameter(Mandatory = $true)][string]$Reason
  )

  $Context = Get-WorkForgeUiContext
  $Elapsed = [long]([DateTimeOffset]::UtcNow - $Stage.StartedAt).TotalMilliseconds
  $SafeReason = Protect-WorkForgeDisplayText -Text $Reason -ToolRoot $Context.ToolRoot
  if ($Context.Plain) {
    Write-WorkForgeLine -Text ("[FAIL] {0}: {1}" -f $Stage.Name, $SafeReason) -Tone "error"
  } else {
    Write-WorkForgeLine -Text ("  {0}  {1}  {2}" -f (Get-WorkForgeStatusSymbol -State "failed"), $Stage.Name, $SafeReason) -Tone "error"
  }
  Write-WorkForgeLogEvent -Level "error" -Event "stage_failed" -Stage $Stage.Name -Detail $SafeReason -DurationMs $Elapsed
}

function Write-WorkForgeDetail {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [ValidateSet("text", "primary", "accent", "info", "success", "warning", "error", "muted")]
    [string]$Tone = "muted"
  )

  $Context = Get-WorkForgeUiContext
  $Safe = Protect-WorkForgeDisplayText -Text $Text -ToolRoot $Context.ToolRoot
  $Prefix = if ($Context.Unicode) { "     " + (Get-WorkForgeGlyph -Name "bullet") + " " } else { "      " }
  Write-WorkForgeLine -Text ($Prefix + $Safe) -Tone $Tone
  Write-WorkForgeLogEvent -Level "info" -Event "detail" -Detail $Safe
}

function Write-WorkForgeNotice {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("info", "success", "warning", "error")][string]$Level,
    [Parameter(Mandatory = $true)][string]$Message
  )

  $Context = Get-WorkForgeUiContext
  $Safe = Protect-WorkForgeDisplayText -Text $Message -ToolRoot $Context.ToolRoot
  $State = switch ($Level) {
    "success" { "success" }
    "warning" { "warning" }
    "error" { "failed" }
    default { "running" }
  }
  $Label = switch ($Level) {
    "success" { "OK" }
    "warning" { "WARN" }
    "error" { "ERROR" }
    default { "INFO" }
  }
  if ($Context.Plain) {
    Write-WorkForgeLine -Text ("[{0}] {1}" -f $Label, $Safe) -Tone $Level
  } else {
    Write-WorkForgeLine -Text ("  {0}  {1}" -f (Get-WorkForgeStatusSymbol -State $State), $Safe) -Tone $Level
  }
  $LogLevel = if ($Level -eq "error") { "error" } elseif ($Level -eq "warning") { "warning" } else { "info" }
  Write-WorkForgeLogEvent -Level $LogLevel -Event "notice" -Detail $Safe
}

function Write-WorkForgeSummary {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][Collections.IDictionary]$Values,
    [ValidateSet("success", "info", "warning")][string]$Tone = "success"
  )

  $Context = Get-WorkForgeUiContext
  $Lines = [Collections.Generic.List[string]]::new()
  foreach ($Key in $Values.Keys) {
    $SafeValue = Protect-WorkForgeDisplayText -Text ([string]$Values[$Key]) -ToolRoot $Context.ToolRoot
    $Lines.Add(("{0,-12} {1}" -f ([string]$Key + ":"), $SafeValue))
  }
  Write-WorkForgeLine
  Write-WorkForgePanel -Title $Title -Lines @($Lines) -Tone $Tone
  if (-not [string]::IsNullOrWhiteSpace($Context.LogPath)) {
    $DisplayLog = Protect-WorkForgeDisplayText -Text $Context.LogPath -ToolRoot $Context.ToolRoot
    Write-WorkForgeLine -Text ("  Log  $DisplayLog") -Tone "muted"
  }
  Write-WorkForgeLogEvent -Level "info" -Event "operation_completed" -Detail $Title
}

function Write-WorkForgeErrorPanel {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Reason,
    [string]$Stage,
    [string]$Fix
  )

  $Context = Get-WorkForgeUiContext
  $Lines = [Collections.Generic.List[string]]::new()
  $Lines.Add("Reason: " + (Protect-WorkForgeDisplayText -Text $Reason -ToolRoot $Context.ToolRoot))
  if (-not [string]::IsNullOrWhiteSpace($Stage)) { $Lines.Add("Stage:  $Stage") }
  if (-not [string]::IsNullOrWhiteSpace($Fix)) { $Lines.Add("Fix:    $Fix") }
  Write-WorkForgeLine
  Write-WorkForgePanel -Title $Title -Lines @($Lines) -Tone "error"
  if (-not [string]::IsNullOrWhiteSpace($Context.LogPath)) {
    $DisplayLog = Protect-WorkForgeDisplayText -Text $Context.LogPath -ToolRoot $Context.ToolRoot
    Write-WorkForgeLine -Text ("  Details  $DisplayLog") -Tone "muted"
  }
  Write-WorkForgeLogEvent -Level "error" -Event "operation_failed" -Stage $Stage -Detail $Reason
}

function Read-WorkForgeChoice {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string[]]$Options,
    [int]$DefaultIndex = 0
  )

  if ($DefaultIndex -lt 0 -or $DefaultIndex -ge $Options.Count) { throw "Default choice index is invalid." }
  Write-WorkForgeLine
  Write-WorkForgeLine -Text $Title -Tone "accent"
  for ($Index = 0; $Index -lt $Options.Count; $Index++) {
    $Marker = if ($Index -eq $DefaultIndex) { ">" } else { " " }
    Write-WorkForgeLine -Text ("  {0} {1}. {2}" -f $Marker, ($Index + 1), $Options[$Index])
  }
  while ($true) {
    $Raw = Read-Host ("Select [{0}]" -f ($DefaultIndex + 1))
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $DefaultIndex }
    $Selected = 0
    if ([int]::TryParse($Raw, [ref]$Selected) -and $Selected -ge 1 -and $Selected -le $Options.Count) {
      return ($Selected - 1)
    }
    Write-WorkForgeNotice -Level "warning" -Message "Choose a number between 1 and $($Options.Count)."
  }
}

function Confirm-WorkForgePhrase {
  param(
    [Parameter(Mandatory = $true)][string]$Phrase,
    [Parameter(Mandatory = $true)][string]$Prompt
  )

  Write-WorkForgeNotice -Level "warning" -Message $Prompt
  $Observed = Read-Host ("Type $Phrase to continue")
  return $Observed -ceq $Phrase
}
