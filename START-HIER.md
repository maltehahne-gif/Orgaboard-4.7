# START HIER

Du musst für den ersten Test **keine `.env`-Datei anlegen** und keine Datenbank manuell erstellen.

## Variante A: Direkt über GitHub Codespaces

1. Den Inhalt dieses Ordners in ein GitHub-Repository hochladen.
2. Im Repository auf **Code → Codespaces → Create codespace on main** klicken.
3. Warten, bis der Container fertig gestartet ist.
4. Port **8080 / OrgaBoard** öffnen. Die Vorschau wird normalerweise automatisch angeboten.

Die Datenbank, Migrationen und die acht Benutzer werden beim Start automatisch angelegt.

## Variante B: Auf dem eigenen Rechner

Voraussetzung: Docker Desktop ist installiert.

Im Projektordner nur ausführen:

```bash
docker compose up --build -d
```

Danach im Browser öffnen:

`http://localhost:8080`

## Erstlogin

Für alle acht vorbereiteten Benutzer gilt beim ersten Start dieses temporäre Passwort:

`OrgaBoard-Start-2026!`

Beispiel Teamleiter:

- E-Mail: `carsten.boehrensen@example.com`
- Passwort: `OrgaBoard-Start-2026!`

Das Passwort sollte nach dem ersten Login im Profil geändert werden.

## Wichtig für öffentlichen Produktivbetrieb

Die mitgelieferten Standardwerte sind ausschließlich für einen schnellen privaten Start gedacht. Vor einer öffentlichen Bereitstellung müssen insbesondere `JWT_SECRET`, `POSTGRES_PASSWORD`, `COOKIE_SECURE=true`, HTTPS und echte Benutzerpasswörter gesetzt werden. Ein optionaler `OPENAI_API_KEY` wird nur benötigt, wenn der externe KI-Modus genutzt werden soll; die Kernfunktionen laufen auch ohne API-Key mit dem lokalen Assistenten.
