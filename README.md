# OrgaBoard – KI-gestützte Vorwerk Team- und Vertriebsplattform

> **Schnellster Weg:** GitHub-Repository öffnen → **Code → Codespaces → Create codespace on main**. App, Datenbank, Migrationen und Benutzer starten automatisch. Siehe [`START-HIER.md`](START-HIER.md).

## Sofort starten

### GitHub Codespaces

1. **Code → Codespaces → Create codespace on main**.
2. Warten, bis der Container fertig ist – `.devcontainer/post-create.sh` legt eine `.env` mit zufälligen Secrets an und startet die Container.
3. Port **8080 / OrgaBoard** öffnen.

### Lokal mit Docker

```bash
./start.sh          # macOS/Linux
start.bat           # Windows
```

Beim ersten Aufruf wird eine `.env` mit zufällig erzeugten Secrets angelegt. Danach läuft die App unter `http://localhost:8080`.

`docker compose up` direkt funktioniert ebenfalls, setzt aber eine vorhandene `.env` voraus – siehe [`.env.example`](.env.example). Ein fest eingetragenes Standard-Secret gibt es bewusst nicht: Wer es kennt, kann beliebige Sitzungen fälschen, inklusive der Teamleiter-Rolle.

## Vorbereitete Logins

Das Startpasswort steht nach dem ersten Start als `SEED_DEFAULT_PASSWORD` in deiner `.env`.

Die Konten werden **nur auf einer leeren Datenbank** angelegt. Läuft die App bereits mit echten Benutzern, ändert der Seed nichts mehr.

Die folgenden Adressen sind Platzhalter. Echte E-Mail-Adressen gehören nicht ins Repository – eine eigene Namensliste lässt sich über `SEED_USERS_FILE` als JSON hinterlegen (Format in [`backend/app/seed.py`](backend/app/seed.py)).

| Name | Login-E-Mail | Rolle |
|---|---|---|
| Björn Hahne | `bjoern.hahne@example.com` | Mitarbeiter |
| Jessica Wunder | `jessica.wunder@example.com` | Mitarbeiter |
| Susanne Menzel | `susanne.menzel@example.com` | Mitarbeiter |
| Britta C.B | `britta.cb@example.com` | Mitarbeiter |
| Joachim Hansen | `joachim.hansen@example.com` | Mitarbeiter |
| Matthias Knappe | `matthias.knappe@example.com` | Mitarbeiter |
| Britta Baumhof | `britta.baumhof@example.com` | Mitarbeiter |
| Carsten Böhrensen | `carsten.boehrensen@example.com` | **Teamleiter** |

Alle Konten müssen das Passwort beim ersten Login ändern.

## Was enthalten ist

- React + TypeScript + Vite Frontend im OrgaBoard Dark/Green Design
- FastAPI Backend
- PostgreSQL + SQLAlchemy + Alembic
- serverseitige Rollenrechte für Mitarbeiter und Teamleiter
- Kunden, Termine, Verkäufe mit mehreren Artikeln, Produktvorstellungen und Verleih
- automatische Umsatz- und Einheitenberechnung mit Monatsziel 30
- Teamleiter-Dashboard
- digitale Buntewoche als Wochenraster mit anklickbaren Terminblöcken, PDF-Export
- Verkaufstabelle als Wochenblatt nach der Papiervorlage
- Rechnung zu jedem Verkauf, mit PDF-Beleg
- interne Nachrichten und WebSocket-Aktualisierung
- kontrollierter KI-Assistent mit Tool-/Function-Calling
- lokaler KI-Fallback ohne API-Key für Kernabfragen
- Browser-Spracherkennung und Sprachausgabe
- globale Suche, Benachrichtigungen und Audit-Log
- responsive Smartphone-/Tablet-/Desktop-Oberfläche
- GitHub Codespaces Konfiguration
- GitHub CI

## Vorwerk-Produktdaten

Es werden bewusst **keine erfundenen Preise, Produktinformationen oder Produktbilder** ausgeliefert. Verifizierte Daten können mit Quelle, Zeitstempel und Prüfstatus gepflegt werden. Für einen automatischen Live-Abgleich wird eine offizielle oder anderweitig rechtlich zulässige Vorwerk-Datenquelle/API/Feed samt Nutzungsfreigabe benötigt.

## Externe KI optional aktivieren

Ohne OpenAI API-Key funktionieren die Kernabfragen des lokalen Assistenten. Für flexiblere natürliche Sprache und Folgefragen kann optional eine `.env` angelegt werden:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.5
```

Der KI-Dienst erhält keinen direkten Datenbankzugriff. Er darf nur die serverseitig abgesicherten Tools in `backend/app/services/assistant_tools.py` verwenden.

## Vor öffentlichem Produktivbetrieb

Mit `ENV=production` erzwingt die Anwendung selbst ein eigenes `JWT_SECRET` mit mindestens 32 Zeichen und `COOKIE_SECURE=true`; ein im Repository nachlesbares Secret wird ab `ENV=staging` abgelehnt. Der Start bricht sonst mit einer Fehlermeldung ab.

Organisatorisch bleiben offen: HTTPS-Terminierung, Backups, Monitoring, Datenschutz- und Löschkonzept sowie AV-Verträge – insbesondere für die Adressauflösung in der Routenplanung, die derzeit öffentliche OSM-Dienste nutzt (siehe [`docs/SECURITY.md`](docs/SECURITY.md)).

GitHub allein hostet keine PostgreSQL-/FastAPI-Anwendung dauerhaft; Codespaces dient zum direkten Start/Test. Für eine öffentliche URL ist zusätzlich ein Hosting-Ziel für die Full-Stack-App nötig.

## Dokumentation

- `START-HIER.md` – schnellster Start
- `docs/DEPLOY.md` – Ausrollen auf einen Server mit bestehenden Daten
- `docs/ROADMAP.md` – Funktionsstand und geplante Ausbaustufen
- `docs/ARCHITECTURE.md` – Systemarchitektur
- `docs/DATABASE.md` – Datenmodell
- `docs/RBAC.md` – Rollen- und Berechtigungsmatrix
- `docs/API.md` – API-Struktur
- `docs/AI.md` – KI-Architektur
- `docs/PRODUCT_DATA.md` – Produktdatenstrategie
- `docs/VOICE.md` – Spracharchitektur
- `docs/SECURITY.md` – Sicherheits-/DSGVO-Konzept
- `docs/DESIGN_ANALYSIS.md` – Designanalyse
- `docs/IMPLEMENTATION_STATUS.md` – Funktionsstatus

## Zweites Projekt in diesem Repository

Im Ordner [`raucherhaken24/`](raucherhaken24/) liegt ein eigenständiges Projekt:
der Webshop **Räucherhaken24** (Räucherbedarf, Fachberatung, Wissensportal).
Es hat mit OrgaBoard technisch nichts zu tun, teilt sich nur das Repository.
Start und Datenpflege sind in [`raucherhaken24/README.md`](raucherhaken24/README.md)
beschrieben.
