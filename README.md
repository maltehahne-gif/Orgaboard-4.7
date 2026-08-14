# OrgaBoard – KI-gestützte Vorwerk Team- und Vertriebsplattform

Dieses Repository ist so vorbereitet, dass du es **entpacken, in GitHub hochladen und direkt starten** kannst. Für den ersten privaten Test ist **keine `.env`-Datei** nötig.

> **Schnellster Weg:** GitHub-Repository öffnen → **Code → Codespaces → Create codespace on main**. Die App, Datenbank, Migrationen und Benutzer werden automatisch gestartet. Siehe [`START-HIER.md`](START-HIER.md).

## Sofort starten

### GitHub Codespaces

1. Inhalt dieses ZIPs in ein GitHub-Repository hochladen.
2. **Code → Codespaces → Create codespace on main**.
3. Port **8080 / OrgaBoard** öffnen.

### Lokal mit Docker

```bash
docker compose up --build -d
```

Danach: `http://localhost:8080`

Unter Windows kann alternativ `start.bat`, unter macOS/Linux `./start.sh` verwendet werden.

## Vorbereitete Logins

Temporäres Erstpasswort für alle Konten: **`OrgaBoard-Start-2026!`**

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

Die Benutzer werden beim ersten Start automatisch angelegt. Der Seed ist idempotent; weitere Starts erzeugen keine doppelten Benutzer.

## Was enthalten ist

- React + TypeScript + Vite Frontend im OrgaBoard Dark/Green Design
- FastAPI Backend
- PostgreSQL + SQLAlchemy + Alembic
- serverseitige Rollenrechte für Mitarbeiter und Teamleiter
- Kunden, Termine, Verkäufe mit mehreren Artikeln, Produktvorstellungen und Verleih
- automatische Umsatz- und Einheitenberechnung mit Monatsziel 30
- Teamleiter-Dashboard
- digitale Buntewoche und PDF-Export
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

Die eingebauten Standardwerte sind nur für einen schnellen privaten Start gedacht. Für eine echte öffentliche Bereitstellung müssen mindestens sichere Secrets, HTTPS, `COOKIE_SECURE=true`, Backups, Monitoring, Datenschutz-/Löschkonzept und echte Benutzerpasswörter eingerichtet werden. GitHub allein hostet keine PostgreSQL-/FastAPI-Anwendung dauerhaft; Codespaces dient zum direkten Start/Test. Für eine öffentliche URL ist zusätzlich ein Hosting-Ziel für die Full-Stack-App nötig.

## Dokumentation

- `START-HIER.md` – schnellster Start
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
