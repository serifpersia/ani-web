@echo off
setlocal EnableDelayedExpansion

cls

if not "%1"=="" (
    set "choice=%1"
    goto process_choice
)

:menu

powershell -NoProfile -Command ^
    "Write-Host '';" ^
    "Write-Host '---------------------------------------------' -ForegroundColor Yellow;" ^
    "Write-Host '                ani-web' -ForegroundColor Cyan;" ^
    "Write-Host '---------------------------------------------' -ForegroundColor Yellow;" ^
    "Write-Host 'https://github.com/serifpersia/ani-web' -ForegroundColor Blue;" ^
    "Write-Host '---------------------------------------------' -ForegroundColor Yellow;" ^
    "Write-Host '';" ^
    "Write-Host 'Please choose a mode to run:' -ForegroundColor Yellow"

echo   1) Development (Install all deps, build, and run hot-reload)
echo   2) Production  (Install, Build, Omit Dev Deps, and Run)
echo.

set /p choice="Enter your choice (1 or 2): "
echo.

:process_choice
if "%choice%"=="1" goto execute_dev
if "%choice%"=="2" goto execute_prod

powershell -NoProfile -Command "Write-Host 'Invalid choice. Please try again.' -ForegroundColor Red"
timeout /t 2 >nul
goto menu

:execute_dev
powershell -NoProfile -Command "Write-Host 'Running in DEVELOPMENT mode...' -ForegroundColor Cyan"
echo.
echo --^> Installing Client Dependencies...
call npm install
echo.
echo --^> Installing Server Dependencies...
call npm install --prefix server
echo.
echo --^> Starting Development Server...
call npm run dev
goto end

:execute_prod
powershell -NoProfile -Command "Write-Host 'Running in PRODUCTION mode...' -ForegroundColor Green"
echo.
echo --^> Installing Client Dependencies (for build)...
call npm install
echo.
echo --^> Installing Server Dependencies (for build)...
call npm install --prefix server
echo.
echo --^> Building Application...
call npm run build
if !errorlevel! neq 0 (
    powershell -NoProfile -Command "Write-Host 'Error: Build failed!' -ForegroundColor Red"
    pause
    exit /b 1
)
echo.
echo --^> Pruning Server to Production Dependencies (Omit Dev)...
call npm install --prefix server --omit=dev
echo.
echo --^> Starting Application...
call npm start
goto end

:end
pause
endlocal
