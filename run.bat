@echo off

echo ===========================================
echo YoBot Auto Updater
echo ===========================================
 
:: 업데이트 확인 및 적용
echo Checking for updates...
call npm run update
 
echo.
echo Starting YoBot...
echo ===========================================


for /f %%i in ('node -e "(async () => { const config = await import('./config.js'); console.log(config.default.PORT.SERVER); })()"') do set SERVER_PORT=%%i
for /f %%i in ('node -e "(async () => { const config = await import('./config.js'); console.log(config.default.PORT.CHAT_DISPLAY); })()"') do set CHAT_DISPLAY_PORT=%%i


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
