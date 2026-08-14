@echo off
REM Startet OrgaBoard lokal. Legt beim ersten Aufruf eine .env mit zufaelligen
REM Secrets an, damit keine im Repository nachlesbaren Schluessel im Einsatz sind.
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Erster Start: lege .env mit zufaelligen Secrets an ...

  for /f %%i in ('powershell -NoProfile -Command "[Convert]::ToBase64String((1..36 ^| %%{Get-Random -Max 256})) -replace '[=+/]',''"') do set JWTSECRET=%%i
  for /f %%i in ('powershell -NoProfile -Command "[Convert]::ToBase64String((1..24 ^| %%{Get-Random -Max 256})) -replace '[=+/]',''"') do set DBPASS=%%i

  (
    echo ENV=development
    echo FRONTEND_ORIGIN=http://localhost:8080
    echo PASSWORD_RESET_ALLOWED_ORIGINS=http://localhost:8080
    echo JWT_SECRET=%JWTSECRET%
    echo POSTGRES_PASSWORD=%DBPASS%
    echo SEED_DEFAULT_PASSWORD=OrgaBoard-Start-2026!
    echo COOKIE_SECURE=false
    echo AUTO_CREATE_SCHEMA=false
  ) > .env

  echo Fertig. Startpasswort steht als SEED_DEFAULT_PASSWORD in .env.
  echo.
)

docker compose up --build -d

echo.
echo OrgaBoard laeuft unter http://localhost:8080
