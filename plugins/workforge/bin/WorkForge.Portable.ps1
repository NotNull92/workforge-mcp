Set-StrictMode -Version 3.0

$script:WorkForgePortableLegacyCriticalFiles = @(
  ".workforge-release.json", "package.json", "runtime-lock.json", "dist\stdio.js",
  "runtimes\node\node.exe", "runtimes\ripgrep\rg.exe", "runtimes\tunnel-client\tunnel-client.exe",
  "scripts\Setup.ps1", "scripts\WorkForge.Portable.ps1", "scripts\Portable-Control.ps1", "scripts\Portable-Control.cmd"
)
$script:WorkForgePortableCriticalFiles = @(
  $script:WorkForgePortableLegacyCriticalFiles
  "scripts\Portable-Dispatch.ps1"
  "scripts\Portable-Dispatch.cmd"
)
$script:WorkForgePortableIntegrityRootFiles = @(
  ".workforge-release.json", "package.json", "runtime-lock.json",
  "Setup.cmd", "Install.cmd", "Configure Tunnel.cmd", "WorkForge Control.cmd", "Uninstall.cmd"
)
$script:WorkForgePortableIntegrityDirectories = @("dist", "scripts", "control-ui", "plugins", "templates", "runtimes")

function Get-WorkForgePortableIntegrityRelativePaths {
  param([Parameter(Mandatory = $true)][string]$Root)

  $ResolvedRoot = Assert-WorkForgePortablePath -Path $Root -Description "Portable integrity root"
  $RootPrefix = $ResolvedRoot.TrimEnd([char[]]@('\', '/'))
  $Paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($RelativePath in $script:WorkForgePortableIntegrityRootFiles) {
    $Item = Get-Item -LiteralPath (Join-Path $ResolvedRoot $RelativePath) -Force -ErrorAction Stop
    if ($Item.PSIsContainer -or ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Portable integrity file is invalid: $RelativePath"
    }
    $null = $Paths.Add($RelativePath)
  }
  foreach ($DirectoryName in $script:WorkForgePortableIntegrityDirectories) {
    $Directory = Get-Item -LiteralPath (Join-Path $ResolvedRoot $DirectoryName) -Force -ErrorAction Stop
    if (-not $Directory.PSIsContainer -or ($Directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Portable integrity directory is invalid: $DirectoryName"
    }
    foreach ($File in Get-ChildItem -LiteralPath $Directory.FullName -Recurse -Force -File) {
      if (($File.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Portable integrity tree cannot contain a reparse-point file: $($File.FullName)"
      }
      $RelativePath = $File.FullName.Substring($RootPrefix.Length).TrimStart([char[]]@('\', '/'))
      $null = $Paths.Add($RelativePath)
    }
  }
  return @($Paths | Sort-Object)
}

function Get-WorkForgePortableRoots {
  $ProgramsRoot = [Environment]::GetEnvironmentVariable("WORKFORGE_PORTABLE_PROGRAMS_ROOT", "Process")
  if ([string]::IsNullOrWhiteSpace($ProgramsRoot)) {
    $ProgramsRoot = Join-Path $env:LOCALAPPDATA "Programs\WorkForge"
  }
  $StateRoot = [Environment]::GetEnvironmentVariable("WORKFORGE_PORTABLE_STATE_ROOT", "Process")
  if ([string]::IsNullOrWhiteSpace($StateRoot)) {
    $StateRoot = Join-Path $env:LOCALAPPDATA "WorkForge\runtime"
  }
  if (-not [IO.Path]::IsPathRooted($ProgramsRoot) -or -not [IO.Path]::IsPathRooted($StateRoot)) {
    throw "Portable WorkForge roots must be absolute paths."
  }
  return [pscustomobject]@{
    ProgramsRoot = [IO.Path]::GetFullPath($ProgramsRoot)
    StateRoot = [IO.Path]::GetFullPath($StateRoot)
  }
}

function Read-WorkForgePortableJson {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Description
  )
  $Item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ($Item.PSIsContainer -or ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $Item.Length -gt 1048576) {
    throw "$Description must be a bounded regular file."
  }
  try {
    $Value = [IO.File]::ReadAllText($Item.FullName, [Text.UTF8Encoding]::new($false, $true)) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "$Description is not strict UTF-8 JSON."
  }
  if ($null -eq $Value) { throw "$Description is empty JSON." }
  return [pscustomobject]@{ Path = $Item.FullName; Value = $Value }
}

function Get-WorkForgeFileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)

  $Item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if ($Item.PSIsContainer -or ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "SHA-256 input must be a regular file."
  }
  $Stream = [IO.File]::Open($Item.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $Hasher = [Security.Cryptography.SHA256]::Create()
    try {
      return [BitConverter]::ToString($Hasher.ComputeHash($Stream)).Replace("-", "")
    } finally {
      $Hasher.Dispose()
    }
  } finally {
    $Stream.Dispose()
  }
}

function Assert-WorkForgePortablePath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Description
  )
  $FullPath = [IO.Path]::GetFullPath($Path)
  $Current = [IO.Path]::GetPathRoot($FullPath)
  foreach ($Segment in $FullPath.Substring($Current.Length).Split([char[]]@('\', '/'), [StringSplitOptions]::RemoveEmptyEntries)) {
    $Current = Join-Path $Current $Segment
    $Item = Get-Item -LiteralPath $Current -Force -ErrorAction Stop
    if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "$Description cannot traverse a reparse point."
    }
  }
  return $FullPath
}

function Write-WorkForgePortableAtomicJson {
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

function Get-WorkForgePortableRelease {
  param([Parameter(Mandatory = $true)][string]$SourceRoot)
  $ResolvedRoot = Assert-WorkForgePortablePath -Path $SourceRoot -Description "Portable release root"
  $Release = Read-WorkForgePortableJson -Path (Join-Path $ResolvedRoot ".workforge-release.json") -Description "Portable release manifest"
  $Value = $Release.Value
  if (
    [string]$Value.schemaVersion -cne "1" -or
    [string]$Value.product -cne "WorkForge" -or
    [string]$Value.distributionKind -cne "portable-release" -or
    [string]$Value.version -cnotmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$'
  ) {
    throw "Portable release manifest is invalid."
  }
  foreach ($RelativePath in $script:WorkForgePortableCriticalFiles) {
    $Item = Get-Item -LiteralPath (Join-Path $ResolvedRoot $RelativePath) -Force -ErrorAction Stop
    if ($Item.PSIsContainer -or ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Portable release critical file is invalid: $RelativePath"
    }
  }
  return [pscustomobject]@{ Root = $ResolvedRoot; Version = [string]$Value.version }
}

function Read-WorkForgePortableInstalledVersion {
  param(
    [Parameter(Mandatory = $true)][string]$EngineRoot,
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$ExpectedManifestHash
  )
  $ResolvedRoot = Assert-WorkForgePortablePath -Path $EngineRoot -Description "Portable engine"
  $Manifest = Read-WorkForgePortableJson -Path (Join-Path $ResolvedRoot ".workforge-install.json") -Description "Portable install manifest"
  if (-not [string]::IsNullOrWhiteSpace($ExpectedManifestHash)) {
    $ObservedManifestHash = Get-WorkForgeFileSha256 -Path $Manifest.Path
    if (-not $ObservedManifestHash.Equals($ExpectedManifestHash, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Portable install manifest failed its SHA-256 check."
    }
  }
  $SchemaVersion = [string]$Manifest.Value.schemaVersion
  if (($SchemaVersion -cne "1" -and $SchemaVersion -cne "2") -or [string]$Manifest.Value.version -cne $Version) {
    throw "Portable install manifest identity is invalid."
  }
  $Files = @($Manifest.Value.files)
  $ExpectedPaths = if ($SchemaVersion -ceq "1") {
    @($script:WorkForgePortableLegacyCriticalFiles | Sort-Object)
  } else {
    @(Get-WorkForgePortableIntegrityRelativePaths -Root $ResolvedRoot)
  }
  if ($Files.Count -ne $ExpectedPaths.Count) {
    throw "Portable install manifest has an invalid immutable file set."
  }
  $SeenPaths = @{}
  foreach ($Entry in $Files) {
    $RelativePath = [string]$Entry.path
    $ExpectedHash = [string]$Entry.sha256
    if (
      [string]::IsNullOrWhiteSpace($RelativePath) -or
      $ExpectedHash.Length -ne 64 -or
      $ExpectedHash -match '[^A-Fa-f0-9]' -or
      $RelativePath -notin $ExpectedPaths -or
      $SeenPaths.ContainsKey($RelativePath)
    ) {
      throw "Portable install manifest contains an invalid file entry."
    }
    $SeenPaths[$RelativePath] = $true
    $File = Get-Item -LiteralPath (Join-Path $ResolvedRoot $RelativePath) -Force -ErrorAction Stop
    if ($File.PSIsContainer -or ($File.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Portable engine immutable file is invalid: $RelativePath"
    }
    $ObservedHash = Get-WorkForgeFileSha256 -Path $File.FullName
    if (-not $ObservedHash.Equals($ExpectedHash, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Portable engine immutable file failed its SHA-256 check: $RelativePath"
    }
  }
  return [pscustomobject]@{ EngineRoot = $ResolvedRoot; Version = $Version; ManifestPath = $Manifest.Path; ManifestSchemaVersion = $SchemaVersion }
}

function Set-WorkForgePortableCurrent {
  param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$PreviousVersion
  )
  $Roots = Get-WorkForgePortableRoots
  $EngineRoot = Join-Path $Roots.ProgramsRoot ("versions\" + $Version)
  $Installed = Read-WorkForgePortableInstalledVersion -EngineRoot $EngineRoot -Version $Version
  $ManifestHash = (Get-WorkForgeFileSha256 -Path $Installed.ManifestPath).ToLowerInvariant()
  $Pointer = [ordered]@{
    schemaVersion = 1
    product = "WorkForge"
    version = $Version
    relativePath = "versions/$Version"
    installManifestSha256 = $ManifestHash
    previousVersion = $(if ([string]::IsNullOrWhiteSpace($PreviousVersion)) { $null } else { $PreviousVersion })
  }
  Write-WorkForgePortableAtomicJson -Path (Join-Path $Roots.ProgramsRoot "current.json") -Value $Pointer
  return $Installed
}

function Install-WorkForgePortableVersion {
  param([Parameter(Mandatory = $true)][string]$SourceRoot)
  $Release = Get-WorkForgePortableRelease -SourceRoot $SourceRoot
  $Roots = Get-WorkForgePortableRoots
  $VersionsRoot = Join-Path $Roots.ProgramsRoot "versions"
  $Destination = Join-Path $VersionsRoot $Release.Version
  New-Item -ItemType Directory -Path $VersionsRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $Roots.StateRoot -Force | Out-Null
  if (Test-Path -LiteralPath $Destination) {
    $null = Read-WorkForgePortableInstalledVersion -EngineRoot $Destination -Version $Release.Version
  } else {
    $Staging = Join-Path $VersionsRoot ("." + $Release.Version + ".staging-" + [guid]::NewGuid().ToString("N"))
    try {
      New-Item -ItemType Directory -Path $Staging -Force | Out-Null
      foreach ($Item in Get-ChildItem -LiteralPath $Release.Root -Force) {
        Copy-Item -LiteralPath $Item.FullName -Destination (Join-Path $Staging $Item.Name) -Recurse -Force
      }
      $IntegrityPaths = @(Get-WorkForgePortableIntegrityRelativePaths -Root $Staging)
      $Files = @(
        foreach ($RelativePath in $IntegrityPaths) {
          [ordered]@{
            path = $RelativePath
            sha256 = (Get-WorkForgeFileSha256 -Path (Join-Path $Staging $RelativePath)).ToLowerInvariant()
          }
        }
      )
      Write-WorkForgePortableAtomicJson -Path (Join-Path $Staging ".workforge-install.json") -Value ([ordered]@{
        schemaVersion = 2
        product = "WorkForge"
        version = $Release.Version
        files = $Files
      })
      [IO.Directory]::Move($Staging, $Destination)
    } finally {
      if (Test-Path -LiteralPath $Staging) { Remove-Item -LiteralPath $Staging -Recurse -Force }
    }
  }
  $CurrentPath = Join-Path $Roots.ProgramsRoot "current.json"
  $PreviousVersion = $null
  if (Test-Path -LiteralPath $CurrentPath -PathType Leaf) {
    $PreviousVersion = [string](Read-WorkForgePortableJson -Path $CurrentPath -Description "Portable current pointer").Value.version
    if ($PreviousVersion -ceq $Release.Version) { $PreviousVersion = $null }
  }
  $null = Set-WorkForgePortableCurrent -Version $Release.Version -PreviousVersion $PreviousVersion
  Copy-Item -LiteralPath (Join-Path $Destination "scripts\WorkForge.Portable.ps1") -Destination (Join-Path $Roots.ProgramsRoot "WorkForge.Portable.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $Destination "scripts\Portable-Control.ps1") -Destination (Join-Path $Roots.ProgramsRoot "Portable-Control.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $Destination "scripts\Portable-Control.cmd") -Destination (Join-Path $Roots.ProgramsRoot "WorkForge Control.cmd") -Force
  return Resolve-WorkForgePortableEngine
}

function Resolve-WorkForgePortableEngine {
  $Roots = Get-WorkForgePortableRoots
  $Pointer = Read-WorkForgePortableJson -Path (Join-Path $Roots.ProgramsRoot "current.json") -Description "Portable current pointer"
  $Value = $Pointer.Value
  $Version = [string]$Value.version
  if (
    [string]$Value.schemaVersion -cne "1" -or
    [string]$Value.product -cne "WorkForge" -or
    $Version -cnotmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$' -or
    [string]$Value.relativePath -cne "versions/$Version" -or
    [string]$Value.installManifestSha256 -cnotmatch '^[A-Fa-f0-9]{64}$'
  ) {
    throw "Portable current pointer is invalid."
  }
  $Installed = Read-WorkForgePortableInstalledVersion `
    -EngineRoot (Join-Path $Roots.ProgramsRoot ("versions\" + $Version)) `
    -Version $Version `
    -ExpectedManifestHash ([string]$Value.installManifestSha256)
  return [pscustomobject]@{
    Version = $Installed.Version
    EngineRoot = $Installed.EngineRoot
    StateRoot = $Roots.StateRoot
    NodePath = Join-Path $Installed.EngineRoot "runtimes\node\node.exe"
    RipgrepPath = Join-Path $Installed.EngineRoot "runtimes\ripgrep\rg.exe"
    TunnelClientPath = Join-Path $Installed.EngineRoot "runtimes\tunnel-client\tunnel-client.exe"
    StdioPath = Join-Path $Installed.EngineRoot "dist\stdio.js"
  }
}

function Invoke-WorkForgePortableRollback {
  $Roots = Get-WorkForgePortableRoots
  $Pointer = Read-WorkForgePortableJson -Path (Join-Path $Roots.ProgramsRoot "current.json") -Description "Portable current pointer"
  $CurrentVersion = [string]$Pointer.Value.version
  $PreviousVersion = [string]$Pointer.Value.previousVersion
  if ([string]::IsNullOrWhiteSpace($PreviousVersion) -or $PreviousVersion -ceq $CurrentVersion) {
    throw "Portable rollback has no prior version."
  }
  $null = Set-WorkForgePortableCurrent -Version $PreviousVersion -PreviousVersion $CurrentVersion
  return Resolve-WorkForgePortableEngine
}
