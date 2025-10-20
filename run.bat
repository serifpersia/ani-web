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

echo   1) Development (Install all deps, build, and run)
echo   2) Production  (Install prod deps and run pre-built version)
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
echo --^> Installing all dependencies ^(npm install^)...
call npm install --no-audit
if !errorlevel! neq 0 (
    powershell -NoProfile -Command "Write-Host 'Error: npm install failed!' -ForegroundColor Red"
    pause
    exit /b 1
)
echo.
echo --^> Building application ^(npm run build^)...
call npm run build
if !errorlevel! neq 0 (
    powershell -NoProfile -Command "Write-Host 'Error: Build failed!' -ForegroundColor Red"
    pause
    exit /b 1
)
echo.
echo --^> Starting application ^(npm start^)...
call npm start
goto end

:execute_prod
powershell -NoProfile -Command "Write-Host 'Running in PRODUCTION mode...' -ForegroundColor Green"
echo.
echo --^> Installing production dependencies ^(npm install --omit=dev^)...
call npm install --omit=dev
if !errorlevel! neq 0 (
    powershell -NoProfile -Command "Write-Host 'Error: npm install failed!' -ForegroundColor Red"
    pause
    exit /b 1
)
echo.
echo --^> Starting application ^(npm start^)...
call npm start
goto end

:end
pause
endlocal