@echo off

echo [DEBUG] Starting batch file...
echo.

echo [DEBUG] Testing get-ports.js output...
node get-ports.js
if errorlevel 1 (
    echo [ERROR] node get-ports.js failed
    goto :error
)
echo.

:: config.js에서 포트 번호 읽기
echo [DEBUG] Reading ports from config.js...
for /f "tokens=1,2 delims=:" %%a in ('node get-ports.js') do (
    echo [DEBUG] Setting SERVER_PORT=%%a, CHAT_PORT=%%b
    set SERVER_PORT=%%a
    set CHAT_PORT=%%b
)

:: 변수 값 확인 (일반 확장 사용)
echo [DEBUG] SERVER_PORT is: %SERVER_PORT%
echo [DEBUG] CHAT_PORT is: %CHAT_PORT%

:: 변수가 설정되었는지 확인
if "%SERVER_PORT%"=="" (
    echo [ERROR] SERVER_PORT is not set!
    goto :error
)

if "%CHAT_PORT%"=="" (
    echo [ERROR] CHAT_PORT is not set!
    goto :error
)

echo [DEBUG] Checking for existing servers on ports %SERVER_PORT% and %CHAT_PORT%...

:: SERVER 포트를 사용하는 프로세스 확인 및 종료
for /f "tokens=5" %%a in ('netstat -ano ^| find ":%SERVER_PORT%" ^| find "LISTENING"') do (
    echo [DEBUG] Found existing process (PID: %%a) using port %SERVER_PORT%. Terminating...
    taskkill /PID %%a /F >nul 2>&1
)

echo [SUCCESS] Batch completed successfully!
goto :end

:error
echo.
echo [ERROR] An error occurred. Check the debug output above.
pause
goto :eof

:end
echo.
echo [INFO] Press any key to exit...
pause