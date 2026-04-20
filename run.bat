::[Bat To Exe Converter]
::
::YAwzoRdxOk+EWAjk
::fBw5plQjdCyDJE+X9000LVtEXguIOWiuOowTyufv0+OErUNTXeEwGA==
::YAwzuBVtJxjWCl3EqQJgSA==
::ZR4luwNxJguZRRnk
::Yhs/ulQjdF+5
::cxAkpRVqdFKZSzk=
::cBs/ulQjdF+5
::ZR41oxFsdFKZSDk=
::eBoioBt6dFKZSDk=
::cRo6pxp7LAbNWATEpCI=
::egkzugNsPRvcWATEpCI=
::dAsiuh18IRvcCxnZtBJQ
::cRYluBh/LU+EWAnk
::YxY4rhs+aU+JeA==
::cxY6rQJ7JhzQF1fEqQJQ
::ZQ05rAF9IBncCkqN+0xwdVs0
::ZQ05rAF9IAHYFVzEqQJQ
::eg0/rx1wNQPfEVWB+kM9LVsJDGQ=
::fBEirQZwNQPfEVWB+kM9LVsJDGQ=
::cRolqwZ3JBvQF1fEqQJQ
::dhA7uBVwLU+EWDk=
::YQ03rBFzNR3SWATElA==
::dhAmsQZ3MwfNWATElA==
::ZQ0/vhVqMQ3MEVWAtB9wSA==
::Zg8zqx1/OA3MEVWAtB9wSA==
::dhA7pRFwIByZRRnk
::Zh4grVQjdCyDJE+X9000LVtEXguIOWiuOowTyufv09OIgEIJGucnfe8=
::YB416Ek+ZW8=
::
::
::978f952a14a936cc963da21a135fa983
@echo off


echo ===========================================
echo YoBot Launcher
echo ===========================================

echo Checking for node_modules...
:: node_modules 존재 ?��? ?�인
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
:: update.js�?update-run.js�?복사
copy "update.js" "update-run.js"
 
:: 복사???�일�??�데?�트 ?�행
call node "update-run.js"
 
:: ?�시 ?�일 ??��
if exist "update-run.js" del "update-run.js"
 
echo.
echo Starting YoBot...
echo ===========================================

echo.
:: config.js?�서 ?�트 추출 (문자???�싱)
echo Extracting ports from config.js...
for /f "tokens=2 delims=,:" %%i in ('findstr "SERVER.*[0-9]" config.js') do set SERVER_PORT=%%i
for /f "tokens=2 delims=,:" %%i in ('findstr "CHAT_DISPLAY.*[0-9]" config.js') do set CHAT_DISPLAY_PORT=%%i

:: 공백 ?�거
set SERVER_PORT=%SERVER_PORT: =%
set CHAT_DISPLAY_PORT=%CHAT_DISPLAY_PORT: =%

echo Server Port: %SERVER_PORT%
echo Chat Display Port: %CHAT_DISPLAY_PORT%
echo.
echo Terminating processes using these ports...
:: ?�트 %SERVER_PORT%???�용?�는 ?�로?�스 찾기
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SERVER_PORT%') do (
    echo Found process %%a using port %SERVER_PORT%, terminating...
    taskkill /F /PID %%a 2>nul
)

:: ?�트 %CHAT_DISPLAY_PORT%???�용?�는 ?�로?�스 찾기
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%CHAT_DISPLAY_PORT%') do (
    echo Found process %%a using port %CHAT_DISPLAY_PORT%, terminating...
    taskkill /F /PID %%a 2>nul
)


echo Starting server.js...
start "Server" cmd /k node src/server/server.js
::start node src/server/server.js

:wait_for_server
timeout /t 1 /nobreak >nul
netstat -ano | findstr :%SERVER_PORT% >nul
if errorlevel 1 goto wait_for_server

:: ?�정 ?�이지 ?�기
echo Opening configuration page...
start http://localhost:%SERVER_PORT%/run.html

echo.
echo ===========================================
echo Server startup completed!
echo - Run page: http://localhost:%SERVER_PORT%/run.html
echo ===========================================
exit