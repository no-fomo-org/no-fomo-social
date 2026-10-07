# Starts and manages the installed no-fomo app on Windows.
# Usage: no-fomo [start|stop|restart|status|logs|update|uninstall|version]
param([string]$Command = 'start')
$ErrorActionPreference = 'Stop'

$AppDir = Split-Path -Parent $PSScriptRoot
$HomeDir = if ($env:NO_FOMO_HOME) { $env:NO_FOMO_HOME } else { Join-Path $env:USERPROFILE '.no-fomo' }
$Port = if ($env:NO_FOMO_PORT) { $env:NO_FOMO_PORT } else { '4747' }
$Url = "http://localhost:$Port"
$LogDir = Join-Path $HomeDir 'logs'
$Log = Join-Path $LogDir 'server.log'
$ErrLog = Join-Path $LogDir 'server-errors.log'
$PidFile = Join-Path $HomeDir 'server.pid'
$InstallUrl = 'https://raw.githubusercontent.com/no-fomo/no-fomo/main/scripts/install/install.ps1'

# True when a no-fomo server answers on the port (its config has an extension id).
function Test-Running {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$Url/api/config"
    return $r.Content -match 'extensionId'
  } catch { return $false }
}

function Open-Browser {
  if ($env:NO_FOMO_NO_BROWSER) { return }
  try { Start-Process 'chrome.exe' $Url } catch { Start-Process $Url }
}

function Start-App {
  if (Test-Running) { Open-Browser; return }
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  foreach ($f in @($Log, $ErrLog)) {
    if ((Test-Path $f) -and (Get-Item $f).Length -gt 5MB) { Move-Item -Force $f "$f.old" }
  }
  $env:NO_FOMO_APP_DIR = $AppDir
  $p = Start-Process -PassThru -WindowStyle Hidden -FilePath (Join-Path $AppDir 'node\node.exe') `
    -ArgumentList "`"$(Join-Path $AppDir 'server.mjs')`"" -RedirectStandardOutput $Log -RedirectStandardError $ErrLog
  Set-Content -Path $PidFile -Value $p.Id
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-Running) { Open-Browser; return }
    if ($p.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "no-fomo did not start. Last lines of ${ErrLog}:" -ForegroundColor Red
  if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 20 }
  exit 1
}

function Stop-App {
  if (Test-Path $PidFile) {
    $id = Get-Content $PidFile
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') { Stop-Process -Id $id -Force; $p.WaitForExit(5000) | Out-Null }
    Remove-Item -Force $PidFile
  }
}

function Uninstall-App {
  Stop-App
  $programs = [Environment]::GetFolderPath('Programs')
  $desktop = [Environment]::GetFolderPath('Desktop')
  Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $programs 'no-fomo.lnk'), (Join-Path $desktop 'no-fomo.lnk')
  $bin = Join-Path $AppDir 'bin'
  $path = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($path) {
    $parts = $path -split ';' | Where-Object { $_ -and $_ -ne $bin }
    [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
  }
  Set-Location $env:USERPROFILE
  Remove-Item -Recurse -Force $AppDir
  Write-Host 'no-fomo is removed.'
  Write-Host "Your library is still in $HomeDir. Delete that folder too if you do not need it any more."
  Write-Host 'Remove the Chrome extension in chrome://extensions.'
}

switch ($Command) {
  'start' { Start-App }
  'stop' { Stop-App }
  'restart' { Stop-App; Start-App }
  'status' { if (Test-Running) { "no-fomo is running at $Url" } else { 'no-fomo is not running' } }
  'logs' { Get-Content $Log, $ErrLog -Tail 100 -ErrorAction SilentlyContinue }
  'update' { Invoke-RestMethod $InstallUrl | Invoke-Expression }
  'uninstall' { Uninstall-App }
  'version' { Get-Content (Join-Path $AppDir 'VERSION') }
  default { Write-Host 'Usage: no-fomo [start|stop|restart|status|logs|update|uninstall|version]'; exit 2 }
}
