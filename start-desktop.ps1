$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$localNode = Join-Path $PSScriptRoot '.tools\node-v22.16.0-win-x64'
if (Test-Path -LiteralPath $localNode) { $env:PATH = "$localNode;$env:PATH" }
& npm.cmd run desktop
