Set-StrictMode -Version 3.0

function Get-WorkForgeContract {
  $ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
  $Path = Join-Path $ToolRoot "workforge-contract.json"
  $Item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (
    $Item.PSIsContainer -or
    ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
    $Item.Length -lt 1 -or
    $Item.Length -gt 65536
  ) {
    throw "WorkForge contract must be a bounded regular file."
  }

  try {
    $Value = [IO.File]::ReadAllText($Item.FullName, [Text.UTF8Encoding]::new($false, $true)) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "WorkForge contract is not strict UTF-8 JSON."
  }

  $RegistrySchemaVersion = [int]$Value.profileRegistry.schemaVersion
  $MaxProfiles = [int]$Value.profileRegistry.maxProfiles
  $IdPattern = [string]$Value.profile.idPattern
  $MaxIdLength = [int]$Value.profile.maxIdLength
  $MaxDisplayNameLength = [int]$Value.profile.maxDisplayNameLength
  if (
    [int]$Value.schemaVersion -ne 1 -or
    $RegistrySchemaVersion -ne 1 -or
    $MaxProfiles -lt 1 -or $MaxProfiles -gt 1024 -or
    [string]::IsNullOrWhiteSpace($IdPattern) -or $IdPattern.Length -gt 512 -or
    $MaxIdLength -lt 1 -or $MaxIdLength -gt 128 -or
    $MaxDisplayNameLength -lt 1 -or $MaxDisplayNameLength -gt 512
  ) {
    throw "WorkForge contract contains invalid profile limits."
  }
  try {
    $null = [regex]::new($IdPattern)
  } catch {
    throw "WorkForge contract contains an invalid profile id pattern."
  }

  return [pscustomobject]@{
    Path = $Item.FullName
    RegistrySchemaVersion = $RegistrySchemaVersion
    MaxProfiles = $MaxProfiles
    ProfileIdPattern = $IdPattern
    MaxProfileIdLength = $MaxIdLength
    MaxDisplayNameLength = $MaxDisplayNameLength
  }
}

$script:WorkForgeContract = Get-WorkForgeContract
