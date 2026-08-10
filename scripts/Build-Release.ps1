[CmdletBinding()]
param(
  [string]$OutputDirectory,
  [switch]$ThirdPartyLicenseReviewApproved,
  [switch]$ValidationBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$Package = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "package.json") | ConvertFrom-Json
$RuntimeLock = Get-Content -Raw -LiteralPath (Join-Path $ToolRoot "runtime-lock.json") | ConvertFrom-Json -ErrorAction Stop
$Version = [string]$Package.version
if ($Version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw "package.json version is invalid." }
if ([string]$RuntimeLock.schemaVersion -cne "1" -or [string]$RuntimeLock.product -cne "WorkForge") {
  throw "runtime-lock.json is invalid."
}
if (-not $ThirdPartyLicenseReviewApproved -and -not $ValidationBuild) {
  throw "Portable release creation requires -ThirdPartyLicenseReviewApproved. Use -ValidationBuild only for isolated non-public QA."
}
if ($ValidationBuild -and [string]::IsNullOrWhiteSpace($OutputDirectory)) {
  throw "Validation builds require an explicit temporary -OutputDirectory."
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $ReleaseRoot = Join-Path $ToolRoot "release"
} else {
  $ReleaseRoot = [IO.Path]::GetFullPath($OutputDirectory)
}
$ArchiveName = "WorkForge-v$Version-win-x64.zip"
$ArchivePath = Join-Path $ReleaseRoot $ArchiveName
$HashPath = "$ArchivePath.sha256"
$StagingParent = Join-Path $env:TEMP ("WorkForgeMcp-Release-" + [guid]::NewGuid().ToString("N"))
$StagingRoot = Join-Path $StagingParent "WorkForge"
$Include = @(
  ".gitattributes", ".gitignore", "AGENTS.md", "Setup.cmd", "Configure Tunnel.cmd", "WorkForge Control.cmd", "Install.cmd", "Uninstall.cmd",
  "README.md", "README.ko.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md", "LICENSE", "package.json", "package-lock.json",
  "runtime-lock.json", "tsconfig.json", "control-ui", "docs", "plugins", "scripts", "src", "templates", "tests", "dist"
)

function Expand-LockedRuntime {
  param(
    [Parameter(Mandatory = $true)][object]$Entry,
    [Parameter(Mandatory = $true)][string]$Name
  )
  $ArchivePath = Join-Path $StagingParent ("download-" + [string]$Entry.archiveName)
  $ExtractRoot = Join-Path $StagingParent ("extract-" + $Name)
  Invoke-WebRequest -UseBasicParsing -Uri ([string]$Entry.url) -OutFile $ArchivePath
  $ObservedHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
  if (-not $ObservedHash.Equals([string]$Entry.sha256, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Locked runtime archive checksum mismatch: $Name"
  }
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $ExtractRoot -Force
  return $ExtractRoot
}

function Save-RuntimeLicenses {
  param(
    [Parameter(Mandatory = $true)][object]$Entry,
    [Parameter(Mandatory = $true)][string]$Name
  )
  $LicenseRoot = Join-Path $StagingRoot ("licenses\" + $Name)
  New-Item -ItemType Directory -Path $LicenseRoot -Force | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri ([string]$Entry.licenseUrl) -OutFile (Join-Path $LicenseRoot "LICENSE.txt")
  $AdditionalProperty = $Entry.PSObject.Properties["additionalLicenseUrls"]
  if ($null -ne $AdditionalProperty) {
    $Index = 0
    foreach ($Url in @($AdditionalProperty.Value)) {
      $Index += 1
      Invoke-WebRequest -UseBasicParsing -Uri ([string]$Url) -OutFile (Join-Path $LicenseRoot ("LICENSE-$Index.txt"))
    }
  }
}

function Get-StagedRelativePath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return $Path.Substring($StagingRoot.Length).TrimStart([char[]]@('\', '/')).Replace('/', '\')
}

& npm.cmd --prefix $ToolRoot run check
if ($LASTEXITCODE -ne 0) { throw "Repository validation failed before release staging." }

New-Item -ItemType Directory -Path $StagingRoot -Force | Out-Null
try {
  foreach ($RelativePath in $Include) {
    $Source = Join-Path $ToolRoot $RelativePath
    if (-not (Test-Path -LiteralPath $Source)) { throw "Release input is missing: $RelativePath" }
    Copy-Item -LiteralPath $Source -Destination (Join-Path $StagingRoot $RelativePath) -Recurse -Force
  }

  $ReleaseManifest = [ordered]@{
    schemaVersion = 1
    product = "WorkForge"
    version = $Version
    distributionKind = "portable-release"
    validationBuild = [bool]$ValidationBuild
  }
  [IO.File]::WriteAllText(
    (Join-Path $StagingRoot ".workforge-release.json"),
    (($ReleaseManifest | ConvertTo-Json -Depth 4) + [Environment]::NewLine),
    [Text.UTF8Encoding]::new($false)
  )

  & npm.cmd --prefix $StagingRoot ci --omit=dev --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "Production dependency staging failed." }

  foreach ($PackageName in @("@modelcontextprotocol/sdk", "zod")) {
    $Expected = [string]$Package.dependencies.PSObject.Properties[$PackageName].Value
    $Manifest = Join-Path $StagingRoot ("node_modules\" + $PackageName.Replace('/', '\') + "\package.json")
    if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) { throw "Staged runtime dependency is missing: $PackageName" }
    $Installed = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json
    if ([string]$Installed.version -cne $Expected) { throw "Staged runtime dependency version mismatch: $PackageName" }
  }

  foreach ($DevPackagePath in @(
    "node_modules\typescript\package.json",
    "node_modules\vitest\package.json",
    "node_modules\@types\node\package.json"
  )) {
    if (Test-Path -LiteralPath (Join-Path $StagingRoot $DevPackagePath) -PathType Leaf) {
      throw "Release staging contains development dependency: $DevPackagePath"
    }
  }

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $NodeEntry = $RuntimeLock.runtimes.node
  $NodeExtract = Expand-LockedRuntime -Entry $NodeEntry -Name "node"
  $NodeSource = Join-Path $NodeExtract ("node-v" + [string]$NodeEntry.version + "-win-x64")
  if (-not (Test-Path -LiteralPath (Join-Path $NodeSource "node.exe") -PathType Leaf)) {
    throw "Locked Node.js archive does not contain node.exe at the expected path."
  }
  New-Item -ItemType Directory -Path (Join-Path $StagingRoot "runtimes\node") -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $NodeSource "node.exe") -Destination (Join-Path $StagingRoot "runtimes\node\node.exe")

  $RipgrepEntry = $RuntimeLock.runtimes.ripgrep
  $RipgrepExtract = Expand-LockedRuntime -Entry $RipgrepEntry -Name "ripgrep"
  $RipgrepCandidates = @(Get-ChildItem -LiteralPath $RipgrepExtract -Recurse -File -Filter "rg.exe")
  if ($RipgrepCandidates.Count -ne 1) { throw "Locked ripgrep archive must contain exactly one rg.exe." }
  New-Item -ItemType Directory -Path (Join-Path $StagingRoot "runtimes\ripgrep") -Force | Out-Null
  Copy-Item -LiteralPath $RipgrepCandidates[0].FullName -Destination (Join-Path $StagingRoot "runtimes\ripgrep\rg.exe")

  $TunnelEntry = $RuntimeLock.runtimes.tunnelClient
  $TunnelExtract = Expand-LockedRuntime -Entry $TunnelEntry -Name "tunnel-client"
  $TunnelCandidates = @(Get-ChildItem -LiteralPath $TunnelExtract -Recurse -File -Filter "tunnel-client.exe")
  if ($TunnelCandidates.Count -ne 1) { throw "Locked tunnel-client archive must contain exactly one tunnel-client.exe." }
  New-Item -ItemType Directory -Path (Join-Path $StagingRoot "runtimes\tunnel-client") -Force | Out-Null
  Copy-Item -LiteralPath $TunnelCandidates[0].FullName -Destination (Join-Path $StagingRoot "runtimes\tunnel-client\tunnel-client.exe")

  Save-RuntimeLicenses -Entry $NodeEntry -Name "node"
  Save-RuntimeLicenses -Entry $RipgrepEntry -Name "ripgrep"
  Save-RuntimeLicenses -Entry $TunnelEntry -Name "tunnel-client"

  $ForbiddenFiles = @(
    Get-ChildItem -LiteralPath $StagingRoot -Recurse -Force | Where-Object {
      $Relative = Get-StagedRelativePath -Path $_.FullName
      $TopLevelRuntime = $Relative -match '^(?:runtime|artifacts)(?:\\|$)'
      $SecretName = $_.Name -in @(".env.local", "tunnel.local.yaml", "profile_registry.json", "install-manifest.json")
      $GeneratedLog = -not $_.PSIsContainer -and $Relative -notmatch '^node_modules\\' -and ($_.Extension -ieq ".log" -or $_.Extension -ieq ".jsonl")
      $Receipt = -not $_.PSIsContainer -and $_.Name -match '^uninstall-.+\.json$'
      $TopLevelRuntime -or $SecretName -or $GeneratedLog -or $Receipt
    }
  )
  if ($ForbiddenFiles.Count -gt 0) {
    throw "Release staging contains forbidden runtime material: $((Get-StagedRelativePath -Path $ForbiddenFiles[0].FullName))"
  }

  $AuthoredFiles = @(
    Get-ChildItem -LiteralPath $StagingRoot -Recurse -File | Where-Object {
      $Relative = Get-StagedRelativePath -Path $_.FullName
      $Relative -notmatch '^node_modules\\' -and $_.Extension -in @(".md", ".ps1", ".cmd", ".json", ".ts", ".mjs", ".js", ".html", ".css", ".txt", ".yml")
    }
  )
  $UserProfile = [Environment]::GetFolderPath("UserProfile")
  if (-not [string]::IsNullOrWhiteSpace($UserProfile)) {
    $PersonalMatches = @($AuthoredFiles | Select-String -SimpleMatch -Pattern $UserProfile -ErrorAction Stop)
    if ($PersonalMatches.Count -gt 0) { throw "Release staging contains the current absolute user profile path." }
  }
  $AbsoluteUserPathMatches = @($AuthoredFiles | Select-String -Pattern '(?i)[A-Z]:\\Users\\[^\\\r\n]+' -ErrorAction Stop)
  if ($AbsoluteUserPathMatches.Count -gt 0) { throw "Release staging contains an absolute Windows user path." }

  New-Item -ItemType Directory -Path $ReleaseRoot -Force | Out-Null
  Remove-Item -LiteralPath $ArchivePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $HashPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -LiteralPath $StagingRoot -DestinationPath $ArchivePath -CompressionLevel Optimal
  $Hash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText($HashPath, "$Hash  $ArchiveName`n", [Text.UTF8Encoding]::new($false))

  & (Join-Path $PSScriptRoot "test-release-package.ps1") -ArchivePath $ArchivePath -HashPath $HashPath
  if ($LASTEXITCODE -ne 0) { throw "Release package validation failed." }

  [pscustomobject]@{
    Archive = $ArchivePath
    Sha256 = $Hash
    Bytes = (Get-Item -LiteralPath $ArchivePath).Length
    Version = $Version
  } | ConvertTo-Json
} finally {
  if (Test-Path -LiteralPath $StagingParent) { Remove-Item -LiteralPath $StagingParent -Recurse -Force }
}
