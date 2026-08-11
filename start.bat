@echo off
docker compose up --build -d
if errorlevel 1 exit /b 1
echo.
echo OrgaBoard laeuft unter http://localhost:8080
pause
