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

  [switch]$NonInteractive,

  [string]$RegistryPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
$ProfilePath = Join-Path $WorkspaceRoot "tools\workforge-mcp\profile.json"
$TunnelManagementUrl = "https://platform.openai.com/settings/organization/tunnels"
$ChatGptPluginsUrl = "https://chatgpt.com/plugins"
$OriginalRegistryEnvironment = [Environment]::GetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", "Process")
if (-not [string]::IsNullOrWhiteSpace($RegistryPath)) {
  $RegistryPath = [IO.Path]::GetFullPath($RegistryPath)
  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $RegistryPath, "Process")
}

. (Join-Path $PSScriptRoot "profile-registry.ps1")

function Invoke-SetupStage {
  param(
    [Parameter(Mandatory = $true)][int]$Number,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Body
  )

  Write-Host ""
  Write-Host "[$Number/6] $Name" -ForegroundColor Cyan
  try {
    & $Body
  } catch {
    throw "Setup stage '$Name' failed: $($_.Exception.Message)"
  }
}

function Open-SetupPage {
  param([Parameter(Mandatory = $true)][string]$Url)

  if ($NoBrowser) {
    Write-Output "Browser handoff disabled: $Url"
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

$TunnelConfigured = $false
$ResolvedMode = $Mode
try {
  Invoke-SetupStage -Number 1 -Name "environment" -Body {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
      throw "WorkForge currently supports Windows only."
    }
    if (-not [Environment]::Is64BitOperatingSystem) {
      throw "WorkForge requires 64-bit Windows."
    }
    Write-Output "Engine root: $ToolRoot"
    Write-Output "Profile root: $WorkspaceRoot"
  }

  Invoke-SetupStage -Number 2 -Name "install" -Body {
    if ($ResolvedMode -eq "Auto") {
      $ResolvedMode = if (Test-Path -LiteralPath $ProfilePath -PathType Leaf) { "Repair" } else { "Install" }
    }
    $InstallParameters = @{
      WorkspaceRoot = $WorkspaceRoot
      ProfileId = $ProfileId
      DisplayName = $DisplayName
      Mode = $ResolvedMode
    }
    if (-not [string]::IsNullOrWhiteSpace($RegistryPath)) { $InstallParameters.RegistryPath = $RegistryPath }
    if ($SkipTunnelDownload) { $InstallParameters.SkipTunnelDownload = $true }
    if ($NoDesktopShortcut) { $InstallParameters.NoDesktopShortcut = $true }
    & (Join-Path $PSScriptRoot "Install.ps1") @InstallParameters
  }

  Invoke-SetupStage -Number 3 -Name "tunnel configuration" -Body {
    $TunnelConfigured = Test-ConfiguredTunnel
    if ($SkipTunnelConfiguration) {
      if ($TunnelConfigured) {
        Write-Output "Existing tunnel configuration and protected credential are valid."
      } else {
        Write-Output "Tunnel configuration skipped by request."
      }
      return
    }

    if ($ReconfigureTunnel -or -not $TunnelConfigured) {
      if ($NonInteractive -and [string]::IsNullOrWhiteSpace($TunnelId)) {
        throw "Non-interactive setup requires -TunnelId or an existing valid tunnel configuration."
      }
      if (-not $NoBrowser) {
        Write-Output "Opening OpenAI tunnel management. Create or select a tunnel, then return here."
        Open-SetupPage -Url $TunnelManagementUrl
      } else {
        Write-Output "OpenAI tunnel management: $TunnelManagementUrl"
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
      $TunnelConfigured = Test-ConfiguredTunnel
      if (-not $TunnelConfigured) { throw "Tunnel configuration did not pass local validation." }
    } else {
      Write-Output "Existing tunnel configuration and protected credential are valid."
    }
  }

  Invoke-SetupStage -Number 4 -Name "doctor" -Body {
    if (-not $TunnelConfigured) {
      Write-Output "Doctor skipped because no validated tunnel configuration is available."
      return
    }
    $DoctorParameters = @{ ProfileId = $ProfileId }
    if (-not $SkipOnlineDoctor) { $DoctorParameters.Online = $true }
    & (Join-Path $PSScriptRoot "Doctor.ps1") @DoctorParameters
  }

  Invoke-SetupStage -Number 5 -Name "start" -Body {
    if (-not $TunnelConfigured) {
      Write-Output "Start skipped because no validated tunnel configuration is available."
      return
    }
    if ($SkipStart) {
      Write-Output "Tunnel start skipped by request."
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
      Write-Output "Tunnel profile $ProfileId is already running."
    } else {
      & (Join-Path $PSScriptRoot "start-tunnel.ps1") -ProfileId $ProfileId
    }
  }

  Invoke-SetupStage -Number 6 -Name "ChatGPT handoff" -Body {
    if (-not $TunnelConfigured) {
      Write-Output "ChatGPT handoff skipped until tunnel configuration is complete."
      return
    }
    Write-Output "In ChatGPT, enable Settings > Security and login > Developer mode."
    Write-Output "Then select the plus button on the Plugins page, choose Tunnel, and select or enter the same tunnel."
    Open-SetupPage -Url $ChatGptPluginsUrl
  }

  Write-Host ""
  Write-Host "WorkForge setup completed." -ForegroundColor Green
  Write-Host "Windows startup was not registered; after a reboot the tunnel remains stopped."
} finally {
  [Environment]::SetEnvironmentVariable("WORKFORGE_MCP_PROFILE_REGISTRY", $OriginalRegistryEnvironment, "Process")
}
