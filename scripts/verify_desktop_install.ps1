# Installs the built application for the current Windows user and verifies shortcuts.
$ErrorActionPreference = 'Stop'
$studioRoot = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $studioRoot 'release\Paper-Studio-Setup-1.0.0.exe'
if (-not (Test-Path -LiteralPath $installer)) { throw 'Build the installer first.' }
$installation = Start-Process -FilePath $installer -ArgumentList @('/S', '/currentuser') -WindowStyle Hidden -Wait -PassThru
if ($installation.ExitCode -ne 0) { throw "Installer failed: $($installation.ExitCode)" }
$installedExe = Join-Path $env:LOCALAPPDATA 'Programs\Paper Studio\Paper Studio.exe'
if (-not (Test-Path -LiteralPath $installedExe)) { throw 'Installed executable was not found.' }
$desktopLink = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) '종이상점 쇼츠 스튜디오.lnk'
if (-not (Test-Path -LiteralPath $desktopLink)) { throw 'Desktop shortcut was not created.' }
$studioShell = New-Object -ComObject WScript.Shell
$shortcut = $studioShell.CreateShortcut($desktopLink)
if ($shortcut.TargetPath -ne $installedExe) { throw 'Desktop shortcut target is incorrect.' }
$result = [ordered]@{
    installer = $installer
    sha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
    installedExe = $installedExe
    desktopShortcut = $desktopLink
    exitCode = $installation.ExitCode
}
$result | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $studioRoot 'release\install-verification.json')
$result | ConvertTo-Json
