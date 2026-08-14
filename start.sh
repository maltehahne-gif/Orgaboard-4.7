#!/usr/bin/env sh
# Startet OrgaBoard lokal. Legt beim ersten Aufruf eine .env mit zufaelligen
# Secrets an, damit keine im Repository nachlesbaren Schluessel im Einsatz sind.
set -eu

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  printf 'Erster Start: lege .env mit zufaelligen Secrets an ...\n'

  gen() {
    python3 -c 'import secrets;print(secrets.token_urlsafe(48))' 2>/dev/null \
      || head -c 36 /dev/urandom | base64 | tr -d '=+/'
  }

  {
    echo "ENV=development"
    echo "FRONTEND_ORIGIN=http://localhost:8080"
    echo "PASSWORD_RESET_ALLOWED_ORIGINS=http://localhost:8080"
    echo "JWT_SECRET=$(gen)"
    echo "POSTGRES_PASSWORD=$(gen)"
    echo "SEED_DEFAULT_PASSWORD=OrgaBoard-Start-2026!"
    echo "COOKIE_SECURE=false"
    echo "AUTO_CREATE_SCHEMA=false"
  } > .env

  printf 'Fertig. Startpasswort steht als SEED_DEFAULT_PASSWORD in .env.\n\n'
fi

docker compose up --build -d

printf '\nOrgaBoard laeuft unter http://localhost:8080\n'
