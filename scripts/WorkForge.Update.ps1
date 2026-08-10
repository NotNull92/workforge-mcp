Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")

$script:WorkForgeUpdateApiUrl = "https://api.github.com/repos/NotNull92/workforge-mcp/releases/latest"
$script:WorkForgeUpdateDownloadPrefix = "https://github.com/NotNull92/workforge-mcp/releases/download/"
$script:WorkForgeUpdateUserAgent = "WorkForge-Updater"
$script:WorkForgeUpdateMaxArchiveBytes = 536870912

function ConvertTo-WorkForgeStableVersion {
  param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value -cnotmatch '^\d+\.\d+\.\d+$') { throw "WorkForge update versions must use stable semantic versioning." }
  return [version]$Value
}

function Resolve-WorkForgeReleaseMetadata {
  param(
    [Parameter(Mandatory = $true)][object]$Metadata,
    [Parameter(Mandatory = $true)][string]$CurrentVersion
  )

  if ([bool]$Metadata.draft -or [bool]$Metadata.prerelease) { throw "The latest WorkForge release is not a stable public release." }
  $Tag = [string]$Metadata.tag_name
  if ($Tag -cnotmatch '^v(\d+\.\d+\.\d+)$') { throw "The latest WorkForge release tag is invalid." }
  $LatestVersion = $Matches[1]
  if ($Tag -cne "v$LatestVersion") { throw "The latest WorkForge release tag is not canonical." }

  $ArchiveName = "WorkForge-v$LatestVersion-win-x64.zip"
  $ChecksumName = "$ArchiveName.sha256"
  $Assets = @($Metadata.assets)
  $ArchiveMatches = @($Assets | Where-Object { [string]$_.name -ceq $ArchiveName })
  $ChecksumMatches = @($Assets | Where-Object { [string]$_.name -ceq $ChecksumName })
  if ($ArchiveMatches.Count -ne 1 -or $ChecksumMatches.Count -ne 1) {
    throw "The latest WorkForge release is missing its exact Windows archive or checksum asset."
  }

  foreach ($Asset in @($ArchiveMatches[0], $ChecksumMatches[0])) {
    $Url = [string]$Asset.browser_download_url
    $Parsed = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$Parsed)) { throw "WorkForge release asset URL is invalid." }
    if ($Parsed.Scheme -cne "https" -or $Parsed.Host -cne "github.com" -or -not $Url.StartsWith($script:WorkForgeUpdateDownloadPrefix, [StringComparison]::Ordinal)) {
      throw "WorkForge release assets must come from the canonical GitHub release path."
    }
  }

  $Current = ConvertTo-WorkForgeStableVersion -Value $CurrentVersion
  $Latest = ConvertTo-WorkForgeStableVersion -Value $LatestVersion
  return [pscustomobject]@{
    CurrentVersion = $CurrentVersion
    LatestVersion = $LatestVersion
    UpdateAvailable = $Latest -gt $Current
    ArchiveName = $ArchiveName
    ArchiveUrl = [string]$ArchiveMatches[0].browser_download_url
    ChecksumName = $ChecksumName
    ChecksumUrl = [string]$ChecksumMatches[0].browser_download_url
    ReleaseUrl = [string]$Metadata.html_url
    PublishedAt = [string]$Metadata.published_at
  }
}

function Get-WorkForgeUpdateDescriptor {
  $CurrentRuntime = Resolve-WorkForgePortableEngine
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $Headers = @{ Accept = "application/vnd.github+json"; "User-Agent" = $script:WorkForgeUpdateUserAgent }
  $Metadata = Invoke-RestMethod -UseBasicParsing -Uri $script:WorkForgeUpdateApiUrl -Headers $Headers -Method Get -TimeoutSec 30
  return Resolve-WorkForgeReleaseMetadata -Metadata $Metadata -CurrentVersion $CurrentRuntime.Version
}

function Get-WorkForgeUpdateInfo {
  $Descriptor = Get-WorkForgeUpdateDescriptor
  return [pscustomobject]@{
    supported = $true
    currentVersion = $Descriptor.CurrentVersion
    latestVersion = $Descriptor.LatestVersion
    updateAvailable = [bool]$Descriptor.UpdateAvailable
    releaseUrl = $Descriptor.ReleaseUrl
    publishedAt = $Descriptor.PublishedAt
  }
}

function Receive-WorkForgeUpdateRelease {
  param([Parameter(Mandatory = $true)][object]$Descriptor)
  $Roots = Get-WorkForgePortableRoots
  $UpdatesRoot = Join-Path $Roots.StateRoot "updates"
  New-Item -ItemType Directory -Path $UpdatesRoot -Force | Out-Null
  $TempRoot = Join-Path $UpdatesRoot ("update-" + [guid]::NewGuid().ToString("N"))
  $ExtractRoot = Join-Path $TempRoot "extract"
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
  try {
    $ArchivePath = Join-Path $TempRoot $Descriptor.ArchiveName
    $ChecksumPath = Join-Path $TempRoot $Descriptor.ChecksumName
    $Headers = @{ "User-Agent" = $script:WorkForgeUpdateUserAgent }
    Invoke-WebRequest -UseBasicParsing -Uri $Descriptor.ArchiveUrl -Headers $Headers -OutFile $ArchivePath -TimeoutSec 120
    Invoke-WebRequest -UseBasicParsing -Uri $Descriptor.ChecksumUrl -Headers $Headers -OutFile $ChecksumPath -TimeoutSec 120

    $Archive = Get-Item -LiteralPath $ArchivePath -Force -ErrorAction Stop
    $Checksum = Get-Item -LiteralPath $ChecksumPath -Force -ErrorAction Stop
    if ($Archive.PSIsContainer -or $Archive.Length -lt 1 -or $Archive.Length -gt $script:WorkForgeUpdateMaxArchiveBytes) { throw "Downloaded WorkForge archive size is invalid." }
    if ($Checksum.PSIsContainer -or $Checksum.Length -lt 1 -or $Checksum.Length -gt 4096) { throw "Downloaded WorkForge checksum file size is invalid." }

    $HashLine = [IO.File]::ReadAllText($ChecksumPath, [Text.UTF8Encoding]::new($false, $true)).Trim()
    if ($HashLine -cnotmatch '^([a-f0-9]{64})\s+(.+)$') { throw "Downloaded WorkForge checksum syntax is invalid." }
    $ExpectedHash = $Matches[1]
    $ExpectedName = $Matches[2]
    if ($ExpectedName -cne $Descriptor.ArchiveName) { throw "Downloaded WorkForge checksum names a different archive." }
    $ObservedHash = (Get-WorkForgeFileSha256 -Path $ArchivePath).ToLowerInvariant()
    if ($ObservedHash -cne $ExpectedHash) { throw "Downloaded WorkForge archive failed its SHA-256 check." }

    New-Item -ItemType Directory -Path $ExtractRoot -Force | Out-Null
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force
    $Manifests = @(Get-ChildItem -LiteralPath $ExtractRoot -Recurse -Force -File -Filter ".workforge-release.json")
    if ($Manifests.Count -ne 1) { throw "Downloaded WorkForge archive must contain exactly one release manifest." }
    $ReleaseRoot = $Manifests[0].Directory.FullName
    $Release = Get-WorkForgePortableRelease -SourceRoot $ReleaseRoot
    if ($Release.ValidationBuild) { throw "Validation builds cannot be installed by the automatic updater." }
    if ($Release.Version -cne $Descriptor.LatestVersion) { throw "Downloaded WorkForge release version does not match GitHub metadata." }
    return [pscustomobject]@{ Root = $Release.Root; Version = $Release.Version; TempRoot = $TempRoot; Sha256 = $ObservedHash }
  } catch {
    if (Test-Path -LiteralPath $TempRoot) { Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue }
    throw
  }
}

function Get-WorkForgeUpdateProfileRecords {
  param([Parameter(Mandatory = $true)][string]$EngineRoot)

  $Roots = Get-WorkForgePortableRoots
  $RegistryPath = Join-Path $Roots.StateRoot "profile_registry.json"
  if (-not (Test-Path -LiteralPath $RegistryPath -PathType Leaf)) { return @() }

  # Reuse the active engine's strict registry/profile loader instead of creating a second updater trust path.
  $LoaderPath = Join-Path $EngineRoot "scripts\profile-registry.ps1"
  if (-not (Test-Path -LiteralPath $LoaderPath -PathType Leaf)) { throw "Active WorkForge engine is missing its profile loader." }
  $PowerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $EscapedLoader = $LoaderPath.Replace("'", "''")
  $Command = ". '$EscapedLoader'; `$registry = Get-WorkForgeRegistry; @(`$registry.Profiles | Select-Object Id,TunnelConfigPath) | ConvertTo-Json -Depth 4 -Compress"
  $JsonText = (& $PowerShellPath -NoProfile -ExecutionPolicy Bypass -Command $Command | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Active WorkForge profile loader rejected the registry during update preflight." }
  if ([string]::IsNullOrWhiteSpace($JsonText)) { return @() }

  $Parsed = $JsonText | ConvertFrom-Json -ErrorAction Stop
  $Records = @()
  foreach ($Profile in @($Parsed)) {
    $Id = [string]$Profile.Id
    $TunnelConfigPath = [string]$Profile.TunnelConfigPath
    if ($Id -cnotmatch '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$' -or -not [IO.Path]::IsPathRooted($TunnelConfigPath)) {
      throw "Active WorkForge profile loader returned an invalid update target."
    }
    $Records += [pscustomobject]@{ Id = $Id; TunnelConfigPath = [IO.Path]::GetFullPath($TunnelConfigPath) }
  }
  return $Records
}

function Get-WorkForgeUpdateTunnelRunning {
  param(
    [Parameter(Mandatory = $true)][string]$EngineRoot,
    [Parameter(Mandatory = $true)][string]$ProfileId
  )
  $Text = (& (Join-Path $EngineRoot "scripts\tunnel-status.ps1") -ProfileId $ProfileId -Snapshot | Out-String)
  $Snapshot = $Text | ConvertFrom-Json -ErrorAction Stop
  return [bool]$Snapshot.running
}

function Write-WorkForgeUpdateAtomicBytes {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][byte[]]$Bytes
  )
  $Temporary = "$Path.update.$PID.$([guid]::NewGuid().ToString('N'))"
  $Backup = "$Path.update-backup.$PID.$([guid]::NewGuid().ToString('N'))"
  try {
    [IO.File]::WriteAllBytes($Temporary, $Bytes)
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

function Invoke-WorkForgeTransactionalUpgrade {
  param([Parameter(Mandatory = $true)][string]$SourceRoot)

  $CurrentRuntime = Resolve-WorkForgePortableEngine
  $Release = Get-WorkForgePortableRelease -SourceRoot $SourceRoot
  if ((ConvertTo-WorkForgeStableVersion -Value $Release.Version) -le (ConvertTo-WorkForgeStableVersion -Value $CurrentRuntime.Version)) {
    throw "Transactional update requires a version newer than the active WorkForge engine."
  }

  # Full immutable-engine hashing happens before any tunnel is stopped or current.json changes.
  $null = Stage-WorkForgePortableVersion -SourceRoot $SourceRoot
  $Profiles = @(Get-WorkForgeUpdateProfileRecords -EngineRoot $CurrentRuntime.EngineRoot)
  $ProfileStates = @()
  foreach ($Profile in $Profiles) {
    $ConfigBytes = $null
    $Configured = Test-Path -LiteralPath $Profile.TunnelConfigPath -PathType Leaf
    if ($Configured) {
      $ConfigItem = Get-Item -LiteralPath $Profile.TunnelConfigPath -Force -ErrorAction Stop
      if ($ConfigItem.PSIsContainer -or ($ConfigItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $ConfigItem.Length -gt 1048576) {
        throw "Tunnel config is unsafe for transactional update: $($Profile.Id)"
      }
      $ConfigBytes = [IO.File]::ReadAllBytes($ConfigItem.FullName)
    }
    $Running = if ($Configured) { Get-WorkForgeUpdateTunnelRunning -EngineRoot $CurrentRuntime.EngineRoot -ProfileId $Profile.Id } else { $false }
    $ProfileStates += [pscustomobject]@{ Id = $Profile.Id; TunnelConfigPath = $Profile.TunnelConfigPath; Configured = $Configured; ConfigBytes = $ConfigBytes; WasRunning = $Running }
  }

  $ActivationAttempted = $false
  $Activated = $false
  $NewRuntime = $null
  try {
    foreach ($State in $ProfileStates | Where-Object { $_.WasRunning }) {
      & (Join-Path $CurrentRuntime.EngineRoot "scripts\stop-tunnel.ps1") -ProfileId $State.Id | Out-Null
    }

    $ActivationAttempted = $true
    $NewRuntime = Activate-WorkForgePortableVersion -Version $Release.Version -PreviousVersion $CurrentRuntime.Version
    $Activated = $true

    foreach ($State in $ProfileStates | Where-Object { $_.Configured }) {
      & (Join-Path $NewRuntime.EngineRoot "scripts\Configure-Tunnel.ps1") -ProfileId $State.Id -RebindRuntime -SkipDoctor | Out-Null
      & (Join-Path $NewRuntime.EngineRoot "scripts\Doctor.ps1") -ProfileId $State.Id | Out-Null
    }
    foreach ($State in $ProfileStates | Where-Object { $_.WasRunning }) {
      & (Join-Path $NewRuntime.EngineRoot "scripts\start-tunnel.ps1") -ProfileId $State.Id | Out-Null
    }

    return [pscustomobject]@{
      Updated = $true
      PreviousVersion = $CurrentRuntime.Version
      Version = $NewRuntime.Version
      ProfilesRebound = @($ProfileStates | Where-Object { $_.Configured }).Count
      ProfilesRestarted = @($ProfileStates | Where-Object { $_.WasRunning }).Count
    }
  } catch {
    $OriginalError = $_.Exception.Message
    $RollbackIssues = [Collections.Generic.List[string]]::new()

    if ($Activated -and $null -ne $NewRuntime) {
      foreach ($State in $ProfileStates | Where-Object { $_.WasRunning }) {
        try { & (Join-Path $NewRuntime.EngineRoot "scripts\stop-tunnel.ps1") -ProfileId $State.Id | Out-Null } catch { $RollbackIssues.Add("stop-new:$($State.Id)") }
      }
    }
    foreach ($State in $ProfileStates | Where-Object { $_.Configured }) {
      try { Write-WorkForgeUpdateAtomicBytes -Path $State.TunnelConfigPath -Bytes $State.ConfigBytes } catch { $RollbackIssues.Add("restore-config:$($State.Id)") }
    }
    if ($ActivationAttempted) {
      try { $null = Activate-WorkForgePortableVersion -Version $CurrentRuntime.Version -PreviousVersion $Release.Version } catch { $RollbackIssues.Add("restore-engine") }
    }
    foreach ($State in $ProfileStates | Where-Object { $_.WasRunning }) {
      try {
        $RunningNow = Get-WorkForgeUpdateTunnelRunning -EngineRoot $CurrentRuntime.EngineRoot -ProfileId $State.Id
        if (-not $RunningNow) { & (Join-Path $CurrentRuntime.EngineRoot "scripts\start-tunnel.ps1") -ProfileId $State.Id | Out-Null }
      } catch {
        $RollbackIssues.Add("restart-old:$($State.Id)")
      }
    }

    $Suffix = if ($RollbackIssues.Count -eq 0) { "Rollback completed." } else { "Rollback had issues: $($RollbackIssues -join ', ')." }
    throw "WorkForge update failed: $OriginalError $Suffix"
  }
}
