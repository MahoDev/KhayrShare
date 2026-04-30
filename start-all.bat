@echo off
echo ========================================
echo Starting KhayrShare Services in Background...
echo ========================================

:: Ensure we are in the project directory
cd /d "%~dp0"

:: Start the services via PM2
call pm2 start ecosystem.config.js

:: Save the list for automatic resurrection on reboot
call pm2 save

:: Show the current status
call pm2 status

echo.
echo Services are now running in the background.
echo This window will close in 5 seconds...
timeout /t 5
