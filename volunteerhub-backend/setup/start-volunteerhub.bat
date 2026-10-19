@echo off
cd /d "%~dp0.."
echo Starting VolunteerHub on http://localhost:3001  (Swagger: http://localhost:3001/api/docs)
call npm run dev
pause
