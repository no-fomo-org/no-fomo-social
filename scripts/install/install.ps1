# Installs or updates no-fomo-social on Windows. Your library in %USERPROFILE%\.no-fomo-social is never touched.
#
#   irm https://raw.githubusercontent.com/no-fomo-org/no-fomo-social/main/scripts/install/install.ps1 | iex
#
# NO_FOMO_SOCIAL_DOWNLOAD_BASE points at another folder of release files (for testing).

# Everything is inside one block, so a half-downloaded script never runs.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $Base = if ($env:NO_FOMO_SOCIAL_DOWNLOAD_BASE) { $env:NO_FOMO_SOCIAL_DOWNLOAD_BASE } else { 'https://github.com/no-fomo-org/no-fomo-social/releases/latest/download' }
  $HomeDir = if ($env:NO_FOMO_SOCIAL_HOME) { $env:NO_FOMO_SOCIAL_HOME } else { Join-Path $env:USERPROFILE '.no-fomo-social' }
  $AppDir = Join-Path $HomeDir 'app'
  $StoreUrl = 'https://chromewebstore.google.com/detail/mjakjbjejpmchdgghkgjkjgmkdainedj'
  $File = 'no-fomo-social-win32-x64.zip'

  function Fail($msg) { Write-Host "`n$msg" -ForegroundColor Red; throw 'no-fomo-social install stopped.' }

  if (-not [Environment]::Is64BitOperatingSystem) { Fail 'no-fomo-social needs 64-bit Windows 10 or newer.' }

  Write-Host 'Installing no-fomo-social for Windows...' -ForegroundColor White
  $Tmp = Join-Path ([IO.Path]::GetTempPath()) ("no-fomo-social-" + [Guid]::NewGuid())
  New-Item -ItemType Directory -Force -Path $Tmp | Out-Null
  try {
    Write-Host 'Downloading (about 120 MB)...'
    try {
      Invoke-WebRequest -UseBasicParsing "$Base/$File" -OutFile (Join-Path $Tmp $File)
      Invoke-WebRequest -UseBasicParsing "$Base/SHA256SUMS" -OutFile (Join-Path $Tmp 'SHA256SUMS')
    } catch { Fail 'Download failed. Check your internet connection and try again.' }

    $line = Get-Content (Join-Path $Tmp 'SHA256SUMS') | Where-Object { ($_ -split '\s+')[1] -eq $File } | Select-Object -First 1
    $expected = if ($line) { ($line -split '\s+')[0] } else { '' }
    $actual = (Get-FileHash -Algorithm SHA256 (Join-Path $Tmp $File)).Hash.ToLower()
    if (-not $expected -or $expected -ne $actual) { Fail 'The download is damaged or changed (checksum does not match). Nothing was installed.' }

    New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null
    Expand-Archive -Force (Join-Path $Tmp $File) -DestinationPath $Tmp

    # Stop the old version before its files are replaced.
    $old = Join-Path $AppDir 'bin\no-fomo-social.ps1'
    if (Test-Path $old) { try { & $old stop } catch {} }
    if (Test-Path "$AppDir.old") { Remove-Item -Recurse -Force "$AppDir.old" }
    if (Test-Path $AppDir) { Move-Item $AppDir "$AppDir.old" }
    Move-Item (Join-Path $Tmp 'app') $AppDir
    if (Test-Path "$AppDir.old") { Remove-Item -Recurse -Force "$AppDir.old" }
  } finally {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $Tmp
  }

  # Start Menu and Desktop shortcuts.
  $shell = New-Object -ComObject WScript.Shell
  $targets = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
  foreach ($dir in $targets) {
    $lnk = $shell.CreateShortcut((Join-Path $dir 'no-fomo-social.lnk'))
    $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AppDir\bin\no-fomo-social.ps1`" start"
    $lnk.IconLocation = "$AppDir\icons\no-fomo-social.ico"
    $lnk.WorkingDirectory = $HomeDir
    $lnk.Description = 'Open no-fomo-social'
    $lnk.Save()
  }

  # The `no-fomo-social` command, for people who like the terminal.
  $bin = Join-Path $AppDir 'bin'
  $path = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (($path -split ';') -contains $bin)) {
    [Environment]::SetEnvironmentVariable('Path', (@($path, $bin) | Where-Object { $_ }) -join ';', 'User')
  }

  $chrome = (Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe") -or
    (Test-Path "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") -or
    (Test-Path "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")

  Write-Host 'Starting no-fomo-social...' -ForegroundColor White
  & (Join-Path $AppDir 'bin\no-fomo-social.ps1') start

  $version = Get-Content (Join-Path $AppDir 'VERSION')
  Write-Host ''
  Write-Host "Done! no-fomo-social $version is installed." -ForegroundColor Green
  Write-Host ''
  if (-not $chrome) { Write-Host '  * no-fomo-social works with Google Chrome. Get it at https://www.google.com/chrome/' }
  Write-Host "  * Add the extension to Chrome: $StoreUrl"
  Write-Host '  * Log in to instagram.com in Chrome, then press Sync in no-fomo-social.'
  Write-Host ''
  Write-Host '  Open no-fomo-social any time from the Start Menu or the Desktop icon.'
  Write-Host "  Your library stays in $HomeDir."
}
