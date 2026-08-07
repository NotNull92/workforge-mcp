[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [ValidateSet("Prompt", "KeepWorkspace", "RemoveEverything")]
  [string]$Mode = "Prompt",

  [string]$WorkspaceRoot = (Join-Path $env:USERPROFILE "WorkForge"),

  [string]$ProfileId = "workstation",

  [string]$RegistryPath,

  [string]$DesktopDirectory = ([Environment]::GetFolderPath("Desktop")),

  [switch]$ConfirmFullRemoval,

  [switch]$NonInteractive,

  [switch]$KeepEngine,

  [switch]$Plain,

  [switch]$NoLog,

  [switch]$Embedded
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$Package = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "package.json") | ConvertFrom-Json -ErrorAction Stop
$Version = [string]$Package.version
$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd([char[]]@('\', '/'))
if ([string]::IsNullOrWhiteSpace($RegistryPath)) {
  $RegistryPath = Join-Path $ToolRoot "runtime\profile_registry.json"
} else {
  $RegistryPath = [IO.Path]::GetFullPath($RegistryPath)
}
$ProfileDirectory = Join-Path $WorkspaceRoot "tools\workforge-mcp"
$ProfilePath = Join-Path $ProfileDirectory "profile.json"
$ArtifactDirectory = Join-Path $WorkspaceRoot "artifacts\workforge-mcp"
$MarkerPath = Join-Path $WorkspaceRoot "workstation.marker"
$OriginalRegistryEnvironment = [Environment]::GetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", "Process")
[Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $RegistryPath, "Process")

. (Join-Path $PSScriptRoot "WorkForge.UI.ps1")
. (Join-Path $PSScriptRoot "profile-registry.ps1")

$UninstallLogDirectory = Join-Path ([IO.Path]::GetTempPath()) "WorkForge\logs"
$Ui = Initialize-WorkForgeUi -Operation "uninstall" -Version $Version -ToolRoot $ToolRoot -Plain:$Plain -NoLog:$NoLog -LogDirectory $UninstallLogDirectory
$script:UninstallWhatIf = [bool]$WhatIfPreference
$WhatIfPreference = $false


function Test-UninstallShouldProcess {
  param(
    [Parameter(Mandatory = $true)][string]$Target,
    [Parameter(Mandatory = $true)][string]$Action
  )

  if ($script:UninstallWhatIf) {
    Write-WorkForgeNotice -Level "info" -Message ("WhatIf: {0}: {1}" -f $Action, $Target)
    return $false
  }
  return $true
}
function Assert-SafeRemovalDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Description
  )

  $FullPath = [IO.Path]::GetFullPath($Path).TrimEnd([char[]]@('\', '/'))
  $Root = [IO.Path]::GetPathRoot($FullPath).TrimEnd([char[]]@('\', '/'))
  if ($FullPath.Equals($Root, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Description cannot be a drive root."
  }
  $UserProfile = [Environment]::GetFolderPath("UserProfile").TrimEnd([char[]]@('\', '/'))
  if ($FullPath.Equals($UserProfile, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Description cannot be the user profile root."
  }
  if ($FullPath.Equals($ToolRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Description cannot be the WorkForge engine root."
  }
  if (Test-Path -LiteralPath $FullPath) {
    $null = Assert-WorkForgePathHasNoReparsePoint -Path $FullPath -Description $Description
  }
  return $FullPath
}

function Write-UninstallAtomicJson {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Value
  )

  $Parent = [IO.Path]::GetDirectoryName($Path)
  New-Item -ItemType Directory -Path $Parent -Force | Out-Null
  $Temporary = "$Path.tmp.$PID.$([guid]::NewGuid().ToString('N'))"
  $Backup = "$Path.bak.$PID.$([guid]::NewGuid().ToString('N'))"
  try {
    [IO.File]::WriteAllText($Temporary, (($Value | ConvertTo-Json -Depth 8) + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      [IO.File]::Replace($Temporary, $Path, $Backup, $true)
    } else {
      [IO.File]::Move($Temporary, $Path)
    }
  } finally {
    Remove-Item -LiteralPath $Temporary -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $Backup -Force -ErrorAction SilentlyContinue
  }
}

function Get-UninstallRegistryState {
  if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) {
    throw "WorkForge profile registry is missing: $RegistryPath"
  }
  $RegistryJson = Read-WorkForgeUtf8Json -Path $RegistryPath -MaximumBytes 1048576 -Description "WorkForge profile registry"
  if ([string]$RegistryJson.Value.version -cne "1") {
    throw "WorkForge profile registry has an unsupported version."
  }
  $Entries = @($RegistryJson.Value.profiles)
  $Matches = @($Entries | Where-Object { [string]$_.id -ceq $ProfileId })
  if ($Matches.Count -ne 1) {
    throw "WorkForge profile $ProfileId is not registered exactly once."
  }
  $ExpectedProfilePath = [IO.Path]::GetFullPath($ProfilePath)
  if (-not ([IO.Path]::GetFullPath([string]$Matches[0].profilePath)).Equals($ExpectedProfilePath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Registered profile path does not match the requested workspace."
  }
  return [pscustomobject]@{
    Entries = $Entries
    Remaining = @($Entries | Where-Object { [string]$_.id -cne $ProfileId })
  }
}

function Remove-UninstallRegistryEntry {
  param([Parameter(Mandatory = $true)][object]$State)

  if (-not (Test-UninstallShouldProcess -Target $RegistryPath -Action "Remove profile $ProfileId from the WorkForge registry")) {
    return $State.Remaining.Count
  }
  if ($State.Remaining.Count -eq 0) {
    Remove-Item -LiteralPath $RegistryPath -Force -ErrorAction Stop
  } else {
    Write-UninstallAtomicJson -Path $RegistryPath -Value ([ordered]@{ version = 1; profiles = @($State.Remaining) })
  }
  return $State.Remaining.Count
}

function Get-ReleaseEngineState {
  $ManifestPath = Join-Path $ToolRoot ".workforge-release.json"
  if (Test-Path -LiteralPath (Join-Path $ToolRoot ".git")) {
    return [pscustomobject]@{ Kind = "source"; ManifestPath = $null; ManifestHash = $null; Reason = "Source checkout detected." }
  }
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    return [pscustomobject]@{ Kind = "unknown"; ManifestPath = $null; ManifestHash = $null; Reason = "Release manifest is missing." }
  }
  $Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json -ErrorAction Stop
  if (
    [string]$Manifest.schemaVersion -cne "1" -or
    [string]$Manifest.product -cne "WorkForge" -or
    [string]$Manifest.distributionKind -cne "release"
  ) {
    throw "WorkForge release manifest is invalid."
  }
  $null = Assert-WorkForgePathHasNoReparsePoint -Path $ToolRoot -Description "WorkForge release engine"
  return [pscustomobject]@{
    Kind = "release"
    ManifestPath = $ManifestPath
    ManifestHash = (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash
    Reason = "Verified release distribution."
  }
}

function Test-TunnelRuntimeState {
  param([Parameter(Mandatory = $true)][object]$Profile)

  $Paths = Get-WorkForgeTunnelRuntimePaths -Profile $Profile
  foreach ($Path in @($Paths.TunnelPidPath, $Paths.SupervisorPidPath, $Paths.DesiredRunningPath, $Paths.HealthUrlPath)) {
    if (Test-Path -LiteralPath $Path) { return $true }
  }
  return $false
}

function Remove-VerifiedShortcut {
  if ([string]::IsNullOrWhiteSpace($DesktopDirectory)) {
    return [pscustomobject]@{ Removed = $false; Detail = "Desktop directory is unavailable." }
  }
  $ShortcutPath = Join-Path $DesktopDirectory "WorkForge Control.lnk"
  if (-not (Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) {
    return [pscustomobject]@{ Removed = $false; Detail = "Shortcut was not present." }
  }

  $Shell = New-Object -ComObject WScript.Shell
  $Shortcut = $Shell.CreateShortcut($ShortcutPath)
  $ExpectedTarget = (Get-WorkForgePowerShellExecutablePath)
  $ExpectedControl = [IO.Path]::GetFullPath((Join-Path $ToolRoot "scripts\Control.ps1"))
  $ObservedTarget = [IO.Path]::GetFullPath([string]$Shortcut.TargetPath)
  $Arguments = [string]$Shortcut.Arguments
  $WorkingDirectory = [IO.Path]::GetFullPath([string]$Shortcut.WorkingDirectory)
  if (
    -not $ObservedTarget.Equals($ExpectedTarget, [StringComparison]::OrdinalIgnoreCase) -or
    $Arguments.IndexOf($ExpectedControl, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    -not $WorkingDirectory.Equals($ToolRoot, [StringComparison]::OrdinalIgnoreCase)
  ) {
    return [pscustomobject]@{ Removed = $false; Detail = "Shortcut target did not match this WorkForge engine and was preserved." }
  }

  if (Test-UninstallShouldProcess -Target $ShortcutPath -Action "Remove the verified WorkForge shortcut") {
    Remove-Item -LiteralPath $ShortcutPath -Force -ErrorAction Stop
    return [pscustomobject]@{ Removed = $true; Detail = "Verified shortcut removed." }
  }
  return [pscustomobject]@{ Removed = $false; Detail = "Shortcut removal previewed." }
}

function Remove-UninstallPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Description,
    [switch]$Recurse
  )

  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  if (Test-UninstallShouldProcess -Target $Path -Action "Remove $Description") {
    if ($Recurse) {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    } else {
      Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
    }
    return $true
  }
  return $false
}

function Schedule-ReleaseEngineRemoval {
  param([Parameter(Mandatory = $true)][object]$EngineState)

  $FinalizerSource = Join-Path $PSScriptRoot "uninstall-finalizer.ps1"
  if (-not (Test-Path -LiteralPath $FinalizerSource -PathType Leaf)) {
    throw "Uninstall finalizer is missing."
  }
  $FinalizerDirectory = Join-Path ([IO.Path]::GetTempPath()) ("WorkForge-Finalizer-" + [guid]::NewGuid().ToString("N"))
  $FinalizerPath = Join-Path $FinalizerDirectory "uninstall-finalizer.ps1"
  $ResultDirectory = Join-Path ([IO.Path]::GetTempPath()) "WorkForge\uninstall-results"
  $ResultPath = Join-Path $ResultDirectory ("uninstall-$([DateTimeOffset]::UtcNow.ToString('yyyyMMdd-HHmmss'))-$PID.json")
  New-Item -ItemType Directory -Path $FinalizerDirectory -Force | Out-Null
  New-Item -ItemType Directory -Path $ResultDirectory -Force | Out-Null
  Copy-Item -LiteralPath $FinalizerSource -Destination $FinalizerPath -Force

  $PowerShellPath = Get-WorkForgePowerShellExecutablePath
  $Arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$FinalizerPath`"",
    "-ParentProcessId", [string]$PID,
    "-EngineRoot", "`"$ToolRoot`"",
    "-ExpectedManifestSha256", $EngineState.ManifestHash,
    "-ResultPath", "`"$ResultPath`""
  ) -join " "
  Start-Process -FilePath $PowerShellPath -ArgumentList $Arguments -WindowStyle Hidden | Out-Null
  return $ResultPath
}

function Confirm-StandardUninstall {
  Write-WorkForgeNotice -Level "warning" -Message "WorkForge runtime data and the local credential will be removed. Your workspace files will be preserved."
  $Answer = Read-Host "Continue? [y/N]"
  return $Answer -match '^(?i:y|yes)$'
}

$CurrentStage = $null
try {
  Write-WorkForgeBanner -Action "UNINSTALL" -Subtitle "Remove the gateway without leaving a loose thread"

  if ($Mode -eq "Prompt") {
    if ($NonInteractive) { throw "Non-interactive uninstall requires an explicit -Mode." }
    $Selection = Read-WorkForgeChoice -Title "What should be removed?" -Options @(
      "Remove WorkForge, keep my workspace (recommended)",
      "Remove WorkForge and all local profile data",
      "Cancel"
    ) -DefaultIndex 0
    if ($Selection -eq 2) {
      Write-WorkForgeNotice -Level "info" -Message "Uninstall cancelled."
      if ($Embedded) { return }
      exit 0
    }
    $Mode = if ($Selection -eq 0) { "KeepWorkspace" } else { "RemoveEverything" }
  }

  Write-WorkForgePlan -Items @(
    "Verify installation identity",
    "Stop the secure tunnel",
    "Detach the profile registry",
    "Remove shortcut and local runtime data",
    $(if ($Mode -eq "RemoveEverything") { "Remove the workspace permanently" } else { "Preserve the workspace" }),
    "Remove the verified release engine when safe"
  )

  $CurrentStage = Start-WorkForgeStage -Number 1 -Total 7 -Name "Preflight"
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "WorkForge uninstall currently supports Windows only."
  }
  $WorkspaceRoot = Assert-SafeRemovalDirectory -Path $WorkspaceRoot -Description "WorkForge workspace"
  if (-not (Test-Path -LiteralPath $ProfilePath -PathType Leaf)) {
    throw "WorkForge profile manifest is missing: $ProfilePath"
  }
  if (-not (Test-Path -LiteralPath $MarkerPath -PathType Leaf)) {
    throw "WorkForge identity marker is missing: $MarkerPath"
  }
  $Marker = (Get-Content -Raw -LiteralPath $MarkerPath).Trim()
  if ($Marker -cne "identity=workforge-workstation") {
    throw "WorkForge identity marker does not match the expected installation."
  }
  $Profile = Get-WorkForgeProfile -ProfileId $ProfileId
  if (-not $Profile.RepoRoot.Equals($WorkspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved profile root does not match the requested workspace."
  }
  $RegistryState = Get-UninstallRegistryState
  $EngineState = Get-ReleaseEngineState
  $IsLastProfile = $RegistryState.Remaining.Count -eq 0
  Complete-WorkForgeStage -Stage $CurrentStage -Detail ("{0}; engine {1}" -f $(if ($IsLastProfile) { "last profile" } else { "$($RegistryState.Remaining.Count) profile(s) remain" }), $EngineState.Kind)

  $CurrentStage = Start-WorkForgeStage -Number 2 -Total 7 -Name "Confirmation"
  if (-not $WhatIfPreference) {
    if ($Mode -eq "RemoveEverything") {
      if ($NonInteractive) {
        if (-not $ConfirmFullRemoval) {
          throw "RemoveEverything requires -ConfirmFullRemoval in non-interactive mode."
        }
      } elseif (-not (Confirm-WorkForgePhrase -Phrase "REMOVE WORKFORGE" -Prompt "This permanently removes the profile repository, policy files, logs, and command evidence.")) {
        throw "Full removal confirmation phrase did not match."
      }
    } elseif (-not $NonInteractive -and -not (Confirm-StandardUninstall)) {
      Write-WorkForgeNotice -Level "info" -Message "Uninstall cancelled."
      if ($Embedded) { return }
      exit 0
    }
  }
  Complete-WorkForgeStage -Stage $CurrentStage -Detail $(if ($WhatIfPreference) { "WhatIf preview" } else { $Mode })

  $CurrentStage = Start-WorkForgeStage -Number 3 -Total 7 -Name "Secure tunnel"
  if (Test-TunnelRuntimeState -Profile $Profile) {
    if (Test-UninstallShouldProcess -Target "WorkForge tunnel profile $ProfileId" -Action "Stop the tunnel and supervisor") {
      & (Join-Path $PSScriptRoot "stop-tunnel.ps1") -ProfileId $ProfileId
      Complete-WorkForgeStage -Stage $CurrentStage -Detail "Tunnel and supervisor stopped"
    } else {
      Skip-WorkForgeStage -Stage $CurrentStage -Reason "Tunnel stop previewed"
    }
  } else {
    Skip-WorkForgeStage -Stage $CurrentStage -Reason "No running tunnel state was recorded"
  }

  $CurrentStage = Start-WorkForgeStage -Number 4 -Total 7 -Name "Profile registry"
  $RemainingProfileCount = Remove-UninstallRegistryEntry -State $RegistryState
  Complete-WorkForgeStage -Stage $CurrentStage -Detail ("{0} profile(s) remain" -f $RemainingProfileCount)

  $CurrentStage = Start-WorkForgeStage -Number 5 -Total 7 -Name "Shortcut"
  $ShortcutResult = Remove-VerifiedShortcut
  if ($ShortcutResult.Removed) {
    Complete-WorkForgeStage -Stage $CurrentStage -Detail $ShortcutResult.Detail
  } else {
    Skip-WorkForgeStage -Stage $CurrentStage -Reason $ShortcutResult.Detail
  }

  $CurrentStage = Start-WorkForgeStage -Number 6 -Total 7 -Name "Local data"
  $LocalCredentialPath = Join-Path $ToolRoot "runtime\.env.local"
  if ($IsLastProfile) {
    $null = Remove-UninstallPath -Path $LocalCredentialPath -Description "the protected local runtime credential"
  }

  if ($Mode -eq "RemoveEverything") {
    $null = Remove-UninstallPath -Path $WorkspaceRoot -Description "the complete WorkForge workspace" -Recurse
    Complete-WorkForgeStage -Stage $CurrentStage -Detail "Workspace removal requested"
  } else {
    $null = Remove-UninstallPath -Path $ProfileDirectory -Description "profile configuration" -Recurse
    $null = Remove-UninstallPath -Path $ArtifactDirectory -Description "runtime logs and command evidence" -Recurse
    Complete-WorkForgeStage -Stage $CurrentStage -Detail "Workspace preserved"
  }

  if ($IsLastProfile -and ($KeepEngine -or $EngineState.Kind -ne "release")) {
    $RuntimeDirectory = Join-Path $ToolRoot "runtime"
    $null = Remove-UninstallPath -Path $RuntimeDirectory -Description "shared WorkForge runtime data" -Recurse
  }

  $CurrentStage = Start-WorkForgeStage -Number 7 -Total 7 -Name "Engine"
  $EngineRemovalScheduled = $false
  $FinalizerResultPath = $null
  if (-not $IsLastProfile) {
    Skip-WorkForgeStage -Stage $CurrentStage -Reason "Other registered profiles still use this engine"
  } elseif ($KeepEngine) {
    Skip-WorkForgeStage -Stage $CurrentStage -Reason "Engine preservation was requested"
  } elseif ($EngineState.Kind -eq "source") {
    Skip-WorkForgeStage -Stage $CurrentStage -Reason "Source checkout protected"
  } elseif ($EngineState.Kind -ne "release") {
    Skip-WorkForgeStage -Stage $CurrentStage -Reason $EngineState.Reason
  } elseif (Test-UninstallShouldProcess -Target $ToolRoot -Action "Schedule removal of the verified WorkForge release engine") {
    $FinalizerResultPath = Schedule-ReleaseEngineRemoval -EngineState $EngineState
    $EngineRemovalScheduled = $true
    Complete-WorkForgeStage -Stage $CurrentStage -Detail "Release engine removal scheduled"
  } else {
    Skip-WorkForgeStage -Stage $CurrentStage -Reason "Engine removal previewed"
  }

  $Summary = [ordered]@{
    Mode = $Mode
    Workspace = $(if ($Mode -eq "RemoveEverything") { "removed" } else { "preserved" })
    Profiles = [string]$RemainingProfileCount
    Engine = $(if ($EngineRemovalScheduled) { "scheduled" } elseif ($KeepEngine) { "preserved" } else { $EngineState.Kind })
    Startup = "unchanged (manual)"
  }
  if ($FinalizerResultPath) { $Summary.Finalizer = $FinalizerResultPath }
  Write-WorkForgeSummary -Title "UNINSTALL COMPLETE" -Values $Summary -Tone "success"
  Write-WorkForgeNotice -Level "warning" -Message "The local credential file was removed when this was the last profile. Any Platform runtime key was not revoked."
} catch {
  if ($null -ne $CurrentStage) {
    try { Fail-WorkForgeStage -Stage $CurrentStage -Reason $_.Exception.Message } catch {}
  }
  try {
    Write-WorkForgeErrorPanel -Title "UNINSTALL STOPPED" -Reason $_.Exception.Message -Stage $(if ($null -ne $CurrentStage) { $CurrentStage.Name } else { "initialization" }) -Fix "Review the target paths and run the uninstall again."
  } catch {}
  if ($Embedded) { throw }
  exit 1
} finally {
  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $OriginalRegistryEnvironment, "Process")
}
