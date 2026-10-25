# Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

<#
.SYNOPSIS
  Runs etc/scripts/install.ps1 against a local copy of a release, for
  install_dry_run_test.go.

.DESCRIPTION
  A function takes precedence over a cmdlet of the same name, and the
  installer runs in a child scope that sees the functions defined here. So
  Invoke-RestMethod answers the latest-release request with -Version, and
  Invoke-WebRequest copies the downloads from -Releases\v<version>\. Any other
  URL throws, which keeps the run off the network. The installer still
  verifies the checksum, extracts the archive and installs the binary.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Installer,
  [Parameter(Mandatory)] [string] $Releases,
  [Parameter(Mandatory)] [string] $Version,
  [Parameter(Mandatory)] [string] $InstallDir
)

$ErrorActionPreference = 'Stop'

# Global, not script scope: the functions below run inside install.ps1, whose
# own $Version shadows this script's parameters by dynamic scoping.
$global:EserDryRunVersion = $Version
$global:EserDryRunReleases = $Releases
$global:EserDryRunDownloadBase = 'https://github.com/eser/stack/releases/download/'

function Invoke-RestMethod {
  param([switch] $UseBasicParsing, [string] $Uri, [hashtable] $Headers)

  if ($Uri -ne 'https://api.github.com/repos/eser/stack/releases/latest') {
    throw "unexpected request to $Uri"
  }

  return [pscustomobject] @{ tag_name = "v$global:EserDryRunVersion" }
}

function Invoke-WebRequest {
  param([switch] $UseBasicParsing, [string] $Uri, [string] $OutFile)

  if (-not $Uri.StartsWith($global:EserDryRunDownloadBase)) {
    throw "unexpected request to $Uri"
  }

  $relative = $Uri.Substring($global:EserDryRunDownloadBase.Length) -replace '/', [System.IO.Path]::DirectorySeparatorChar
  $source = Join-Path $global:EserDryRunReleases $relative

  if (-not (Test-Path -LiteralPath $source)) {
    throw "404 Not Found: $Uri"
  }

  Copy-Item -LiteralPath $source -Destination $OutFile -Force
}

& $Installer -Product noskills -InstallDir $InstallDir
