@echo off
echo Starting Background Video Generator with PM2...
pushd "%~dp0"
call pm2 start scheduler.js --name video-generator
call pm2 save
call pm2 status
popd
timeout /t 5

