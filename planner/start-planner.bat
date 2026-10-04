@echo off
setlocal
cd /d "%~dp0"

set "PLANNER_URL=http://localhost:4173/web/"
set "NODE_EXE="

for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE_EXE (
  echo.
  echo Node.js was not found.
  echo Install Node.js LTS or run this file after Codex has initialized Node.
  echo.
  pause
  exit /b 1
)

if /i "%PLANNER_DRY_RUN%"=="1" (
  echo Node: %NODE_EXE%
  echo URL:  %PLANNER_URL%
  endlocal
  exit /b 0
)

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%PLANNER_URL%' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
  call :open_browser
  endlocal
  exit /b 0
)

start "Student Planner OS Server" cmd /k ""%NODE_EXE%" server.mjs"

for /l %%I in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%PLANNER_URL%' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
  if not errorlevel 1 goto open_browser
  timeout /t 1 /nobreak >nul
)

echo.
echo The local server did not become ready.
echo Keep the server window open and inspect its messages.
pause
endlocal
exit /b 1

:open_browser
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process '%PLANNER_URL%'" >nul 2>nul
if errorlevel 1 start "" "%PLANNER_URL%"
endlocal
exit /b 0
