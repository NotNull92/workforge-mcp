Set-StrictMode -Version 3.0

function Get-WorkForgePrerequisiteCatalog {
  return @(
    [pscustomobject]@{
      Id = "node"
      Name = "Node.js LTS"
      CommandNames = @("node.exe", "node")
      PackageId = "OpenJS.NodeJS.LTS"
      MinimumVersion = "20.0.0"
      RequiredArchitecture = "x64"
    },
    [pscustomobject]@{
      Id = "git"
      Name = "Git for Windows"
      CommandNames = @("git.exe", "git")
      PackageId = "Git.Git"
      MinimumVersion = $null
      RequiredArchitecture = $null
    },
    [pscustomobject]@{
      Id = "ripgrep"
      Name = "ripgrep"
      CommandNames = @("rg.exe", "rg")
      PackageId = "BurntSushi.ripgrep.MSVC"
      MinimumVersion = $null
      RequiredArchitecture = $null
    }
  )
}

function Resolve-WorkForgePrerequisiteCommand {
  param(
    [Parameter(Mandatory = $true)][object]$Requirement,
    [scriptblock]$CommandResolver
  )

  if ($null -ne $CommandResolver) {
    $Resolved = & $CommandResolver $Requirement
    if ($null -eq $Resolved -or [string]::IsNullOrWhiteSpace([string]$Resolved)) { return $null }
    return [string]$Resolved
  }

  foreach ($Candidate in @($Requirement.CommandNames)) {
    $Command = Get-Command ([string]$Candidate) -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $Command) {
      $Source = [string]$Command.Source
      if ([string]::IsNullOrWhiteSpace($Source)) { $Source = [string]$Command.Path }
      if (-not [string]::IsNullOrWhiteSpace($Source)) { return $Source }
    }
  }
  return $null
}

function Invoke-WorkForgeNodeProbe {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [scriptblock]$NodeProbe
  )

  if ($null -ne $NodeProbe) {
    return (& $NodeProbe $NodePath)
  }

  $VersionText = (& $NodePath -p "process.versions.node" 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($VersionText)) {
    throw "Node.js did not report its version."
  }
  $Architecture = (& $NodePath -p "process.arch" 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Architecture)) {
    throw "Node.js did not report its architecture."
  }
  return [pscustomobject]@{
    Version = $VersionText
    Architecture = $Architecture
  }
}

function Get-WorkForgePrerequisiteSnapshot {
  [CmdletBinding()]
  param(
    [scriptblock]$CommandResolver,
    [scriptblock]$NodeProbe
  )

  $Items = [Collections.Generic.List[object]]::new()
  foreach ($Requirement in @(Get-WorkForgePrerequisiteCatalog)) {
    $CommandPath = Resolve-WorkForgePrerequisiteCommand -Requirement $Requirement -CommandResolver $CommandResolver
    if ([string]::IsNullOrWhiteSpace($CommandPath)) {
      $Items.Add([pscustomobject]@{
        Id = [string]$Requirement.Id
        Name = [string]$Requirement.Name
        PackageId = [string]$Requirement.PackageId
        Status = "Missing"
        CommandPath = $null
        Version = $null
        Architecture = $null
        Reason = "command is not available"
      })
      continue
    }

    if ([string]$Requirement.Id -ceq "node") {
      try {
        $Probe = Invoke-WorkForgeNodeProbe -NodePath $CommandPath -NodeProbe $NodeProbe
        $VersionText = [string]$Probe.Version
        $Architecture = [string]$Probe.Architecture
        $ParsedVersion = $null
        $VersionValid = [version]::TryParse($VersionText, [ref]$ParsedVersion)
        if (-not $VersionValid) {
          $Items.Add([pscustomobject]@{
            Id = "node"
            Name = [string]$Requirement.Name
            PackageId = [string]$Requirement.PackageId
            Status = "Incompatible"
            CommandPath = $CommandPath
            Version = $VersionText
            Architecture = $Architecture
            Reason = "version could not be parsed"
          })
          continue
        }
        if ($ParsedVersion -lt [version]$Requirement.MinimumVersion) {
          $Items.Add([pscustomobject]@{
            Id = "node"
            Name = [string]$Requirement.Name
            PackageId = [string]$Requirement.PackageId
            Status = "Incompatible"
            CommandPath = $CommandPath
            Version = $VersionText
            Architecture = $Architecture
            Reason = "version $VersionText is below the required $($Requirement.MinimumVersion)"
          })
          continue
        }
        if ($Architecture -cne [string]$Requirement.RequiredArchitecture) {
          $Items.Add([pscustomobject]@{
            Id = "node"
            Name = [string]$Requirement.Name
            PackageId = [string]$Requirement.PackageId
            Status = "Incompatible"
            CommandPath = $CommandPath
            Version = $VersionText
            Architecture = $Architecture
            Reason = "architecture $Architecture is not supported; x64 is required"
          })
          continue
        }
        $Items.Add([pscustomobject]@{
          Id = "node"
          Name = [string]$Requirement.Name
          PackageId = [string]$Requirement.PackageId
          Status = "Ready"
          CommandPath = $CommandPath
          Version = $VersionText
          Architecture = $Architecture
          Reason = $null
        })
      } catch {
        $Items.Add([pscustomobject]@{
          Id = "node"
          Name = [string]$Requirement.Name
          PackageId = [string]$Requirement.PackageId
          Status = "Incompatible"
          CommandPath = $CommandPath
          Version = $null
          Architecture = $null
          Reason = $_.Exception.Message
        })
      }
      continue
    }

    $Items.Add([pscustomobject]@{
      Id = [string]$Requirement.Id
      Name = [string]$Requirement.Name
      PackageId = [string]$Requirement.PackageId
      Status = "Ready"
      CommandPath = $CommandPath
      Version = $null
      Architecture = $null
      Reason = $null
    })
  }

  $AllItems = @($Items)
  $Ready = @($AllItems | Where-Object { [string]$_.Status -ceq "Ready" })
  $Missing = @($AllItems | Where-Object { [string]$_.Status -ceq "Missing" })
  $Incompatible = @($AllItems | Where-Object { [string]$_.Status -ceq "Incompatible" })
  return [pscustomobject]@{
    Items = $AllItems
    Ready = $Ready
    Missing = $Missing
    Incompatible = $Incompatible
    IsReady = $Missing.Count -eq 0 -and $Incompatible.Count -eq 0
  }
}

function Get-WorkForgePrerequisiteItem {
  param(
    [Parameter(Mandatory = $true)][object]$Snapshot,
    [Parameter(Mandatory = $true)][string]$Id
  )

  $Matches = @($Snapshot.Items | Where-Object { [string]$_.Id -ceq $Id })
  if ($Matches.Count -ne 1) { throw "Prerequisite snapshot does not contain exactly one item with id $Id." }
  return $Matches[0]
}

function Get-WorkForgePrerequisiteSummary {
  param([Parameter(Mandatory = $true)][object]$Snapshot)

  $Parts = [Collections.Generic.List[string]]::new()
  foreach ($Item in @($Snapshot.Items)) {
    if ([string]$Item.Status -cne "Ready") { continue }
    if ([string]$Item.Id -ceq "node") {
      $Parts.Add("Node $($Item.Version) $($Item.Architecture)")
    } else {
      $Parts.Add([string]$Item.Name)
    }
  }
  return ($Parts -join " | ")
}

function Update-WorkForgeProcessPath {
  $Segments = [Collections.Generic.List[string]]::new()
  $Seen = @{}
  foreach ($Value in @(
    [Environment]::GetEnvironmentVariable("Path", "Machine"),
    [Environment]::GetEnvironmentVariable("Path", "User"),
    [Environment]::GetEnvironmentVariable("Path", "Process")
  )) {
    if ([string]::IsNullOrWhiteSpace($Value)) { continue }
    foreach ($Segment in $Value.Split(";")) {
      $Trimmed = $Segment.Trim()
      if ([string]::IsNullOrWhiteSpace($Trimmed)) { continue }
      $Key = $Trimmed.ToLowerInvariant()
      if ($Seen.ContainsKey($Key)) { continue }
      $Seen[$Key] = $true
      $Segments.Add($Trimmed)
    }
  }
  $env:Path = $Segments -join ";"
  return $env:Path
}

function Get-WorkForgeWinGetInstallArguments {
  param([Parameter(Mandatory = $true)][object]$Requirement)

  return @(
    "install",
    "--id", [string]$Requirement.PackageId,
    "--exact",
    "--source", "winget",
    "--accept-source-agreements",
    "--accept-package-agreements",
    "--disable-interactivity",
    "--silent",
    "--no-upgrade"
  )
}

function Protect-WorkForgePrerequisiteErrorText {
  param([AllowNull()][string]$Text)

  if ($null -eq $Text) { return "" }
  $Protected = [string]$Text
  $UiProtector = Get-Command Protect-WorkForgeDisplayText -CommandType Function -ErrorAction SilentlyContinue
  if ($null -ne $UiProtector) {
    try {
      $ToolRoot = $null
      try { $ToolRoot = (Get-WorkForgeUiContext).ToolRoot } catch {}
      return (Protect-WorkForgeDisplayText -Text $Protected -ToolRoot $ToolRoot)
    } catch {}
  }
  $UserProfile = [Environment]::GetFolderPath("UserProfile")
  if (-not [string]::IsNullOrWhiteSpace($UserProfile)) {
    $Protected = [regex]::Replace($Protected, [regex]::Escape($UserProfile), "%USERPROFILE%", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }
  return $Protected
}

function Invoke-WorkForgeWinGetInstall {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][object]$Requirement,
    [string]$WingetPath
  )

  if ([string]::IsNullOrWhiteSpace($WingetPath)) {
    $Winget = Get-Command "winget.exe" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $Winget) { $Winget = Get-Command "winget" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 }
    if ($null -eq $Winget) {
      throw "WinGet is unavailable. Install or update Microsoft App Installer, then run WorkForge Setup again."
    }
    $WingetPath = [string]$Winget.Source
  }

  $Arguments = @(Get-WorkForgeWinGetInstallArguments -Requirement $Requirement)
  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $WingetPath
  $StartInfo.Arguments = ($Arguments -join " ")
  $StartInfo.UseShellExecute = $false
  $StartInfo.CreateNoWindow = $true
  $StartInfo.RedirectStandardOutput = $true
  $StartInfo.RedirectStandardError = $true
  $Process = [Diagnostics.Process]::Start($StartInfo)
  $StandardOutputTask = $Process.StandardOutput.ReadToEndAsync()
  $StandardErrorTask = $Process.StandardError.ReadToEndAsync()
  $Process.WaitForExit()
  $StandardOutput = $StandardOutputTask.Result
  $StandardError = $StandardErrorTask.Result

  if ($Process.ExitCode -ne 0) {
    $Combined = (($StandardError + [Environment]::NewLine + $StandardOutput).Trim())
    $LastLine = @($Combined -split "\r?\n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Last 1)
    $Hint = if ($LastLine.Count -eq 1) { Protect-WorkForgePrerequisiteErrorText -Text ([string]$LastLine[0]) } else { "No additional WinGet detail was returned." }
    if ($Hint.Length -gt 240) { $Hint = $Hint.Substring(0, 240) + "..." }
    throw "WinGet could not install $($Requirement.Name) (exit code $($Process.ExitCode)). $Hint"
  }
}

function Write-WorkForgePrerequisiteDetail {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [ValidateSet("text", "primary", "accent", "info", "success", "warning", "error", "muted")]
    [string]$Tone = "muted"
  )

  if ($null -ne (Get-Command Write-WorkForgeDetail -CommandType Function -ErrorAction SilentlyContinue)) {
    Write-WorkForgeDetail -Text $Text -Tone $Tone
  } else {
    [Console]::Out.WriteLine($Text)
  }
}

function Confirm-WorkForgePrerequisiteInstall {
  param([Parameter(Mandatory = $true)][object[]]$Missing)

  $Names = @($Missing | ForEach-Object { [string]$_.Name }) -join ", "
  if ($null -ne (Get-Command Read-WorkForgeChoice -CommandType Function -ErrorAction SilentlyContinue)) {
    $Choice = Read-WorkForgeChoice -Title "Missing prerequisites: $Names" -Options @(
      "Install only the missing prerequisites with WinGet (Recommended)",
      "Cancel setup"
    ) -DefaultIndex 0
    return $Choice -eq 0
  }

  $Observed = Read-Host "Install missing prerequisites with WinGet? [Y/n]"
  return [string]::IsNullOrWhiteSpace($Observed) -or $Observed -match '^(?i)y(?:es)?$'
}

function Ensure-WorkForgePrerequisites {
  [CmdletBinding()]
  param(
    [switch]$InstallMissing,
    [switch]$NonInteractive,
    [scriptblock]$CommandResolver,
    [scriptblock]$NodeProbe,
    [scriptblock]$PackageInstaller
  )

  $Snapshot = Get-WorkForgePrerequisiteSnapshot -CommandResolver $CommandResolver -NodeProbe $NodeProbe
  foreach ($Item in @($Snapshot.Ready)) {
    $Detail = if ([string]$Item.Id -ceq "node") { "$($Item.Name) $($Item.Version) $($Item.Architecture) already available" } else { "$($Item.Name) already available" }
    Write-WorkForgePrerequisiteDetail -Text $Detail -Tone "success"
  }

  if ($Snapshot.Incompatible.Count -gt 0) {
    $Problems = @($Snapshot.Incompatible | ForEach-Object { "$($_.Name): $($_.Reason)" }) -join "; "
    throw "Existing prerequisites are incompatible and will not be replaced automatically. $Problems. Upgrade or remove the conflicting installation manually, then run Setup again."
  }

  if ($Snapshot.Missing.Count -eq 0) { return $Snapshot }
  foreach ($Item in @($Snapshot.Missing)) {
    Write-WorkForgePrerequisiteDetail -Text "$($Item.Name) is missing; package $($Item.PackageId) is available through WinGet." -Tone "warning"
  }

  $Approved = [bool]$InstallMissing
  if (-not $Approved) {
    if ($NonInteractive) {
      $MissingNames = @($Snapshot.Missing | ForEach-Object { [string]$_.Name }) -join ", "
      throw "Missing prerequisites: $MissingNames. Rerun with -InstallMissingPrerequisites or install them manually."
    }
    $Approved = Confirm-WorkForgePrerequisiteInstall -Missing @($Snapshot.Missing)
  }
  if (-not $Approved) { throw "Prerequisite installation was cancelled; no packages were installed." }

  foreach ($Requirement in @($Snapshot.Missing)) {
    Write-WorkForgePrerequisiteDetail -Text "Installing $($Requirement.Name) with WinGet; compatible existing programs are not touched." -Tone "info"
    if ($null -ne $PackageInstaller) {
      $null = & $PackageInstaller $Requirement
    } else {
      Invoke-WorkForgeWinGetInstall -Requirement $Requirement
    }
  }

  if ($null -eq $CommandResolver) { $null = Update-WorkForgeProcessPath }
  $Verified = Get-WorkForgePrerequisiteSnapshot -CommandResolver $CommandResolver -NodeProbe $NodeProbe
  if (-not $Verified.IsReady) {
    $Remaining = @(
      @($Verified.Missing | ForEach-Object { "$($_.Name) is still missing" })
      @($Verified.Incompatible | ForEach-Object { "$($_.Name): $($_.Reason)" })
    ) -join "; "
    throw "Prerequisite installation completed, but validation still failed. $Remaining. Open a new PowerShell window and run Setup again before attempting another installation."
  }
  foreach ($Item in @($Verified.Items)) {
    Write-WorkForgePrerequisiteDetail -Text "$($Item.Name) verified after prerequisite bootstrap." -Tone "success"
  }
  return $Verified
}
