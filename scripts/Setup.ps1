[CmdletBinding()]
param(
  [ValidateSet("Auto", "Install", "Repair", "Upgrade")]
  [string]$Mode = "Auto",

  [string]$WorkspaceRoot = (Join-Path $env:USERPROFILE "WorkForge"),

  [string]$ProfileId = "workstation",

  [string]$DisplayName = "WorkForge",

  [string]$TunnelId,

  [switch]$SkipTunnelConfiguration,

  [switch]$ReconfigureTunnel,

  [switch]$SkipStart,

  [switch]$SkipOnlineDoctor,

  [switch]$NoBrowser,

  [switch]$SkipTunnelDownload,

  [switch]$NoDesktopShortcut,

  [switch]$InstallMissingPrerequisites,

  [switch]$InstallGit,

  [switch]$NonInteractive,

  [string]$RegistryPath,

  [switch]$Plain,

  [switch]$NoLog
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$Package = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "package.json") | ConvertFrom-Json -ErrorAction Stop
$Version = [string]$Package.version
$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
$ProfilePath = Join-Path $WorkspaceRoot "tools\workforge-mcp\profile.json"
$TunnelManagementUrl = "https://platform.openai.com/settings/organization/tunnels"
$ChatGptPluginsUrl = "https://chatgpt.com/plugins"
$OriginalRegistryEnvironment = [Environment]::GetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", "Process")
if (-not [string]::IsNullOrWhiteSpace($RegistryPath)) {
  $RegistryPath = [IO.Path]::GetFullPath($RegistryPath)
  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $RegistryPath, "Process")
}

. (Join-Path $PSScriptRoot "WorkForge.UI.ps1")
. (Join-Path $PSScriptRoot "profile-registry.ps1")
$SetupLogDirectory = if ($null -ne $script:WorkForgePortableRuntime) { Join-Path $script:WorkForgePortableRuntime.StateRoot "logs" } else { $null }
$Ui = Initialize-WorkForgeUi -Operation "setup" -Version $Version -ToolRoot $ToolRoot -Plain:$Plain -NoLog:$NoLog -LogDirectory $SetupLogDirectory
$CurrentStage = $null
$script:SetupStageDetail = $null

function Set-SetupStageDetail {
  param([string]$Detail)
  $script:SetupStageDetail = $Detail
}

function Invoke-SetupStage {
  param(
    [Parameter(Mandatory = $true)][int]$Number,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Body
  )

  $script:SetupStageDetail = $null
  $script:CurrentStage = Start-WorkForgeStage -Number $Number -Total 6 -Name $Name
  try {
    & $Body
    Complete-WorkForgeStage -Stage $script:CurrentStage -Detail $script:SetupStageDetail
  } catch {
    Fail-WorkForgeStage -Stage $script:CurrentStage -Reason $_.Exception.Message
    throw "Setup stage '$Name' failed: $($_.Exception.Message)"
  }
}

function Open-SetupPage {
  param([Parameter(Mandatory = $true)][string]$Url)

  if ($NoBrowser) {
    Write-WorkForgeDetail -Text "Browser handoff disabled: $Url" -Tone "muted"
    return
  }
  Start-Process $Url
}

function Test-ConfiguredTunnel {
  try {
    $null = Get-WorkForgeProfile -ProfileId $ProfileId -RequireTunnelConfig
    $null = Initialize-WorkForgeControlPlaneCredential
    return $true
  } catch {
    return $false
  }
}

$script:TunnelConfigured = $false
$ResolvedMode = $Mode
try {
  Write-WorkForgeBanner -Action "SETUP"
  Write-WorkForgePlan -Items @(
    "Environment",
    "Runtime and profile",
    "Secure tunnel",
    "Health check",
    "Tunnel start",
    "ChatGPT handoff"
  )

  Invoke-SetupStage -Number 1 -Name "Environment" -Body {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
      throw "WorkForge currently supports Windows only."
    }
    if (-not [Environment]::Is64BitOperatingSystem) {
      throw "WorkForge requires 64-bit Windows."
    }
    Write-WorkForgeDetail -Text "Engine root: $ToolRoot"
    Write-WorkForgeDetail -Text "Profile root: $WorkspaceRoot"
    Set-SetupStageDetail -Detail "Windows x64"
  }

  Invoke-SetupStage -Number 2 -Name "Runtime and profile" -Body {
    if ($ResolvedMode -eq "Auto") {
      $ResolvedMode = if (Test-Path -LiteralPath $ProfilePath -PathType Leaf) { "Repair" } else { "Install" }
    }
    $InstallParameters = @{
      WorkspaceRoot = $WorkspaceRoot
      ProfileId = $ProfileId
      DisplayName = $DisplayName
      Mode = $ResolvedMode
      Embedded = $true
      InstallMissingPrerequisites = [bool]$InstallMissingPrerequisites
      InstallGit = [bool]$InstallGit
      NonInteractive = [bool]$NonInteractive
      Plain = [bool]$Plain
      NoLog = [bool]$NoLog
      LogPath = Get-WorkForgeUiLogPath
    }
    if (-not [string]::IsNullOrWhiteSpace($RegistryPath)) { $InstallParameters.RegistryPath = $RegistryPath }
    if ($SkipTunnelDownload) { $InstallParameters.SkipTunnelDownload = $true }
    if ($NoDesktopShortcut) { $InstallParameters.NoDesktopShortcut = $true }
    & (Join-Path $PSScriptRoot "Install.ps1") @InstallParameters
    Set-SetupStageDetail -Detail $ResolvedMode
  }

  Invoke-SetupStage -Number 3 -Name "Secure tunnel" -Body {
    $script:TunnelConfigured = Test-ConfiguredTunnel
    if ($SkipTunnelConfiguration) {
      if ($TunnelConfigured) {
        Write-WorkForgeDetail -Text "Existing tunnel configuration and protected credential are valid." -Tone "success"
        Set-SetupStageDetail -Detail "existing configuration"
      } else {
        Write-WorkForgeDetail -Text "Tunnel configuration skipped by request."
        Set-SetupStageDetail -Detail "skipped"
      }
      return
    }

    if ($ReconfigureTunnel -or -not $TunnelConfigured) {
      if ($NonInteractive -and [string]::IsNullOrWhiteSpace($TunnelId)) {
        throw "Non-interactive setup requires -TunnelId or an existing valid tunnel configuration."
      }
      if (-not $NoBrowser) {
        Write-WorkForgeDetail -Text "Opening OpenAI tunnel management. Create or select a tunnel, then return here." -Tone "info"
        Open-SetupPage -Url $TunnelManagementUrl
      } else {
        Write-WorkForgeDetail -Text "OpenAI tunnel management: $TunnelManagementUrl" -Tone "info"
      }

      $ExistingKey = [Environment]::GetEnvironmentVariable("CONTROL_PLANE_API_KEY", "Process")
      if ($NonInteractive -and [string]::IsNullOrWhiteSpace($ExistingKey)) {
        try { $null = Initialize-WorkForgeControlPlaneCredential } catch {}
        $ExistingKey = [Environment]::GetEnvironmentVariable("CONTROL_PLANE_API_KEY", "Process")
        if ([string]::IsNullOrWhiteSpace($ExistingKey)) {
          throw "Non-interactive setup requires CONTROL_PLANE_API_KEY in the process environment or a valid protected credential file."
        }
      }

      $ConfigureParameters = @{ ProfileId = $ProfileId; SkipDoctor = $true }
      if (-not [string]::IsNullOrWhiteSpace($TunnelId)) { $ConfigureParameters.TunnelId = $TunnelId }
      & (Join-Path $PSScriptRoot "Configure-Tunnel.ps1") @ConfigureParameters
      $script:TunnelConfigured = Test-ConfiguredTunnel
      if (-not $TunnelConfigured) { throw "Tunnel configuration did not pass local validation." }
      Set-SetupStageDetail -Detail "configured"
    } else {
      Write-WorkForgeDetail -Text "Existing tunnel configuration and protected credential are valid." -Tone "success"
      Set-SetupStageDetail -Detail "existing configuration"
    }
  }

  Invoke-SetupStage -Number 4 -Name "Health check" -Body {
    if (-not $TunnelConfigured) {
      Write-WorkForgeDetail -Text "Doctor skipped because no validated tunnel configuration is available."
      Set-SetupStageDetail -Detail "skipped"
      return
    }
    $DoctorParameters = @{ ProfileId = $ProfileId }
    if (-not $SkipOnlineDoctor) { $DoctorParameters.Online = $true }
    & (Join-Path $PSScriptRoot "Doctor.ps1") @DoctorParameters
    Set-SetupStageDetail -Detail $(if ($SkipOnlineDoctor) { "local" } else { "online" })
  }

  Invoke-SetupStage -Number 5 -Name "Tunnel start" -Body {
    if (-not $TunnelConfigured) {
      Write-WorkForgeDetail -Text "Start skipped because no validated tunnel configuration is available."
      Set-SetupStageDetail -Detail "skipped"
      return
    }
    if ($SkipStart) {
      Write-WorkForgeDetail -Text "Tunnel start skipped by request."
      Set-SetupStageDetail -Detail "skipped"
      return
    }

    $AlreadyRunning = $false
    try {
      $SnapshotText = (& (Join-Path $PSScriptRoot "tunnel-status.ps1") -ProfileId $ProfileId -Snapshot | Out-String)
      $Snapshot = $SnapshotText | ConvertFrom-Json -ErrorAction Stop
      $AlreadyRunning = [bool]$Snapshot.running
    } catch {
      $AlreadyRunning = $false
    }
    if ($AlreadyRunning) {
      Write-WorkForgeDetail -Text "Tunnel profile $ProfileId is already running." -Tone "success"
      Set-SetupStageDetail -Detail "already running"
    } else {
      & (Join-Path $PSScriptRoot "start-tunnel.ps1") -ProfileId $ProfileId
      Set-SetupStageDetail -Detail "running"
    }
  }

  Invoke-SetupStage -Number 6 -Name "ChatGPT handoff" -Body {
    if (-not $TunnelConfigured) {
      Write-WorkForgeDetail -Text "ChatGPT handoff skipped until tunnel configuration is complete."
      Set-SetupStageDetail -Detail "skipped"
      return
    }
    Write-WorkForgeDetail -Text "Enable Settings > Security and login > Developer mode in ChatGPT." -Tone "info"
    Write-WorkForgeDetail -Text "On the Plugins page, choose Tunnel and select the same tunnel." -Tone "info"
    Open-SetupPage -Url $ChatGptPluginsUrl
    Set-SetupStageDetail -Detail $(if ($NoBrowser) { "instructions printed" } else { "Plugins opened" })
  }

  Write-WorkForgeSummary -Title "WORKFORGE READY" -Values ([ordered]@{
    Profile = $WorkspaceRoot
    Tunnel = $(if ($TunnelConfigured -and -not $SkipStart) { "live or already running" } elseif ($TunnelConfigured) { "configured" } else { "not configured" })
    Tools = "12 available after connection"
    Startup = "manual"
  }) -Tone "success"
  Write-WorkForgeNotice -Level "info" -Message "Nothing was registered to start with Windows."
} catch {
  try {
    Write-WorkForgeErrorPanel -Title "SETUP COULD NOT COMPLETE" -Reason $_.Exception.Message -Stage $(if ($null -ne $script:CurrentStage) { $script:CurrentStage.Name } else { "initialization" }) -Fix "Review the detail log, correct the reported problem, and run Setup.cmd again."
  } catch {}
  exit 1
} finally {
  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $OriginalRegistryEnvironment, "Process")
}
