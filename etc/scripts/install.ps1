<#
.SYNOPSIS
  Windows installer for the eserstack product family.

.DESCRIPTION
  The PowerShell counterpart to etc/scripts/install.sh, and it takes the same
  product argument. Every product -- the eser CLI, the noskills and laroux CLIs
  carved out of it, and the noskills-server daemon -- is built at one version by
  one pipeline into one SHA256SUMS.txt, so one installer serves all of them.

  Windows needs its own script because install.sh is POSIX sh: there is no
  /usr/local/bin, and PATH is a registry value rather than a shell export --
  see Add-ToUserPath, which must preserve REG_EXPAND_SZ or it bakes the stock
  %USERPROFILE% entry into a literal path.

.PARAMETER Product
  Which binary to install: eser (default), noskills, laroux or noskills-server.

.PARAMETER InstallDir
  Where to place it. Defaults to $env:LOCALAPPDATA\Programs\eser\bin, a
  per-user location chosen so the script never needs Administrator.

.PARAMETER Version
  Version to install, without the leading "v". Defaults to the latest release.

  The script decides from that release's archives: when the release has no
  archive of eser, noskills or laroux, it names the npm command that installs
  the package instead and fails, and from $LarouxNpmOnlyVersion on it sends
  laroux to npm without downloading.

.PARAMETER ArchivePath
  Install from an already-downloaded .zip instead of fetching a release. This is
  the seam CI uses to exercise the installer against the archive built from the
  current tree.

.EXAMPLE
  irm https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.ps1 | iex

.EXAMPLE
  .\install.ps1 -Product noskills-server
#>

[CmdletBinding()]
param(
  [ValidateSet('eser', 'noskills', 'laroux', 'noskills-server')]
  [string] $Product = 'eser',
  [string] $InstallDir = $(if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\eser\bin' }),
  [string] $Version = $env:VERSION,
  [string] $ArchivePath
)

# Saved and restored at the end. The documented invocation is
# `irm ... | iex`, which runs this in the CALLER's session scope, so setting
# these unqualified would leave the user's interactive shell in StrictMode with
# ErrorActionPreference=Stop long after the install finished.
$eserPriorErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repo = 'eser/stack'

# The first release whose laroux comes from npm only (decision-29). For this
# version and later ones the script names the npm command instead of
# installing the laroux archive, which those releases keep only for the
# self-update of installed v4.5.x binaries. install.sh holds the same value.
$LarouxNpmOnlyVersion = '5.0.0'

# The three binaries the archive carries. noskills-server is the headline
# install; the other two are what make a released artifact actually functional.
$Binaries = @($Product)

# ── Detect platform ──────────────────────────────────────────────────────────

function Get-ArchName {
  # PROCESSOR_ARCHITECTURE reports the *process* architecture, which is wrong
  # under WOW64 emulation; PROCESSOR_ARCHITEW6432 is set only in that case and
  # names the real machine. Checking it first keeps a 32-bit PowerShell host on
  # 64-bit Windows from being misread as x86.
  $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }

  switch ($arch) {
    'AMD64' { return 'x86_64' }
    'ARM64' {
      # .goreleaser.yaml deliberately ignores windows/arm64 for all three
      # builds, so no arm64 archive exists to download. Windows on ARM emulates
      # x64, so the x86_64 archive is the correct artifact -- but say so rather
      # than silently installing a foreign binary.
      Write-Warning 'Windows on ARM detected; installing the x86_64 build, which runs under emulation. No native arm64 archive is published.'
      return 'x86_64'
    }
    'x86' { throw '32-bit Windows is not supported; no 32-bit archive is published.' }
    default { throw "Unsupported architecture: $arch" }
  }
}

# ── Resolve version ──────────────────────────────────────────────────────────

function Get-LatestVersion {
  # -UseBasicParsing keeps this working on hosts where Internet Explorer's
  # engine is unavailable, which is the default on Server Core and modern
  # Windows. Harmless on PowerShell 7, where it is already the only behaviour.
  $release = Invoke-RestMethod -UseBasicParsing `
    -Uri "https://api.github.com/repos/$Repo/releases/latest" `
    -Headers @{ 'User-Agent' = 'eser-install' }

  return $release.tag_name -replace '^v', ''
}

# ── Release decisions ────────────────────────────────────────────────────────

# True when $Have (with or without "v", a pre-release suffix ignored) is at or
# above $Want.
function Test-VersionAtLeast {
  param([string] $Have, [string] $Want)

  $core = ($Have -replace '^v', '') -replace '[-+].*$', ''
  $parsed = $null

  if (-not [version]::TryParse($core, [ref] $parsed)) { return $false }

  return $parsed -ge [version] $Want
}

# True when a failed Invoke-WebRequest was answered with 404. PowerShell 7
# and Windows PowerShell 5.1 raise different exception types, so read the
# response when the exception carries one and the message otherwise; both
# messages name the status code.
function Test-NotFound {
  param([Parameter(Mandatory)] [System.Management.Automation.ErrorRecord] $ErrorRecord)

  $response = $ErrorRecord.Exception.PSObject.Properties['Response']

  if ($null -ne $response -and $null -ne $response.Value) {
    return ([int] $response.Value.StatusCode) -eq 404
  }

  return $ErrorRecord.Exception.Message -match '\b404\b'
}

# The message for a product that npm installs instead of this script.
function Get-NpmPointer {
  param([string] $Reason, [string] $Spec)

  return "$Reason`nInstall it from npm instead:`n  npm i -g $Spec"
}

# ── PATH registration ────────────────────────────────────────────────────────

function Add-ToUserPath {
  param([Parameter(Mandatory)] [string] $Directory)

  # Read and write the registry directly, NOT via [Environment].
  #
  # Two separate reasons, and the second one damages the machine:
  #
  # 1. Read the *stored* user PATH, not $env:PATH. $env:PATH is the union of the
  #    machine and user values as expanded when this process started; writing
  #    that union back into the user scope would copy every machine entry into
  #    the user registry, permanently duplicating them for this account.
  #
  # 2. [Environment]::GetEnvironmentVariable EXPANDS a REG_EXPAND_SZ value, and
  #    SetEnvironmentVariable writes a plain String back as REG_SZ. A stock
  #    Windows user PATH is REG_EXPAND_SZ containing the literal
  #    %USERPROFILE%\AppData\Local\Microsoft\WindowsApps. Round-tripping it
  #    through those two calls bakes the current profile path in as a literal
  #    AND downgrades the value type, so the indirection is gone for good --
  #    for entries this installer was never asked to touch. Reading with
  #    DoNotExpandEnvironmentNames and writing back as ExpandString preserves
  #    both.
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)

  if ($null -eq $key) {
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
  }

  try {
    $userPath = [string] $key.GetValue(
      'Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)

    $entries = $userPath -split ';' | Where-Object { $_ -ne '' }

    # Compare case-insensitively and ignore a trailing slash: Windows paths are
    # case-insensitive, and "C:\x" and "C:\x\" are the same directory, so a
    # naive -contains would append a duplicate on every re-run.
    $normalized = $Directory.TrimEnd('\', '/')
    $already = $entries | Where-Object { $_.TrimEnd('\', '/') -ieq $normalized }

    if ($already) {
      Write-Host "PATH already contains $Directory"

      return
    }

    $updated = if ($userPath -eq '') { $Directory } else { "$userPath;$Directory" }

    $key.SetValue('Path', $updated, [Microsoft.Win32.RegistryValueKind]::ExpandString)
  }
  finally {
    $key.Dispose()
  }

  # SetEnvironmentVariable used to broadcast WM_SETTINGCHANGE for free; a direct
  # registry write does not, so shells launched from Explorer would keep the
  # stale PATH until the next sign-out.
  if (-not ('Win32.NativeMethods' -as [type])) {
    Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @'
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam,
  string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
'@
  }

  $broadcastResult = [UIntPtr]::Zero
  [void] [Win32.NativeMethods]::SendMessageTimeout(
    [IntPtr] 0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref] $broadcastResult)

  # Also update this session so the verification below, and anything the user
  # runs next in this same shell, can find the binaries without reopening it.
  $env:PATH = "$env:PATH;$Directory"

  Write-Host "Added $Directory to your user PATH."
  Write-Host 'Open a new terminal for it to take effect in existing sessions.'
}

# ── Main ─────────────────────────────────────────────────────────────────────

$archName = Get-ArchName

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "eser-install-$([System.Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
  if ($ArchivePath) {
    if (-not (Test-Path -LiteralPath $ArchivePath)) {
      throw "Archive not found: $ArchivePath"
    }

    Write-Host "Installing from local archive $ArchivePath ..."
    $zip = (Resolve-Path -LiteralPath $ArchivePath).Path
  }
  else {
    # A version the caller chose pins the npm package too.
    $npmSpec = if ($Version) { "$Product@$($Version -replace '^v', '')" } else { $Product }

    if (-not $Version) { $Version = Get-LatestVersion }

    if (-not $Version) { throw 'Could not determine latest version' }

    $Version = $Version -replace '^v', ''

    if ($Product -eq 'laroux' -and (Test-VersionAtLeast $Version $LarouxNpmOnlyVersion)) {
      throw (Get-NpmPointer "laroux is installed from npm from v$LarouxNpmOnlyVersion on." $npmSpec)
    }

    Write-Host "Installing $Product v$Version (Windows/$archName)..."

    # Must match the archive names `eser dev compile` writes:
    # <product>-v<version>-<Rust target triple>, a .zip on Windows.
    $archive = "$Product-v$Version-x86_64-pc-windows-msvc.zip"
    $zip = Join-Path $tmp $archive

    $base = "https://github.com/$Repo/releases/download/v$Version"

    # This script is served from main and reads whatever release it resolves,
    # so it decides from that release's archives (decision-11): a release
    # without this product's archive answers 404, and npm installs it instead.
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$base/$archive" -OutFile $zip
    }
    catch {
      if (-not (Test-NotFound $_)) { throw }

      if ($Product -eq 'noskills-server') { throw "v$Version has no $archive" }

      throw (Get-NpmPointer "v$Version has no $Product archive for Windows/$archName." $npmSpec)
    }

    # Checksum verification, matching install.sh. SHA256SUMS.txt is a
    # `<sha256>  <filename>` list covering every artifact in the release.
    #
    # Every path below is a refusal, exactly as in install.sh. An unverifiable
    # download is not a verified one: whoever can suppress or truncate this file
    # -- a proxy, a captive portal, a half-uploaded release -- would otherwise
    # decide for the user that no checksum is needed.
    $sumsFile = Join-Path $tmp 'SHA256SUMS.txt'

    # The catch is deliberately UNFILTERED. Windows PowerShell 5.1 raises
    # System.Net.WebException from Invoke-WebRequest, but PowerShell 7 raises
    # Microsoft.PowerShell.Commands.HttpResponseException, which a
    # [System.Net.WebException] filter does not match -- so a typed filter is
    # silently version-dependent, and the version it misses is the current one.
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS.txt" -OutFile $sumsFile
    }
    catch {
      throw ("Could not download $base/SHA256SUMS.txt ($($_.Exception.Message)). " +
        'Refusing to install a binary that cannot be verified.')
    }

    # Exact second-field match, mirroring install.sh's
    # `awk -v want="${ARCHIVE}" '$2 == want { print $1 }'`.
    #
    # NOT Select-String -SimpleMatch, which is a substring test: it accepts the
    # line for "$archive.sig" or "$archive.sha256" -- names that contain this
    # one -- and would verify the download against another file's checksum.
    $expected = $null

    foreach ($line in @(Get-Content -LiteralPath $sumsFile)) {
      $fields = $line.Trim() -split '\s+'

      if ($fields.Count -ge 2 -and $fields[1] -ceq $archive) {
        $expected = $fields[0]

        break
      }
    }

    if (-not $expected) {
      throw ("SHA256SUMS.txt lists no checksum for $archive. " +
        'Refusing to install a binary that cannot be verified.')
    }

    $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash

    if ($actual -ine $expected) {
      throw "Checksum verification failed for $archive (expected $expected, got $actual)"
    }

    Write-Host 'Checksum verified.'
  }

  $extract = Join-Path $tmp 'extract'

  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force

  if (-not (Test-Path -LiteralPath $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  }

  $installed = @()

  foreach ($name in $Binaries) {
    $exe = "$name.exe"
    $src = Join-Path $extract $exe

    # The guard keeps this working against archives that carry a different set
    # of binaries, matching the [ -f ] check in install.sh.
    if (-not (Test-Path -LiteralPath $src)) {
      Write-Warning "$exe not present in archive; skipping."

      continue
    }

    $target = Join-Path $InstallDir $exe

    # Windows holds an exclusive lock on a running image, so Copy-Item -Force
    # over a binary that is currently executing fails. Renaming the old file
    # first is the standard escape: the lock follows the inode, not the name, so
    # the running process keeps working and the new file takes the real name.
    if (Test-Path -LiteralPath $target) {
      $stale = "$target.old"

      Remove-Item -LiteralPath $stale -Force -ErrorAction SilentlyContinue

      try {
        Rename-Item -LiteralPath $target -NewName "$exe.old" -Force -ErrorAction Stop
      }
      catch {
        throw ("Could not replace $target -- it may be running. " +
          "Stop any running $exe, then re-run. ($_)")
      }
    }

    Copy-Item -LiteralPath $src -Destination $target -Force

    $installed += $name
  }

  if ($installed.Count -eq 0) {
    throw 'Archive contained none of the expected binaries; refusing to claim success.'
  }

  Add-ToUserPath -Directory $InstallDir

  Write-Host ''
  Write-Host "Installed to ${InstallDir}: $($installed -join ', ')"

  if ($Product -eq 'noskills-server') {
    Write-Host ''
    Write-Host 'Start the daemon:'
    Write-Host '  noskills-server start'
    Write-Host ''
    Write-Host 'Check everything is working:'
    Write-Host '  noskills-server doctor'
  }
}
finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue

  # Hand the caller's session back as we found it -- see the note at the top.
  Set-StrictMode -Off
  $ErrorActionPreference = $eserPriorErrorAction
}
