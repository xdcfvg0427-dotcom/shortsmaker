$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pidFile = Join-Path $PSScriptRoot 'storage\server-pids.json'
if (Test-Path -LiteralPath $pidFile) {
    $studioProcesses = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
    foreach ($studioProcessId in @($studioProcesses.api, $studioProcesses.worker)) {
        $studioProcess = Get-Process -Id $studioProcessId -ErrorAction SilentlyContinue
        if ($studioProcess -and $studioProcess.Path -and $studioProcess.Path.StartsWith($PSScriptRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            & taskkill.exe /PID $studioProcessId /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not stop process $studioProcessId. Close its original terminal or use the same account that started it." }
        }
    }
    Remove-Item -LiteralPath $pidFile
}
Write-Host 'Background Paper Studio processes stopped. For npm run dev, use Ctrl+C in its terminal.'
