@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer from https://nodejs.org/
  pause
  exit /b 1
)
start "NMUSA Signage Server" /min cmd /c "node server.js"
timeout /t 2 /nobreak >nul
start "" msedge.exe --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen
