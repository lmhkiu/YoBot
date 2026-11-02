$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Get-BundledNode {
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw | ConvertFrom-Json
    $relative = [string]$manifest.nodePath
    if ($relative -notmatch '^runtime/node-v[0-9]+\.[0-9]+\.[0-9]+-win-(x64|arm64)/node\.exe$') { throw 'Invalid bundled Node.js path.' }
    $node = Join-Path $PSScriptRoot $relative
    if (-not (Test-Path -LiteralPath $node)) { throw 'Bundled Node.js is missing. Download and extract the complete YoBot.zip again.' }
    return $node
}
try {
    $node = Get-BundledNode
    & $node (Join-Path $PSScriptRoot 'launch.js')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
