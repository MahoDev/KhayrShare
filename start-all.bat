@echo off
echo Starting KhayrShare Services in Background...
call pm2 start ecosystem.config.js
call pm2 save
call pm2 status
pause
