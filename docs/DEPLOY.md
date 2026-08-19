# Auf den Server bringen

Diese Anleitung gilt für ein **bestehendes** OrgaBoard, das bereits mit echten
Benutzern und Kundendaten läuft. Für einen frischen Start siehe
[`START-HIER.md`](../START-HIER.md).

## Vorher lesen: die Postgres-Falle

`docker-compose.yml` hat keine eingebauten Standard-Secrets mehr. Das ist
Absicht – der alte Standardwert für `JWT_SECRET` stand im Repository, und wer
ihn kennt, kann beliebige Sitzungen fälschen, inklusive der Teamleiter-Rolle.

Daraus folgt aber eine Stolperfalle beim Datenbankpasswort:

> **Postgres setzt `POSTGRES_PASSWORD` nur beim allerersten Start eines
> Volumes.** Das Volume `orgaboard_db` existiert bereits und trägt das
> Passwort, mit dem es damals angelegt wurde. Trägst du jetzt ein *neues*
> Passwort in die `.env`, benutzt der Datenbank-Container weiterhin das alte,
> während das Backend sich mit dem neuen anmelden will. Das Backend kommt dann
> nicht mehr an die Datenbank.

Deshalb auf einem laufenden Server **nicht** `./start.sh` verwenden – das Skript
erzeugt zufällige Secrets und ist nur für einen frischen lokalen Start gedacht.

## Schritt 1: `.env` auf dem Server anlegen

Im Projektordner auf dem Server:

```bash
python3 -c "import secrets;print(secrets.token_urlsafe(48))"
```

Den Ausgabewert als `JWT_SECRET` eintragen:

```env
ENV=production
JWT_SECRET=<der eben erzeugte Wert>
COOKIE_SECURE=true

FRONTEND_ORIGIN=https://orgaboard.de
PASSWORD_RESET_ALLOWED_ORIGINS=https://orgaboard.de

# Muss das Passwort des BESTEHENDEN Volumes sein, nicht ein neues.
# Bei der bisherigen Standardkonfiguration war das:
POSTGRES_PASSWORD=orgaboard-local-db-2026

SEED_DEFAULT_PASSWORD=OrgaBoard-Start-2026!
AUTO_CREATE_SCHEMA=false
```

`ENV=production` erzwingt beim Start, dass `COOKIE_SECURE=true` gesetzt und das
`JWT_SECRET` mindestens 32 Zeichen lang sowie kein im Repository nachlesbarer
Standardwert ist. Fehlt eines davon, bricht der Start mit einer Meldung ab,
statt still unsicher weiterzulaufen.

Die vollständige Liste aller Einstellungen steht in
[`../.env.example`](../.env.example).

## Schritt 2: Ausrollen

```bash
git pull origin main
docker compose up --build -d
docker compose logs -f backend
```

Die Migrationen laufen automatisch (`alembic upgrade head`).

## Schritt 3: Prüfen

```bash
curl -s https://orgaboard.de/api/v1/../health   # erwartet: {"status":"ok"}
```

Danach einmal anmelden und ein Dashboard öffnen.

## Was sich beim ersten Start ändert

- **Alle Nutzer werden einmal ausgeloggt.** Das neue `JWT_SECRET` macht die
  bestehenden Sitzungscookies ungültig. Passwörter bleiben unverändert – ein
  normaler Login genügt.
- **Der Seed legt nichts an.** Er läuft nur noch auf einer leeren
  Benutzertabelle. Die bestehenden Konten bleiben unangetastet;
  `SEED_DEFAULT_PASSWORD` ist auf einem laufenden System reine Formsache.

## Datenbankpasswort nachträglich ändern

Wenn das Passwort später doch gewechselt werden soll, zuerst in Postgres selbst,
danach in der `.env`:

```bash
docker compose exec db psql -U orgaboard -d orgaboard \
  -c "ALTER USER orgaboard WITH PASSWORD 'neues-passwort';"
```

Dann `POSTGRES_PASSWORD` in der `.env` auf denselben Wert setzen und
`docker compose up -d` erneut ausführen.

## Sicherung vor dem Ausrollen

```bash
docker compose exec db pg_dump -U orgaboard orgaboard > backup-$(date +%F).sql
```

Die Chat-Anhänge liegen im Volume `orgaboard_chat_media` und sind im
Datenbank-Dump **nicht** enthalten – bei Bedarf separat sichern.

## Kunden einem Mitarbeiter zuordnen (Gebietslisten)

`app/tools/gebietszuordnung.py` ordnet Kunden aus den Gebietslisten dem
zuständigen Mitarbeiter zu. Geändert wird ausschließlich
`customers.employee_id` – Adresse, Telefon, E-Mail, Notizen, Sperrvermerke,
Verkäufe, Termine, Angebote, Verleih und Historien bleiben unberührt.

**Immer zuerst den Trockenlauf.** Er liest, rechnet und berichtet, schreibt
aber nichts:

```bash
docker compose exec backend python -m app.tools.gebietszuordnung
```

Der Bericht nennt Benutzer- und Employee-ID, die Mengen je Gebiet und Ort
sowie die Fälle, die bewusst offen bleiben. Er enthält keine Namen,
Anschriften, Telefonnummern oder E-Mail-Adressen.

Erst danach, nach Sicherung (siehe oben), die Änderung:

```bash
docker compose exec backend python -m app.tools.gebietszuordnung \
  --apply --sicherung /tmp/zuordnung-vorher.csv
```

Die Sicherungsdatei hält je geändertem Kunden die vorherige Employee-ID fest
– der Weg zurück, falls die Zuordnung doch nicht passt. Ohne `--sicherung`
verweigert `--apply` den Dienst.

Wer bestehende Zuordnungen anderer Mitarbeiter gar nicht antasten will,
ergänzt `--fremdzuordnung-behalten`; dann werden sie nur gezählt und im
Bericht ausgewiesen.

Ein zweiter Lauf ändert nichts mehr – das Werkzeug ist wiederholbar.

## Noch offen

Die Routenplanung löst Kundenadressen über die öffentlichen Demo-Dienste
`nominatim.openstreetmap.org` und `router.project-osrm.org` auf. Vor einem
dauerhaften Betrieb mit echten Kundendaten sollte das auf einen Anbieter mit
Auftragsverarbeitungsvertrag umgestellt werden – siehe
[`SECURITY.md`](SECURITY.md).
