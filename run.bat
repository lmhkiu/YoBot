@echo off
setlocal
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1"
if errorlevel 1 (
    echo.
    echo YoBot could not start. Read the error above.
    pause
    endlocal
    exit 1
)
endlocal
exit 0
