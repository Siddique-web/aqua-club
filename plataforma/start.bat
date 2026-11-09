@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale Node.js 22+ em https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install
echo.
echo Aqua Club a abrir em http://localhost:5173
echo.
node --experimental-sqlite server/index.mjs
pause
