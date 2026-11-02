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
    # The 1.0.27 updater preserves run.bat. Upgrade only that exact stock BAT,
    # while it is waiting for this PowerShell process, so automatic updates can
    # deliver the terminal-close fix without another manual ZIP replacement.
    $batPath = Join-Path $PSScriptRoot 'run.bat'
    $legacyBat = @'
@echo off
setlocal
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1"
if errorlevel 1 (
    echo.
    echo YoBot could not start. Read the error above.
    pause
)
endlocal
'@
    $currentBat = [System.IO.File]::ReadAllText($batPath).Replace("`r`n", "`n").TrimEnd()
    if ($currentBat -eq $legacyBat.Replace("`r`n", "`n").TrimEnd()) {
        [System.IO.File]::AppendAllText($batPath, "`r`nexit 0`r`n", [System.Text.Encoding]::ASCII)
    }

    $node = Get-BundledNode
    & $node (Join-Path $PSScriptRoot 'launch.js')
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
