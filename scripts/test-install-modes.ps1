$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")
$InstallerPath = Join-Path $PSScriptRoot "Install.ps1"
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-install-modes-" + [guid]::NewGuid().ToString("N"))
$WorkspaceRoot = Join-Path $TestRoot "workspace"
$RegistryPath = Join-Path $TestRoot "runtime\profile_registry.json"
$Utf8 = [Text.UTF8Encoding]::new($false)

try {
  New-Item -ItemType Directory -Path $TestRoot -Force | Out-Null
  . (Join-Path $PSScriptRoot 'WorkForge.Contract.ps1')
  $StrictUtf8 = [Text.UTF8Encoding]::new($false, $true)
  $ProfileId = 'new-profile'
  $Tokens = $null; $ParseErrors = $null
  $InstallerAst = [Management.Automation.Language.Parser]::ParseFile($InstallerPath, [ref]$Tokens, [ref]$ParseErrors)
  foreach ($Name in @('Read-StrictJson', 'Write-AtomicUtf8', 'Merge-ProfileRegistry')) {
    $Function = $InstallerAst.Find({ param($Node) $Node -is [Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq $Name }, $true)
    if (-not $Function) { throw "Installer function missing: $Name" }
    . ([scriptblock]::Create($Function.Extent.Text))
  }
  $LimitPath = Join-Path $TestRoot 'limit-registry.json'
  $Entries = @(0..127 | ForEach-Object { [ordered]@{ id = "profile-$_"; profilePath = (Join-Path $TestRoot "profile-$_\profile.json"); profileSha256 = ('a' * 64) } })
  $RegistryBytes = [Text.Encoding]::UTF8.GetBytes((@{ version = 1; profiles = $Entries } | ConvertTo-Json -Depth 5))
  [IO.File]::WriteAllBytes($LimitPath, $RegistryBytes)
  try { Merge-ProfileRegistry -Path $LimitPath -CurrentProfilePath (Join-Path $TestRoot 'new-profile\profile.json') -CurrentProfileHash ('b' * 64); throw '129th profile was accepted.' }
  catch { if ($_.Exception.Message -notmatch 'too many profiles') { throw } }
  if ([Convert]::ToBase64String($RegistryBytes) -cne [Convert]::ToBase64String([IO.File]::ReadAllBytes($LimitPath))) { throw 'Rejected registry merge changed the registry.' }
  & $InstallerPath `
    -WorkspaceRoot $WorkspaceRoot `
    -RegistryPath $RegistryPath `
    -Mode Install `
    -SkipTunnelDownload `
    -NoDesktopShortcut `
    -Plain `
    -NoLog

  if (Test-Path -LiteralPath (Join-Path $WorkspaceRoot ".git")) {
    throw "Install unexpectedly initialized the WorkForge operating workspace as a Git repository."
  }

  $ProfilePath = Join-Path $WorkspaceRoot "tools\workforge-mcp\profile.json"
  $AgentsPath = Join-Path $WorkspaceRoot "AGENTS.md"
  $TunnelPath = Join-Path $WorkspaceRoot "tools\workforge-mcp\tunnel.local.yaml"
  $CustomAgents = "# User policy`n`nKeep this exact content.`n"
  [IO.File]::WriteAllText($AgentsPath, $CustomAgents, $Utf8)
  [IO.File]::WriteAllText($TunnelPath, "version: 1`nfixture: true`n", $Utf8)
  $AgentsHashBefore = Get-WorkForgeFileSha256 -Path $AgentsPath
  $TunnelHashBefore = Get-WorkForgeFileSha256 -Path $TunnelPath

  $Registry = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json
  $OtherPath = Join-Path $TestRoot "other\tools\workforge-mcp\profile.json"
  $Registry.profiles = @($Registry.profiles) + [pscustomobject]@{
    id = "other"
    profilePath = $OtherPath
    profileSha256 = ("a" * 64)
  }
  [IO.File]::WriteAllText($RegistryPath, ($Registry | ConvertTo-Json -Depth 8) + [Environment]::NewLine, $Utf8)

  & $InstallerPath `
    -WorkspaceRoot $WorkspaceRoot `
    -RegistryPath $RegistryPath `
    -Mode Repair `
    -SkipTunnelDownload `
    -NoDesktopShortcut `
    -Plain `
    -NoLog

  if ((Get-WorkForgeFileSha256 -Path $AgentsPath) -ne $AgentsHashBefore) {
    throw "Repair overwrote the user policy file."
  }
  if ((Get-WorkForgeFileSha256 -Path $TunnelPath) -ne $TunnelHashBefore) {
    throw "Repair overwrote the tunnel configuration."
  }
  $AfterRepair = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json
  if (@($AfterRepair.profiles).Count -ne 2 -or -not (@($AfterRepair.profiles.id) -contains "other")) {
    throw "Repair did not preserve unrelated registry entries."
  }

  & $InstallerPath `
    -WorkspaceRoot $WorkspaceRoot `
    -RegistryPath $RegistryPath `
    -Mode Upgrade `
    -SkipTunnelDownload `
    -NoDesktopShortcut `
    -Plain `
    -NoLog

  if ((Get-WorkForgeFileSha256 -Path $AgentsPath) -ne $AgentsHashBefore) {
    throw "Upgrade overwrote the user policy file."
  }
  $CandidatePath = "$AgentsPath.new"
  if (-not (Test-Path -LiteralPath $CandidatePath -PathType Leaf)) {
    throw "Upgrade did not emit a changed template candidate."
  }
  $TemplatePath = Join-Path $ToolRoot "templates\workstation\AGENTS.md"
  if ((Get-WorkForgeFileSha256 -Path $CandidatePath) -ne (Get-WorkForgeFileSha256 -Path $TemplatePath)) {
    throw "Upgrade template candidate does not match the distributed template."
  }

  $CustomCandidate = "# Reviewed candidate`n`nPreserve this content.`n"
  [IO.File]::WriteAllText($CandidatePath, $CustomCandidate, $Utf8)
  $CandidateHashBefore = Get-WorkForgeFileSha256 -Path $CandidatePath
  & $InstallerPath `
    -WorkspaceRoot $WorkspaceRoot `
    -RegistryPath $RegistryPath `
    -Mode Upgrade `
    -SkipTunnelDownload `
    -NoDesktopShortcut `
    -Plain `
    -NoLog
  if ((Get-WorkForgeFileSha256 -Path $CandidatePath) -ne $CandidateHashBefore) {
    throw "Upgrade overwrote an existing user-modified template candidate."
  }

  $FinalRegistry = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json
  $CurrentEntry = @($FinalRegistry.profiles | Where-Object { $_.id -eq "workstation" })
  if ($CurrentEntry.Count -ne 1) { throw "Current profile was not registered exactly once." }
  $ExpectedHash = (Get-WorkForgeFileSha256 -Path $ProfilePath).ToLowerInvariant()
  if ([string]$CurrentEntry[0].profileSha256 -cne $ExpectedHash) { throw "Current profile hash was not refreshed." }

  Write-Output "INSTALL_MODES_TEST_OK"
} finally {
  if (Test-Path -LiteralPath $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
}
