# Systemarchitektur

## Zielbild

```text
Browser / Smartphone / Tablet
        │
        ├── React UI
        │    ├── Dashboard / CRM / Termine / Verkäufe
        │    ├── Buntewoche
        │    ├── Nachrichten
        │    └── KI + Sprache
        │
        └── HTTPS / WebSocket
                 │
              FastAPI
        ┌────────┼──────────────┐
        │        │              │
      RBAC   Fachservices    KI-Orchestrator
        │        │              │
        └────────┼───────Tool Registry
                 │              │
             SQLAlchemy     OpenAI optional
                 │
             PostgreSQL
```

## Module

Frontend und Backend sind strikt getrennt. Der Backend-Server ist die einzige Instanz, die geschäftliche Daten lesen oder ändern darf. Frontend-Rollenanzeigen sind nur UX; die Autorisierung erfolgt erneut im Backend.

## Datenfluss bei Verkauf

1. Benutzer sendet Verkauf mit mehreren `items`.
2. Server ermittelt erlaubten Mitarbeiter-Scope.
3. Kunde und Produkte werden validiert.
4. `Sale` + mehrere `SaleItem` werden transaktional gespeichert.
5. Wochenstatistik wird aktualisiert.
6. Audit-Log wird geschrieben.
7. WebSocket-Event informiert berechtigte Clients.
8. Dashboard/Buntewoche laden neue berechnete Werte.

## KI

Der Assistent bekommt keinen SQL-Zugang. Ein Tool-Executor kapselt Abfragen und Änderungen. Die Rolle wird aus der authentifizierten Session übernommen und nicht aus KI-Argumenten.

## Skalierung

- Backend stateless mit signierter Session; mehrere Instanzen möglich.
- Für mehrere Backend-Instanzen sollte der In-Memory-WebSocket-Bus durch Redis/NATS ersetzt werden.
- Produkt-Sync kann als separater Worker/Job laufen.
- PostgreSQL ist die produktive Ziel-Datenbank.
