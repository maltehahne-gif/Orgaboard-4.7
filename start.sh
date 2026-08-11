#!/usr/bin/env sh
set -eu
docker compose up --build -d
printf '\nOrgaBoard läuft unter http://localhost:8080\n'
