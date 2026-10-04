@echo off
setlocal
cd /d "%~dp0"

call "%~dp0start-planner.bat"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173/web/validation-simulation.html"

endlocal

