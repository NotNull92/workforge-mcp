[CmdletBinding()]
param(
  [ValidateSet("Install", "Resolve", "Rollback")]
  [string]$Action = "Resolve",
  [string]$SourceRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
. (Join-Path $PSScriptRoot "WorkForge.Portable.ps1")

switch ($Action) {
  "Install" {
    if ([string]::IsNullOrWhiteSpace($SourceRoot)) { throw "Install requires -SourceRoot." }
    Install-WorkForgePortableVersion -SourceRoot $SourceRoot
  }
  "Resolve" { Resolve-WorkForgePortableEngine }
  "Rollback" { Invoke-WorkForgePortableRollback }
}
