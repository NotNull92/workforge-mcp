$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0

$ToolRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..") -ErrorAction Stop).Path
. (Join-Path $PSScriptRoot "WorkForge.Prerequisites.ps1")

function Assert-PrerequisiteTest {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if (-not $Condition) { throw $Message }
}

function New-PrerequisiteFixture {
  $State = @{
    node = [pscustomobject]@{ Present = $true; Path = "fixture-node"; Version = "24.19.0"; Architecture = "x64" }
    git = [pscustomobject]@{ Present = $true; Path = "fixture-git"; Version = $null; Architecture = $null }
    ripgrep = [pscustomobject]@{ Present = $true; Path = "fixture-rg"; Version = $null; Architecture = $null }
  }
  $Resolver = {
    param($Requirement)
    $Entry = $State[[string]$Requirement.Id]
    if ([bool]$Entry.Present) { return [string]$Entry.Path }
    return $null
  }.GetNewClosure()
  $Probe = {
    param($NodePath)
    $Entry = $State.node
    return [pscustomobject]@{
      Version = [string]$Entry.Version
      Architecture = [string]$Entry.Architecture
    }
  }.GetNewClosure()
  return [pscustomobject]@{
    State = $State
    Resolver = $Resolver
    Probe = $Probe
  }
}

$Catalog = @(Get-WorkForgePrerequisiteCatalog)
Assert-PrerequisiteTest -Condition ($Catalog.Count -eq 3) -Message "Prerequisite catalog must contain exactly three requirements."
$ExpectedPackages = @("OpenJS.NodeJS.LTS", "Git.Git", "BurntSushi.ripgrep.MSVC")
Assert-PrerequisiteTest -Condition ((@($Catalog.PackageId) -join "|") -ceq ($ExpectedPackages -join "|")) -Message "Prerequisite package IDs changed unexpectedly."

foreach ($Requirement in $Catalog) {
  $Arguments = @(Get-WorkForgeWinGetInstallArguments -Requirement $Requirement)
  Assert-PrerequisiteTest -Condition ($Arguments[0] -ceq "install") -Message "WinGet must use the install command."
  Assert-PrerequisiteTest -Condition ($Arguments -contains "--id") -Message "WinGet install is missing --id."
  Assert-PrerequisiteTest -Condition ($Arguments -contains [string]$Requirement.PackageId) -Message "WinGet install does not use the exact catalog package id."
  Assert-PrerequisiteTest -Condition ($Arguments -contains "--exact") -Message "WinGet install is missing --exact."
  Assert-PrerequisiteTest -Condition ($Arguments -contains "--source") -Message "WinGet install is missing --source."
  Assert-PrerequisiteTest -Condition ($Arguments -contains "winget") -Message "WinGet install must use the official winget source."
  Assert-PrerequisiteTest -Condition ($Arguments -contains "--no-upgrade") -Message "WinGet install must prevent upgrades of matching installed packages."
  Assert-PrerequisiteTest -Condition ($Arguments -contains "--disable-interactivity") -Message "WinGet install must disable package-manager prompts after WorkForge consent."
  Assert-PrerequisiteTest -Condition (-not ($Arguments -contains "upgrade")) -Message "Prerequisite bootstrap must never invoke winget upgrade."
  Assert-PrerequisiteTest -Condition (-not ($Arguments -contains "--force")) -Message "Prerequisite bootstrap must never force package installation."
}

$ReadyFixture = New-PrerequisiteFixture
$ReadyCalls = [Collections.Generic.List[string]]::new()
$ReadyInstaller = {
  param($Requirement)
  $ReadyCalls.Add([string]$Requirement.PackageId)
}.GetNewClosure()
$ReadySnapshot = Ensure-WorkForgePrerequisites `
  -InstallMissing `
  -NonInteractive `
  -CommandResolver $ReadyFixture.Resolver `
  -NodeProbe $ReadyFixture.Probe `
  -PackageInstaller $ReadyInstaller
Assert-PrerequisiteTest -Condition $ReadySnapshot.IsReady -Message "All-ready fixture did not pass validation."
Assert-PrerequisiteTest -Condition ($ReadyCalls.Count -eq 0) -Message "Compatible existing prerequisites triggered an install call."

$MissingFixture = New-PrerequisiteFixture
$MissingFixture.State.git.Present = $false
$MissingFixture.State.ripgrep.Present = $false
$MissingCalls = [Collections.Generic.List[string]]::new()
$MissingInstaller = {
  param($Requirement)
  $MissingCalls.Add([string]$Requirement.PackageId)
  $MissingFixture.State[[string]$Requirement.Id].Present = $true
}.GetNewClosure()
$InstalledSnapshot = Ensure-WorkForgePrerequisites `
  -InstallMissing `
  -NonInteractive `
  -CommandResolver $MissingFixture.Resolver `
  -NodeProbe $MissingFixture.Probe `
  -PackageInstaller $MissingInstaller
Assert-PrerequisiteTest -Condition $InstalledSnapshot.IsReady -Message "Missing prerequisite fixture did not validate after simulated installation."
Assert-PrerequisiteTest -Condition (($MissingCalls -join "|") -ceq "Git.Git|BurntSushi.ripgrep.MSVC") -Message "Bootstrap did not install only the missing Git and ripgrep packages."
Assert-PrerequisiteTest -Condition (-not ($MissingCalls -contains "OpenJS.NodeJS.LTS")) -Message "Compatible existing Node.js was reinstalled."

$ConsentFixture = New-PrerequisiteFixture
$ConsentFixture.State.ripgrep.Present = $false
$ConsentCalls = [Collections.Generic.List[string]]::new()
$ConsentInstaller = {
  param($Requirement)
  $ConsentCalls.Add([string]$Requirement.PackageId)
}.GetNewClosure()
$ConsentFailed = $false
try {
  $null = Ensure-WorkForgePrerequisites `
    -NonInteractive `
    -CommandResolver $ConsentFixture.Resolver `
    -NodeProbe $ConsentFixture.Probe `
    -PackageInstaller $ConsentInstaller
} catch {
  $ConsentFailed = $_.Exception.Message -match "InstallMissingPrerequisites"
}
Assert-PrerequisiteTest -Condition $ConsentFailed -Message "Non-interactive missing prerequisites did not fail closed with an explicit-consent hint."
Assert-PrerequisiteTest -Condition ($ConsentCalls.Count -eq 0) -Message "Non-interactive bootstrap installed software without explicit consent."

$IncompatibleFixture = New-PrerequisiteFixture
$IncompatibleFixture.State.node.Version = "18.20.0"
$IncompatibleFixture.State.git.Present = $false
$IncompatibleCalls = [Collections.Generic.List[string]]::new()
$IncompatibleInstaller = {
  param($Requirement)
  $IncompatibleCalls.Add([string]$Requirement.PackageId)
}.GetNewClosure()
$IncompatibleFailed = $false
try {
  $null = Ensure-WorkForgePrerequisites `
    -InstallMissing `
    -NonInteractive `
    -CommandResolver $IncompatibleFixture.Resolver `
    -NodeProbe $IncompatibleFixture.Probe `
    -PackageInstaller $IncompatibleInstaller
} catch {
  $IncompatibleFailed = $_.Exception.Message -match "will not be replaced automatically"
}
Assert-PrerequisiteTest -Condition $IncompatibleFailed -Message "Incompatible Node.js was not rejected clearly."
Assert-PrerequisiteTest -Condition ($IncompatibleCalls.Count -eq 0) -Message "Bootstrap attempted package installation while an incompatible Node.js was present."

$ArchitectureFixture = New-PrerequisiteFixture
$ArchitectureFixture.State.node.Architecture = "ia32"
$ArchitectureFailed = $false
try {
  $null = Ensure-WorkForgePrerequisites `
    -InstallMissing `
    -NonInteractive `
    -CommandResolver $ArchitectureFixture.Resolver `
    -NodeProbe $ArchitectureFixture.Probe `
    -PackageInstaller { param($Requirement) throw "installer should not run" }
} catch {
  $ArchitectureFailed = $_.Exception.Message -match "x64 is required"
}
Assert-PrerequisiteTest -Condition $ArchitectureFailed -Message "Non-x64 Node.js was not rejected."

Write-Output "PREREQUISITES_TEST_OK"
