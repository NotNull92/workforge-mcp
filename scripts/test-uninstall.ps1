$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("workforge-uninstall-test-" + [guid]::NewGuid().ToString("N"))
$Utf8 = [Text.UTF8Encoding]::new($false)

function Write-JsonFile {
  param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][object]$Value)
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($Path)) -Force | Out-Null
  [IO.File]::WriteAllText($Path, (($Value | ConvertTo-Json -Depth 8) + [Environment]::NewLine), $Utf8)
}

function New-TestProfile {
  param(
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
    [Parameter(Mandatory = $true)][string]$ProfileId,
    [Parameter(Mandatory = $true)][int]$Port
  )

  New-Item -ItemType Directory -Path $WorkspaceRoot -Force | Out-Null
  & git.exe -C $WorkspaceRoot init --initial-branch=main | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not initialize uninstall test workspace." }
  foreach ($Name in @("AGENTS.md", "README.md", "WORKSTATION_POLICY.md")) {
    [IO.File]::WriteAllText((Join-Path $WorkspaceRoot $Name), "# $Name`n", $Utf8)
  }
  [IO.File]::WriteAllText((Join-Path $WorkspaceRoot "workstation.marker"), "identity=workforge-workstation`n", $Utf8)
  [IO.File]::WriteAllText((Join-Path $WorkspaceRoot "user-owned.txt"), "preserve-me`n", $Utf8)

  $ProfilePath = Join-Path $WorkspaceRoot "tools\workforge-mcp\profile.json"
  $Profile = [ordered]@{
    id = $ProfileId
    displayName = "WorkForge Test"
    appName = "WorkForge Test"
    serverName = "workforge-$ProfileId-mcp"
    defaultWorkingDirectoryRelative = "."
    httpPort = $Port
    bootstrapFiles = @("AGENTS.md", "README.md", "WORKSTATION_POLICY.md")
    identityMarkers = @([ordered]@{ relativePath = "workstation.marker"; expectedLiteral = "identity=workforge-workstation" })
  }
  Write-JsonFile -Path $ProfilePath -Value $Profile
  $ArtifactRoot = Join-Path $WorkspaceRoot "artifacts\workforge-mcp"
  New-Item -ItemType Directory -Path $ArtifactRoot -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $ArtifactRoot "fixture.log"), "runtime evidence`n", $Utf8)
  return [pscustomobject]@{
    WorkspaceRoot = $WorkspaceRoot
    ProfilePath = $ProfilePath
    ProfileHash = (Get-FileHash -LiteralPath $ProfilePath -Algorithm SHA256).Hash.ToLowerInvariant()
    ArtifactRoot = $ArtifactRoot
  }
}

function New-TestEngine {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [switch]$SourceCheckout
  )

  $EngineRoot = Join-Path $TestRoot $Name
  $ScriptsRoot = Join-Path $EngineRoot "scripts"
  New-Item -ItemType Directory -Path $ScriptsRoot -Force | Out-Null
  foreach ($ScriptName in @("Uninstall.ps1", "uninstall-finalizer.ps1", "WorkForge.UI.ps1", "profile-registry.ps1", "stop-tunnel.ps1")) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $ScriptName) -Destination (Join-Path $ScriptsRoot $ScriptName) -Force
  }
  [IO.File]::WriteAllText((Join-Path $ScriptsRoot "Control.ps1"), "# test control fixture`n", $Utf8)
  Write-JsonFile -Path (Join-Path $EngineRoot "package.json") -Value ([ordered]@{ name = "workforge-mcp"; version = "1.2.0" })

  if ($SourceCheckout) {
    & git.exe -C $EngineRoot init --initial-branch=main | Out-Null
  } else {
    Write-JsonFile -Path (Join-Path $EngineRoot ".workforge-release.json") -Value ([ordered]@{
      schemaVersion = 1
      product = "WorkForge"
      version = "1.2.0"
      distributionKind = "release"
    })
  }
  return $EngineRoot
}

function Set-TestRegistry {
  param(
    [Parameter(Mandatory = $true)][string]$EngineRoot,
    [Parameter(Mandatory = $true)][object[]]$Profiles
  )

  $Entries = @(
    foreach ($Profile in $Profiles) {
      [ordered]@{
        id = [IO.Path]::GetFileName((Split-Path -Parent (Split-Path -Parent $Profile.ProfilePath)))
        profilePath = $Profile.ProfilePath
        profileSha256 = $Profile.ProfileHash
      }
    }
  )
  for ($Index = 0; $Index -lt $Profiles.Count; $Index++) {
    $Entries[$Index].id = $Profiles[$Index].Id
  }
  $RegistryPath = Join-Path $EngineRoot "runtime\profile_registry.json"
  Write-JsonFile -Path $RegistryPath -Value ([ordered]@{ version = 1; profiles = $Entries })
  [IO.File]::WriteAllText((Join-Path $EngineRoot "runtime\.env.local"), "CONTROL_PLANE_API_KEY=test-fixture`n", $Utf8)
  return $RegistryPath
}

function Add-ProfileId {
  param([Parameter(Mandatory = $true)][object]$Profile, [Parameter(Mandatory = $true)][string]$Id)
  $Profile | Add-Member -NotePropertyName Id -NotePropertyValue $Id -Force
  return $Profile
}

function New-TestShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$EngineRoot,
    [Parameter(Mandatory = $true)][string]$DesktopDirectory
  )

  New-Item -ItemType Directory -Path $DesktopDirectory -Force | Out-Null
  $ShortcutPath = Join-Path $DesktopDirectory "WorkForge Control.lnk"
  $Shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $EngineRoot 'scripts\Control.ps1')`""
  $Shortcut.WorkingDirectory = $EngineRoot
  $Shortcut.Save()
  return $ShortcutPath
}

function Invoke-UninstallProcess {
  param(
    [Parameter(Mandatory = $true)][string]$EngineRoot,
    [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
    [Parameter(Mandatory = $true)][string]$RegistryPath,
    [Parameter(Mandatory = $true)][string]$DesktopDirectory,
    [Parameter(Mandatory = $true)][string[]]$AdditionalArguments
  )

  $UninstallPath = Join-Path $EngineRoot "scripts\Uninstall.ps1"
  $Arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$UninstallPath`"",
    "-WorkspaceRoot", "`"$WorkspaceRoot`"",
    "-RegistryPath", "`"$RegistryPath`"",
    "-DesktopDirectory", "`"$DesktopDirectory`"",
    "-ProfileId", "workstation",
    "-Plain",
    "-NoLog"
  ) + $AdditionalArguments

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = "powershell.exe"
  $StartInfo.Arguments = $Arguments -join " "
  $StartInfo.WorkingDirectory = $TestRoot
  $StartInfo.UseShellExecute = $false
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $Process = [Diagnostics.Process]::Start($StartInfo)
  $Output = $Process.StandardOutput.ReadToEnd() + $Process.StandardError.ReadToEnd()
  $Process.WaitForExit()
  return [pscustomobject]@{ ExitCode = $Process.ExitCode; Output = $Output }
}

try {
  New-Item -ItemType Directory -Path $TestRoot -Force | Out-Null

  # KeepWorkspace removes operational state but preserves user-owned files.
  $Engine = New-TestEngine -Name "keep-engine"
  $Profile = Add-ProfileId -Profile (New-TestProfile -WorkspaceRoot (Join-Path $TestRoot "keep-workspace") -ProfileId "workstation" -Port 2198) -Id "workstation"
  $Registry = Set-TestRegistry -EngineRoot $Engine -Profiles @($Profile)
  $Desktop = Join-Path $TestRoot "keep-desktop"
  $Shortcut = New-TestShortcut -EngineRoot $Engine -DesktopDirectory $Desktop
  $Result = Invoke-UninstallProcess -EngineRoot $Engine -WorkspaceRoot $Profile.WorkspaceRoot -RegistryPath $Registry -DesktopDirectory $Desktop -AdditionalArguments @("-Mode", "KeepWorkspace", "-NonInteractive", "-KeepEngine")
  if ($Result.ExitCode -ne 0) { throw "KeepWorkspace uninstall failed: $($Result.Output)" }
  if (-not (Test-Path -LiteralPath (Join-Path $Profile.WorkspaceRoot "user-owned.txt") -PathType Leaf)) { throw "KeepWorkspace removed user-owned content." }
  if (Test-Path -LiteralPath (Join-Path $Profile.WorkspaceRoot "tools\workforge-mcp")) { throw "KeepWorkspace preserved profile configuration." }
  if (Test-Path -LiteralPath $Profile.ArtifactRoot) { throw "KeepWorkspace preserved runtime evidence." }
  if (Test-Path -LiteralPath $Registry) { throw "KeepWorkspace preserved an empty registry." }
  if (Test-Path -LiteralPath (Join-Path $Engine "runtime\.env.local")) { throw "KeepWorkspace preserved the local credential." }
  if (Test-Path -LiteralPath $Shortcut) { throw "KeepWorkspace preserved the verified shortcut." }
  if (-not (Test-Path -LiteralPath $Engine -PathType Container)) { throw "KeepEngine did not preserve the engine." }

  # WhatIf must leave every fixture untouched.
  $Engine = New-TestEngine -Name "whatif-engine"
  $Profile = Add-ProfileId -Profile (New-TestProfile -WorkspaceRoot (Join-Path $TestRoot "whatif-workspace") -ProfileId "workstation" -Port 2199) -Id "workstation"
  $Registry = Set-TestRegistry -EngineRoot $Engine -Profiles @($Profile)
  $Desktop = Join-Path $TestRoot "whatif-desktop"
  $Shortcut = New-TestShortcut -EngineRoot $Engine -DesktopDirectory $Desktop
  $Result = Invoke-UninstallProcess -EngineRoot $Engine -WorkspaceRoot $Profile.WorkspaceRoot -RegistryPath $Registry -DesktopDirectory $Desktop -AdditionalArguments @("-Mode", "KeepWorkspace", "-NonInteractive", "-KeepEngine", "-WhatIf")
  if ($Result.ExitCode -ne 0) { throw "WhatIf uninstall failed: $($Result.Output)" }
  foreach ($Path in @($Profile.ProfilePath, $Profile.ArtifactRoot, $Registry, (Join-Path $Engine "runtime\.env.local"), $Shortcut)) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "WhatIf changed fixture state: $Path" }
  }

  # Full removal rejects automation without the explicit destructive switch.
  $Engine = New-TestEngine -Name "confirm-engine"
  $Profile = Add-ProfileId -Profile (New-TestProfile -WorkspaceRoot (Join-Path $TestRoot "confirm-workspace") -ProfileId "workstation" -Port 2200) -Id "workstation"
  $Registry = Set-TestRegistry -EngineRoot $Engine -Profiles @($Profile)
  $Desktop = Join-Path $TestRoot "confirm-desktop"
  $Result = Invoke-UninstallProcess -EngineRoot $Engine -WorkspaceRoot $Profile.WorkspaceRoot -RegistryPath $Registry -DesktopDirectory $Desktop -AdditionalArguments @("-Mode", "RemoveEverything", "-NonInteractive", "-KeepEngine")
  if ($Result.ExitCode -ne 1) { throw "RemoveEverything without confirmation did not fail closed." }
  if (-not (Test-Path -LiteralPath $Profile.WorkspaceRoot -PathType Container)) { throw "Rejected full removal changed the workspace." }

  $Result = Invoke-UninstallProcess -EngineRoot $Engine -WorkspaceRoot $Profile.WorkspaceRoot -RegistryPath $Registry -DesktopDirectory $Desktop -AdditionalArguments @("-Mode", "RemoveEverything", "-NonInteractive", "-ConfirmFullRemoval", "-KeepEngine")
  if ($Result.ExitCode -ne 0) { throw "Confirmed full removal failed: $($Result.Output)" }
  if (Test-Path -LiteralPath $Profile.WorkspaceRoot) { throw "Confirmed full removal preserved the workspace." }
  if (-not (Test-Path -LiteralPath $Engine -PathType Container)) { throw "KeepEngine did not preserve the engine after full removal." }

  # Removing one profile preserves another profile and the shared credential.
  $Engine = New-TestEngine -Name "multi-engine"
  $Primary = Add-ProfileId -Profile (New-TestProfile -WorkspaceRoot (Join-Path $TestRoot "multi-primary") -ProfileId "workstation" -Port 2201) -Id "workstation"
  $Secondary = Add-ProfileId -Profile (New-TestProfile -WorkspaceRoot (Join-Path $TestRoot "multi-secondary") -ProfileId "secondary" -Port 2202) -Id "secondary"
  $Registry = Set-TestRegistry -EngineRoot $Engine -Profiles @($Primary, $Secondary)
  $Desktop = Join-Path $TestRoot "multi-desktop"
  $Result = Invoke-UninstallProcess -EngineRoot $Engine -WorkspaceRoot $Primary.WorkspaceRoot -RegistryPath $Registry -DesktopDirectory $Desktop -AdditionalArguments @("-Mode", "KeepWorkspace", "-NonInteractive")
  if ($Result.ExitCode -ne 0) { throw "Multi-profile uninstall failed: $($Result.Output)" }
  $RegistryJson = Get-Content -Raw -LiteralPath $Registry | ConvertFrom-Json
  if (@($RegistryJson.profiles).Count -ne 1 -or [string]$RegistryJson.profiles[0].id -cne "secondary") { throw "Multi-profile uninstall changed the wrong registry entry." }
  if (-not (Test-Path -LiteralPath (Join-Path $Engine "runtime\.env.local") -PathType Leaf)) { throw "Multi-profile uninstall removed the shared credential." }
  if (-not (Test-Path -LiteralPath $Secondary.ProfilePath -PathType Leaf)) { throw "Multi-profile uninstall damaged the remaining profile." }
  if (-not (Test-Path -LiteralPath $Engine -PathType Container)) { throw "Multi-profile uninstall removed the shared engine." }

  # A verified release engine removes itself through the detached finalizer.
  $Engine = New-TestEngine -Name "finalizer-engine"
  $Profile = Add-ProfileId -Profile (New-TestProfile -WorkspaceRoot (Join-Path $TestRoot "finalizer-workspace") -ProfileId "workstation" -Port 2203) -Id "workstation"
  $Registry = Set-TestRegistry -EngineRoot $Engine -Profiles @($Profile)
  $Desktop = Join-Path $TestRoot "finalizer-desktop"
  $BeforeResults = @{}
  $ResultDirectory = Join-Path ([IO.Path]::GetTempPath()) "WorkForge\uninstall-results"
  if (Test-Path -LiteralPath $ResultDirectory) {
    foreach ($Item in Get-ChildItem -LiteralPath $ResultDirectory -File) { $BeforeResults[$Item.FullName] = $true }
  }
  $Result = Invoke-UninstallProcess -EngineRoot $Engine -WorkspaceRoot $Profile.WorkspaceRoot -RegistryPath $Registry -DesktopDirectory $Desktop -AdditionalArguments @("-Mode", "KeepWorkspace", "-NonInteractive")
  if ($Result.ExitCode -ne 0) { throw "Release finalizer uninstall failed: $($Result.Output)" }
  $Deadline = [DateTimeOffset]::UtcNow.AddSeconds(20)
  while ([DateTimeOffset]::UtcNow -lt $Deadline -and (Test-Path -LiteralPath $Engine)) { Start-Sleep -Milliseconds 250 }
  if (Test-Path -LiteralPath $Engine) { throw "Release finalizer did not remove the engine." }
  $NewResults = @()
  if (Test-Path -LiteralPath $ResultDirectory) {
    $NewResults = @(Get-ChildItem -LiteralPath $ResultDirectory -File | Where-Object { -not $BeforeResults.ContainsKey($_.FullName) })
  }
  if ($NewResults.Count -lt 1) { throw "Release finalizer did not write a result receipt." }
  $Receipt = Get-Content -Raw -LiteralPath ($NewResults | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName | ConvertFrom-Json
  if (-not [bool]$Receipt.removed -or [string]$Receipt.state -cne "completed") { throw "Release finalizer reported failure." }
  foreach ($ReceiptFile in $NewResults) { Remove-Item -LiteralPath $ReceiptFile.FullName -Force -ErrorAction SilentlyContinue }

  Write-Output "UNINSTALL_TEST_OK"
} finally {
  if (Test-Path -LiteralPath $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
}
