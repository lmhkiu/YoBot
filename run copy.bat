@echo off
chcp 65001 >nul

echo ===========================================
echo YoBot Launcher
echo ===========================================

:: 시작 시 임시 파일 정리
if exist "init_new.bat" del "init_new.bat"

:: 최신 init.bat 다운로드
echo Downloading latest init.bat...
curl -f -s -o "init_new.bat" "https://raw.githubusercontent.com/lmhkiu/YoBot/main/init.bat"

:: 다운로드 성공 여부 확인 및 인코딩 변환
if exist "init_new.bat" (
    echo Download successful
    :: UTF-8을 CP949로 인코딩 변환
    powershell -Command "Get-Content 'init_new.bat' -Encoding UTF8 | Set-Content 'init.bat' -Encoding Default"
    del "init_new.bat"
) else (
    echo Download failed, using existing init.bat
)

:: init.bat 실행
call init.bat

:: 임시 정리
if exist "init.bat" del "init.bat"
if exist "init_new.bat" del "init_new.bat"