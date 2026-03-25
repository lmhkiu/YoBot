@echo off
chcp 65001 >nul

echo ===========================================
echo YoBot Initializer
echo ===========================================
 

echo Checking for node_modules...
:: node_modules 존재 여부 확인
if not exist "node_modules" (
    echo node_modules not found. Installing dependencies...
    echo This may take a few minutes...
    npm install
    if errorlevel 1 (
        echo Failed to install dependencies. Please check your internet connection and try again.
        pause
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)


:: 버전 체크
echo Checking version...
node -e "const pkg = require('./package.json'); console.log('Current version:', pkg.version);"
:: update.js를 update-run.js로 복사
copy "update.js" "update-run.js"
 
:: 복사된 파일로 업데이트 실행
call node "update-run.js"
 
:: 임시 파일 삭제
if exist "update-run.js" del "update-run.js"
 
echo.
echo Starting YoBot...
echo ===========================================

:: init.bat 수정
for /f %%i in ('node -e "const config = require('./config.js'); console.log(config.PORT.SERVER);"') do set SERVER_PORT=%%i
for /f %%i in ('node -e "const config = require('./config.js'); console.log(config.PORT.CHAT_DISPLAY);"') do set CHAT_DISPLAY_PORT=%%i

:: 포트 %SERVER_PORT%을 사용하는 프로세스 찾기
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SERVER_PORT%') do (
    echo Found process %%a using port %SERVER_PORT%, terminating...
    taskkill /F /PID %%a 2>nul
)

:: 포트 %CHAT_DISPLAY_PORT%을 사용하는 프로세스 찾기
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%CHAT_DISPLAY_PORT%') do (
    echo Found process %%a using port %CHAT_DISPLAY_PORT%, terminating...
    taskkill /F /PID %%a 2>nul
)


echo Starting server.js...
start "Server" cmd /k node src/server/server.js

timeout /t 2 /nobreak >nul

:: 설정 페이지 열기
echo Opening configuration page...
start http://localhost:13101/run.html

echo.
echo ===========================================
echo Server startup completed!
echo - Run page: http://localhost:13101/run.html
echo ===========================================
pause