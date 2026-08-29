@echo off
cd /d %~dp0\..
cd backend
node --use-system-ca server.js
pause
