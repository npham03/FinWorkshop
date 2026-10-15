@echo off
setlocal
cd /d "%~dp0"
title FinWorkshop Launcher

echo Starting FinWorkshop...

rem Also use the Node runtime bundled with Codex when system Node.js is absent.
for /d %%R in ("%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\*") do if exist "%%~fR\bin\node.exe" set "PATH=%%~fR\bin;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer was not found. Install Node.js or launch FinWorkshop from the Codex environment.
  goto :failed
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm enabled, then try again.
  goto :failed
)

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is not installed or is not on PATH.
  goto :failed
)

docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is not running. Open Docker Desktop, wait until it is ready, then run this file again.
  goto :failed
)

if not exist "apps\middleware-api\.env" (
  if exist "apps\middleware-api\.env.example" (
    copy /Y "apps\middleware-api\.env.example" "apps\middleware-api\.env" >nul
  ) else (
    echo Missing apps\middleware-api\.env.example.
    goto :failed
  )
)

if not exist "apps\mock-tax-api\.env" (
  if exist "apps\mock-tax-api\.env.example" (
    copy /Y "apps\mock-tax-api\.env.example" "apps\mock-tax-api\.env" >nul
  ) else (
    echo Missing apps\mock-tax-api\.env.example.
    goto :failed
  )
)

if not exist "apps\web-client\.env.local" (
  if exist "apps\web-client\.env.example" (
    copy /Y "apps\web-client\.env.example" "apps\web-client\.env.local" >nul
  ) else (
    echo Missing apps\web-client\.env.example.
    goto :failed
  )
)

echo Starting MySQL and Odoo with Docker Compose...
docker compose -f "infrastructure\odoo-docker\docker-compose.yml" up -d --wait app-db odoo-db odoo
if errorlevel 1 (
  echo Docker Compose could not start the databases and Odoo. Check Docker Desktop and try again.
  goto :failed
)

if not exist "node_modules\.bin\concurrently.cmd" (
  echo Installing project packages. This is only needed on the first run...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    goto :failed
  )
)

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173' -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo FinWorkshop is already running. Opening it in your browser...
  start "" "http://localhost:5173"
  exit /b 0
)

echo Launching the web app and APIs in a separate window...
start "FinWorkshop services" "%ComSpec%" /k "cd /d ""%~dp0"" && npm run dev"

echo Waiting for the web app to respond...
powershell -NoProfile -Command "$deadline = (Get-Date).AddSeconds(90); do { try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:5173' -TimeoutSec 3; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } } catch {}; Start-Sleep -Seconds 2 } while ((Get-Date) -lt $deadline); exit 1" >nul 2>nul
if errorlevel 1 (
  echo The web app did not respond yet. Check the FinWorkshop services window for errors.
  start "" "http://localhost:5173"
  goto :failed
)

echo FinWorkshop is ready. Opening http://localhost:5173
echo Keep the FinWorkshop services window open while using the app.
start "" "http://localhost:5173"
exit /b 0

:failed
echo.
pause
exit /b 1
