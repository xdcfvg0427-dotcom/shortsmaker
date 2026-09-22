$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$localNode = Join-Path $PSScriptRoot '.tools\node-v22.16.0-win-x64'
if (Test-Path -LiteralPath $localNode) { $env:PATH = "$localNode;$env:PATH" }
$env:PYTHONUTF8 = '1'
$studioPort = '8000'
if (Test-Path -LiteralPath '.env') {
    $portSetting = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^API_PORT=([0-9]+)$' } | Select-Object -First 1
    if ($portSetting) { $studioPort = $portSetting.Split('=')[1] }
}
try {
    $existingStudio = Invoke-RestMethod -Uri "http://127.0.0.1:$studioPort/api/health" -TimeoutSec 2
    if ($existingStudio.app -eq 'paper-studio') {
        Write-Host "Paper Studio is already running: http://127.0.0.1:$studioPort"
        return
    }
} catch { }
node scripts/tasks.mjs dev
