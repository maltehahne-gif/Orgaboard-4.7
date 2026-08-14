#!/usr/bin/env bash
# Startet OrgaBoard beim Anlegen des Codespace.
#
# In Codespaces ist die Vorschau-URL erst zur Laufzeit bekannt. Sie wird hier
# ermittelt und als FRONTEND_ORIGIN gesetzt, damit CORS und die Passwort-Reset-
# Links auf die richtige Adresse zeigen - der Origin-Header wird dafuer bewusst
# nicht mehr ausgewertet.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "${CODESPACE_NAME:-}" ]; then
  DOMAIN="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  ORIGIN="https://${CODESPACE_NAME}-8080.${DOMAIN}"
else
  ORIGIN="http://localhost:8080"
fi

if [ ! -f .env ]; then
  echo "Lege .env an (FRONTEND_ORIGIN=${ORIGIN})"
  {
    echo "ENV=development"
    echo "FRONTEND_ORIGIN=${ORIGIN}"
    echo "PASSWORD_RESET_ALLOWED_ORIGINS=${ORIGIN}"
    echo "JWT_SECRET=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')"
    echo "POSTGRES_PASSWORD=$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
    echo "SEED_DEFAULT_PASSWORD=OrgaBoard-Start-2026!"
  } > .env
fi

echo "Starte Container ..."
docker compose up --build -d

cat <<EOF

OrgaBoard laeuft.

  Adresse:  ${ORIGIN}
  Login:    siehe README.md
  Passwort: aus SEED_DEFAULT_PASSWORD in .env

Die acht Konten werden nur auf einer leeren Datenbank angelegt.
EOF
