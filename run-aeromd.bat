@echo off
title AeroMD
echo =========================================
echo  AeroMD - Starting...
echo =========================================
echo.
cd /d "%~dp0docs-viewer"

:: Install dependencies on first run
if not exist "node_modules\" (
    echo  First run detected - installing dependencies...
    npm install
    echo.
)

:: Find Chrome or Edge (Edge is guaranteed on Windows 10/11)
set "BROWSER="
for %%B in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
    "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do (
    if exist %%~B if not defined BROWSER set "BROWSER=%%~B"
)

if not defined BROWSER (
    echo  ERROR: Could not find Chrome or Edge.
    echo  Falling back to default browser...
    start http://localhost:3000
    node server.js
    exit /b
)

echo  Launching AeroMD as webapp...
echo  Close this window to stop the server.
echo.

:: Start the server in background
start /b /min node server.js

:: Wait for server to be ready
timeout /t 2 /nobreak >nul

:: Launch browser in app mode (frameless window, looks like native app)
start "" "%BROWSER%" --app=http://localhost:3000 --new-window --window-size=1400,900

:: Keep the server running - wait for it
echo  Server running on http://localhost:3000
echo  Press Ctrl+C or close this window to stop.
echo.

:: Wait for the node process (keeps bat alive)
:wait_loop
tasklist /fi "WINDOWTITLE eq AeroMD" >nul 2>&1
timeout /t 5 /nobreak >nul
goto wait_loop
