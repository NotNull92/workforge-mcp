[CmdletBinding()]
param(
  [string]$WorkspaceRoot = (Join-Path $env:USERPROFILE "WorkForge"),

  [string]$ProfileId = "workstation",

  [string]$DisplayName = "WorkForge",

  [ValidateSet("Install", "Repair", "Upgrade")]
  [string]$Mode = "Install",

  [switch]$Force,

  [switch]$SkipTunnelDownload,

  [switch]$NoDesktopShortcut,

  [string]$RegistryPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$WorkspaceRoot = [IO.Path]::GetFullPath($WorkspaceRoot)
$ProfileDirectory = Join-Path $WorkspaceRoot "tools\workforge-mcp"
$ProfilePath = Join-Path $ProfileDirectory "profile.json"
if ([string]::IsNullOrWhiteSpace($RegistryPath)) {
  $RegistryPath = Join-Path $ToolRoot "runtime\profile_registry.json"
} else {
  $RegistryPath = [IO.Path]::GetFullPath($RegistryPath)
}
$TemplateRoot = Join-Path $ToolRoot "templates\workstation"
$Utf8 = [Text.UTF8Encoding]::new($false)
$StrictUtf8 = [Text.UTF8Encoding]::new($false, $true)

if ($Force) {
  Write-Warning "-Force is deprecated. Using Repair mode without overwriting profile policy files."
  $Mode = "Repair"
}

function Read-StrictJson {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Description
  )

  try {
    $Text = [IO.File]::ReadAllText($Path, $StrictUtf8)
    $Value = $Text | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "$Description is not valid strict UTF-8 JSON: $Path"
  }
  if ($null -eq $Value) { throw "$Description is empty JSON: $Path" }
  return $Value
}

function Write-AtomicUtf8 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $Parent = [IO.Path]::GetDirectoryName($Path)
  New-Item -ItemType Directory -Path $Parent -Force | Out-Null
  $Temporary = "$Path.tmp.$PID.$([guid]::NewGuid().ToString('N'))"
  $Backup = "$Path.bak.$PID.$([guid]::NewGuid().ToString('N'))"
  try {
    [IO.File]::WriteAllText($Temporary, $Content, $Utf8)
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

function Get-RequiredApplication {
  param([Parameter(Mandatory = $true)][string]$Name)

  $Command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue
  if (-not $Command) { throw "Required command is missing: $Name" }
  return $Command.Source
}

function Test-PrebuiltRuntime {
  $StdioPath = Join-Path $ToolRoot "dist\stdio.js"
  if (-not (Test-Path -LiteralPath $StdioPath -PathType Leaf)) {
    return [pscustomobject]@{ Ready = $false; Reason = "dist/stdio.js is missing" }
  }

  $PackagePath = Join-Path $ToolRoot "package.json"
  $Package = Read-StrictJson -Path $PackagePath -Description "MCP package manifest"
  foreach ($PackageName in @("@modelcontextprotocol/sdk", "zod")) {
    $Property = $Package.dependencies.PSObject.Properties[$PackageName]
    if ($null -eq $Property -or [string]::IsNullOrWhiteSpace([string]$Property.Value)) {
      return [pscustomobject]@{ Ready = $false; Reason = "package.json is missing $PackageName" }
    }
    $InstalledPath = Join-Path $ToolRoot ("node_modules\" + $PackageName.Replace("/", "\") + "\package.json")
    if (-not (Test-Path -LiteralPath $InstalledPath -PathType Leaf)) {
      return [pscustomobject]@{ Ready = $false; Reason = "production dependency $PackageName is missing" }
    }
    $Installed = Read-StrictJson -Path $InstalledPath -Description "Installed dependency $PackageName"
    if ([string]$Installed.version -cne [string]$Property.Value) {
      return [pscustomobject]@{ Ready = $false; Reason = "production dependency $PackageName has the wrong version" }
    }
  }

  return [pscustomobject]@{ Ready = $true; Reason = "prebuilt dist and production dependencies are valid" }
}

function Install-UserTemplate {
  param([Parameter(Mandatory = $true)][string]$Name)

  $Source = Join-Path $TemplateRoot $Name
  $Destination = Join-Path $WorkspaceRoot $Name
  if (-not (Test-Path -LiteralPath $Destination -PathType Leaf)) {
    Copy-Item -LiteralPath $Source -Destination $Destination
    return
  }

  if ($Mode -eq "Upgrade") {
    $SourceHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
    $DestinationHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
    if (-not $SourceHash.Equals($DestinationHash, [StringComparison]::OrdinalIgnoreCase)) {
      $Candidate = "$Destination.new"
      if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
        Copy-Item -LiteralPath $Source -Destination $Candidate
      } elseif (-not $SourceHash.Equals((Get-FileHash -LiteralPath $Candidate -Algorithm SHA256).Hash, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Warning "Existing upgrade candidate is user-modified and was preserved: $Candidate"
      }
    }
  }
}

function Ensure-IdentityMarker {
  $Name = "workstation.marker"
  $Source = Join-Path $TemplateRoot $Name
  $Destination = Join-Path $WorkspaceRoot $Name
  if (-not (Test-Path -LiteralPath $Destination -PathType Leaf)) {
    Copy-Item -LiteralPath $Source -Destination $Destination
    return
  }

  $ExpectedHash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash
  $ObservedHash = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash
  if (-not $ExpectedHash.Equals($ObservedHash, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Existing workstation identity marker does not match the WorkForge template: $Destination"
  }
}

function Merge-ProfileRegistry {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$CurrentProfilePath,
    [Parameter(Mandatory = $true)][string]$CurrentProfileHash
  )

  $OutputEntries = [Collections.Generic.List[object]]::new()
  $SeenIds = @{}
  $SeenPaths = @{}
  $CurrentPathKey = $CurrentProfilePath.ToLowerInvariant()
  $Replaced = $false
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    $Registry = Read-StrictJson -Path $Path -Description "WorkForge profile registry"
    if ([string]$Registry.version -cne "1") { throw "WorkForge profile registry has an unsupported version." }
    $Entries = @($Registry.profiles)
    if ($Entries.Count -gt 256) { throw "WorkForge profile registry contains too many profiles." }
    foreach ($Entry in $Entries) {
      if ($null -eq $Entry) { throw "WorkForge profile registry contains a null entry." }
      $EntryId = [string]$Entry.id
      $EntryPath = [string]$Entry.profilePath
      $EntryHash = [string]$Entry.profileSha256
      if (
        $EntryId -cnotmatch '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$' -or
        [string]::IsNullOrWhiteSpace($EntryPath) -or
        $EntryPath.Length -gt 32768 -or
        $EntryHash -cnotmatch '^[A-Fa-f0-9]{64}$'
      ) {
        throw "WorkForge profile registry contains an invalid entry."
      }
      if ($SeenIds.ContainsKey($EntryId)) { throw "WorkForge profile registry contains duplicate profile id $EntryId." }
      $SeenIds[$EntryId] = $true
      if (-not [IO.Path]::IsPathRooted($EntryPath)) { throw "WorkForge profile $EntryId must use an absolute profile path." }
      $NormalizedEntryPath = [IO.Path]::GetFullPath($EntryPath)
      $EntryPathKey = $NormalizedEntryPath.ToLowerInvariant()
      if ($SeenPaths.ContainsKey($EntryPathKey)) {
        throw "WorkForge profile registry points multiple ids at the same profile path: $EntryPath"
      }
      $SeenPaths[$EntryPathKey] = $EntryId
      if ($EntryId -ceq $ProfileId) {
        if ($SeenPaths.ContainsKey($CurrentPathKey) -and [string]$SeenPaths[$CurrentPathKey] -cne $ProfileId) {
          throw "WorkForge profile path is already registered under a different id: $($SeenPaths[$CurrentPathKey])"
        }
        $SeenPaths[$CurrentPathKey] = $ProfileId
        $OutputEntries.Add([ordered]@{
          id = $ProfileId
          profilePath = $CurrentProfilePath
          profileSha256 = $CurrentProfileHash
        })
        $Replaced = $true
        continue
      }
      if ($NormalizedEntryPath.Equals($CurrentProfilePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw "WorkForge profile path is already registered under a different id: $EntryId"
      }
      $OutputEntries.Add($Entry)
    }
  }

  if (-not $Replaced) {
    $OutputEntries.Add([ordered]@{
      id = $ProfileId
      profilePath = $CurrentProfilePath
      profileSha256 = $CurrentProfileHash
    })
  }
  if ($OutputEntries.Count -lt 1 -or $OutputEntries.Count -gt 256) {
    throw "WorkForge profile registry must contain between 1 and 256 profiles."
  }

  $Payload = [ordered]@{ version = 1; profiles = @($OutputEntries) }
  Write-AtomicUtf8 -Path $Path -Content (($Payload | ConvertTo-Json -Depth 8) + [Environment]::NewLine)
}

function Ensure-TunnelClient {
  $Version = "v0.0.10"
  $ExpectedExeHash = "D893D8127EEE35070D265C1BE29BFE008F8D9FCB476E7FEBF56C8FDC6C0615C8"
  $InstallRoot = Join-Path $ToolRoot "runtime\tunnel-client\$Version"
  $InstalledPath = Join-Path $InstallRoot "tunnel-client.exe"
  if (Test-Path -LiteralPath $InstalledPath -PathType Leaf) {
    $Observed = (Get-FileHash -LiteralPath $InstalledPath -Algorithm SHA256).Hash
    if ($Observed.Equals($ExpectedExeHash, [StringComparison]::OrdinalIgnoreCase)) {
      Write-Output "Verified existing tunnel-client $Version."
      return
    }
  }

  if ($SkipTunnelDownload) {
    Write-Output "Tunnel-client download skipped by request."
    return
  }

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ArchiveName = "tunnel-client-$Version-windows-amd64.zip"
  $BaseUrl = "https://github.com/openai/tunnel-client/releases/download/$Version"
  $DownloadRoot = Join-Path $ToolRoot "runtime\downloads\$Version"
  $ArchivePath = Join-Path $DownloadRoot $ArchiveName
  $SumsPath = Join-Path $DownloadRoot "SHA256SUMS.txt"
  New-Item -ItemType Directory -Path $DownloadRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$ArchiveName" -OutFile $ArchivePath
  Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/SHA256SUMS.txt" -OutFile $SumsPath
  $SumLine = @(Get-Content -LiteralPath $SumsPath | Where-Object { $_ -match ([regex]::Escape($ArchiveName) + '$') })
  if ($SumLine.Count -ne 1 -or $SumLine[0] -notmatch '^([a-fA-F0-9]{64})\s+') {
    throw "Official archive checksum was not found."
  }
  $ExpectedArchiveHash = $Matches[1]
  $ObservedArchiveHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
  if (-not $ObservedArchiveHash.Equals($ExpectedArchiveHash, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Tunnel-client archive checksum mismatch."
  }

  $ExtractRoot = Join-Path $DownloadRoot ("extracted-" + [guid]::NewGuid().ToString("N"))
  try {
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force
    $Candidates = @(Get-ChildItem -LiteralPath $ExtractRoot -Recurse -File -Filter "tunnel-client.exe")
    if ($Candidates.Count -ne 1) { throw "Expected exactly one tunnel-client.exe in the official archive." }
    $ObservedExeHash = (Get-FileHash -LiteralPath $Candidates[0].FullName -Algorithm SHA256).Hash
    if (-not $ObservedExeHash.Equals($ExpectedExeHash, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Tunnel-client executable checksum mismatch."
    }
    Copy-Item -LiteralPath $Candidates[0].FullName -Destination $InstalledPath -Force
  } finally {
    if (Test-Path -LiteralPath $ExtractRoot) { Remove-Item -LiteralPath $ExtractRoot -Recurse -Force }
  }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw "WorkForge currently supports Windows only."
}
if ($ProfileId -cnotmatch "^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$") { throw "ProfileId is invalid." }
if ([string]::IsNullOrWhiteSpace($DisplayName) -or $DisplayName.Length -gt 80) { throw "DisplayName is invalid." }

$ProfileExists = Test-Path -LiteralPath $ProfilePath -PathType Leaf
if ($Mode -eq "Install" -and $ProfileExists) {
  throw "Profile already exists. Run Repair or Upgrade after reviewing it: $ProfilePath"
}
if (($Mode -eq "Repair" -or $Mode -eq "Upgrade") -and -not $ProfileExists) {
  throw "$Mode requires an existing profile: $ProfilePath"
}

$NodePath = Get-RequiredApplication -Name "node.exe"
$null = Get-RequiredApplication -Name "git.exe"
$null = Get-RequiredApplication -Name "rg.exe"
$NodeVersion = (& $NodePath -p "process.versions.node").Trim()
if ([version]$NodeVersion -lt [version]"20.0.0") { throw "Node.js 20 or newer is required; found $NodeVersion." }
$NodeArchitecture = (& $NodePath -p "process.arch").Trim()
if ($NodeArchitecture -cne "x64") { throw "This release supports Windows x64 only; found Node architecture $NodeArchitecture." }

$Runtime = Test-PrebuiltRuntime
if ($Runtime.Ready) {
  Write-Output "Using prebuilt MCP runtime; npm build and tests are skipped."
} else {
  $NpmPath = Get-RequiredApplication -Name "npm.cmd"
  Write-Output "Prebuilt runtime unavailable ($($Runtime.Reason)); building the source checkout."
  & $NpmPath --prefix $ToolRoot ci --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
  & $NpmPath --prefix $ToolRoot run check
  if ($LASTEXITCODE -ne 0) { throw "MCP build or test failed." }
  $Runtime = Test-PrebuiltRuntime
  if (-not $Runtime.Ready) { throw "MCP build completed without a valid prebuilt runtime: $($Runtime.Reason)" }
}

New-Item -ItemType Directory -Path $WorkspaceRoot -Force | Out-Null
New-Item -ItemType Directory -Path $ProfileDirectory -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $WorkspaceRoot "artifacts\workforge-mcp") -Force | Out-Null
foreach ($Name in @("AGENTS.md", "README.md", "WORKSTATION_POLICY.md", ".gitignore")) {
  Install-UserTemplate -Name $Name
}
Ensure-IdentityMarker

if (-not (Test-Path -LiteralPath (Join-Path $WorkspaceRoot ".git") -PathType Container)) {
  & git.exe -C $WorkspaceRoot init --initial-branch=main | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not initialize the profile repository." }
}

if (-not $ProfileExists) {
  $Profile = [ordered]@{
    id = $ProfileId
    displayName = $DisplayName
    appName = $DisplayName
    serverName = "workforge-$ProfileId-mcp"
    defaultWorkingDirectoryRelative = "."
    httpPort = 2198
    bootstrapFiles = @("AGENTS.md", "README.md", "WORKSTATION_POLICY.md")
    identityMarkers = @([ordered]@{ relativePath = "workstation.marker"; expectedLiteral = "identity=workforge-workstation" })
  }
  [IO.File]::WriteAllText($ProfilePath, ($Profile | ConvertTo-Json -Depth 6) + [Environment]::NewLine, $Utf8)
} else {
  $ExistingProfile = Read-StrictJson -Path $ProfilePath -Description "Existing workforge profile"
  if ($ExistingProfile.id -isnot [string] -or $ExistingProfile.id -cne $ProfileId) {
    throw "Existing profile id does not match the requested profile: $ProfilePath"
  }
}

$ProfileHash = (Get-FileHash -LiteralPath $ProfilePath -Algorithm SHA256).Hash.ToLowerInvariant()
Merge-ProfileRegistry -Path $RegistryPath -CurrentProfilePath ([IO.Path]::GetFullPath($ProfilePath)) -CurrentProfileHash $ProfileHash
Ensure-TunnelClient

if (-not $NoDesktopShortcut) {
  $Desktop = [Environment]::GetFolderPath("Desktop")
  if ($Desktop -and (Test-Path -LiteralPath $Desktop -PathType Container)) {
    $Shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $Desktop "WorkForge Control.lnk"))
    $Shortcut.TargetPath = (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe")
    $Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $ToolRoot 'scripts\Control.ps1')`""
    $Shortcut.WorkingDirectory = $ToolRoot
    $Shortcut.Save()
  }
}

Write-Output "WorkForge $Mode completed."
Write-Output "Profile root: $WorkspaceRoot"
Write-Output "Registry: $RegistryPath"
$TunnelConfigPath = Join-Path $ProfileDirectory "tunnel.local.yaml"
if (Test-Path -LiteralPath $TunnelConfigPath -PathType Leaf) {
  Write-Output "Tunnel configuration preserved. Run Doctor or Start from WorkForge Control."
} else {
  Write-Output "Next: configure your OpenAI tunnel through Setup.cmd or Configure Tunnel.cmd."
}
