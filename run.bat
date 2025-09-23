@echo off
setlocal EnableDelayedExpansion

color 0a

cls

echo.
echo   [1;33m---------------------------------------------[0m
echo   [1;36m                ani-web                      [0m        
echo   [1;33m---------------------------------------------[0m
echo   [1;34mhttps://github.com/serifpersia/ani-web       [0m
echo   [1;33m---------------------------------------------[0m
echo.
echo [1;32mStarting ani-web...[0m
echo.

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install --omit=dev
)
echo Building and running ani-web....
call npm run build
call npm start
pause