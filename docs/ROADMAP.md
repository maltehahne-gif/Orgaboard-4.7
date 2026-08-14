# Roadmap

Stand: 14.08.2026

Legende: ✅ fertig · 🟡 teilweise vorhanden · ❌ offen

Die Reihenfolge folgt Abhängigkeiten, nicht der Wunschliste: Timeline und
Nachfassen sind das Fundament, aus dem Trichter und mehrere Dashboard-Kennzahlen
als abgeleitete Sichten entstehen. Wer den Trichter zuerst baut, baut die
Datengrundlage zweimal.

---

## Bereits vorhanden (war als offen gelistet)

| Punkt | Wo |
|---|---|
| ✅ Audit-Log, „wer hat was geändert?" | `core/audit.py`, 20 Protokollpunkte in 8 Routern, Ansicht unter `/team/audit` |
| ✅ Verkauf suchen | `SalesPage.tsx` |
| ✅ Verkäufe nach Zeitraum filtern | `SalesPage.tsx` |
| ✅ Verkäufe nach Produkt filtern | `SalesPage.tsx` |
| ✅ Upload-Sicherheitsprüfung | `routers/messages.py` – Größenlimit, gesperrte Endungen, Content-Type, Pfadschutz |
| ✅ Automatische Tests | `.github/workflows/ci.yml` |
| ✅ Security-Review | Durchsicht vom 14.08.2026, 14 von 15 Befunden behoben |
| ✅ Kunden-Notizen | `Customer.notes` – Feld vorhanden, eigene Notizhistorie fehlt noch |
| 🟡 Verleih-Seriennummern | `Rental.serial_number` vorhanden, Gerätehistorie fehlt |
| 🟡 Chat gelesen-Status | `MessageRead` serverseitig vorhanden, Anzeige im Chat fehlt |

---

## Phase 1 – CRM-Fundament ✅

Umgesetzt am 14.08.2026.

### 1.1 Kunden-Timeline ✅
- ✅ Termine chronologisch beim Kunden
- ✅ Vorführungen in der Timeline
- ✅ Verkäufe in der Timeline
- ✅ Verleih in der Timeline (Ausgabe und Rückgabe getrennt)
- ✅ Notizen mit Verlauf – neue Tabelle `customer_notes`
- ✅ komplette Kundenhistorie auf einer Seite – `/kunden/:id`

### 1.2 Wiedervorlage / Nachfassen ✅
- ✅ Nachfassdatum festlegen
- ✅ „Heute nachfassen"-Liste – `/nachfassen`
- ✅ überfällige Nachfassaktionen, mit Anzahl der Tage
- ✅ nach Termin mit Ergebnis „Nichts" Nachfassen anbieten
- ✅ Nachbetreuung nach Verkauf
- 🟡 Erinnerung an Nachfassaktionen – Zähler in der Oberfläche vorhanden,
  Push-Benachrichtigung braucht Phase 5.1

---

## Phase 2 – Auswertung ✅

Umgesetzt am 14.08.2026.

### 2.1 Verkaufstrichter ✅
- ✅ Stufen: Kontakt → Termin vereinbart → Termin durchgeführt → Vorführung → Angebot → Verkauf → Nachbetreuung
- ✅ Conversion Kontakt → Termin
- ✅ Conversion Termin → Verkauf
- ✅ Abschlussquote
- ✅ Darstellung auf dem Dashboard

> Die Stufe „Angebot" ist vorbereitet, aber unbesetzt: dafür fehlt eine
> Angebotserfassung. Bis dahin springen Kunden von Vorführung auf Verkauf.
> Das ist der nächste kleine Baustein, falls die Stufe gebraucht wird.

### 2.2 Dashboard / Management ✅
- ✅ durchgeführte Termine als Kennzahl
- ✅ Abschlussquote
- ✅ Umsatz pro Termin
- ✅ Vorführungen als Kennzahl
- ✅ Verkaufstrichter auf dem Dashboard
- ✅ Zielerreichung pro Mitarbeiter (Teamstatistiken)
- ✅ Produkt-Ranking
- ✅ Trends (Vergleich mit dem gleich langen Zeitraum davor)
- ✅ Teamleiter-Hinweise bei auffälligen Entwicklungen

> Die Hinweise arbeiten mit festen, benannten Schwellen in
> `services/analytics.py` – keine Prognose, kein Modell. Betrifft dieselbe
> Sache mehrere Mitarbeiter, werden die Hinweise zu einer Zeile
> zusammengefasst, sonst verdeckt Wiederholung das Besondere.

---

## Phase 3 – Fachliche Lücken

Unabhängig voneinander, jeweils in sich abgeschlossen.

### 3.1 Altgeräte
- ❌ eigener Bereich mit Kunde, Modell, Seriennummer, Zustand, Datum, Bemerkung, Status
- ❌ Zuordnung zum Verkauf
- ❌ Suche und Filter

### 3.2 Verkäufe
- ❌ Verkauf bearbeiten
- ✅ nach Mitarbeiter filtern (war bereits vorhanden, nur für Teamleiter sichtbar)
- ❌ Storno statt Löschen (Verkauf bleibt mit Stornokennzeichen erhalten)

### 3.3 Produkte
- ❌ archivieren/deaktivieren
- ❌ zentrale Preisverwaltung
- ❌ Preisimport
- ❌ bessere Filter

### 3.4 Verleih
- ❌ Erinnerung vor Rückgabe
- ❌ Warnung bei Überfälligkeit
- ❌ Gerätehistorie
- ❌ vollständige Seriennummernverwaltung

### 3.5 Routenplanung
- ❌ vollständige Apple-Maps-Route
- ❌ Stoppreihenfolge manuell verschieben
- ❌ bessere Behandlung nicht gefundener Adressen
- ❌ Live-Verkehrsdaten
- ⚠️ Vorbedingung: Anbieterwechsel für Adressauflösung, siehe `SECURITY.md`

---

## Phase 4 – Verwaltung und Struktur

### 4.1 Admin-Bereich
- ❌ Mitarbeiter verwalten, Benutzer deaktivieren
- ❌ Rollen und Berechtigungen verwalten
- ❌ Teams und Teamleiter verwalten
- ❌ Monatsziele zentral verwalten
- ❌ Produkte und Preise zentral verwalten

### 4.2 Unternehmensstruktur
- ❌ Regionen, Bezirke, Teams
- ❌ Regionalleiter
- ❌ Hierarchieberechtigungen
- ❌ Mandantenfähigkeit

> Mandantenfähigkeit betrifft praktisch jede Abfrage im Backend. Sie sollte
> entweder früh kommen oder bewusst nie – ein Nachrüsten bedeutet, jede
> bestehende Abfrage anzufassen.

### 4.3 Import / Export
- ❌ Kunden-Import aus CSV/Excel
- ❌ Produktimport
- ❌ Verkaufs-Export nach Excel
- ❌ Teamstatistik-Export
- ❌ automatische Wochen- und Monatsberichte

---

## Phase 5 – App und Betrieb

### 5.1 PWA
- ❌ installierbare PWA mit Manifest und Service Worker
- ❌ App-Icon und Splashscreen
- ❌ Push für Termine, Nachrichten, Verleih, Nachfassen
- ❌ Offline-Modus
- ❌ Offline-Synchronisation

> Offline-Synchronisation ist der aufwendigste Punkt der gesamten Liste.
> Sie verlangt Konfliktauflösung bei gleichzeitigen Änderungen und sollte
> erst angegangen werden, wenn der Rest steht.

### 5.2 Chat
- ❌ Gesendet-Status
- 🟡 Gelesen-Status (serverseitig vorhanden, Anzeige fehlt)
- ❌ einzelne Nachricht löschen
- ❌ Nachricht bearbeiten
- ❌ bessere Bild-Vollbildansicht
- ❌ Push bei neuer Nachricht

### 5.3 Betrieb
- ❌ Testumgebung
- ❌ automatisches Deployment
- ❌ Monitoring und Serverfehler-Warnungen
- ❌ Backup-Überwachung
- ❌ regelmäßige Restore-Tests

### 5.4 Datenschutz
- ❌ Kundendatenexport (Auskunftsrecht)
- ❌ Datenanonymisierung
- ❌ Löschfristen
- ❌ SSO / Microsoft Entra ID
- ❌ Penetrationstest-Vorbereitung

---

## Phase 6 – KI-Assistent

Setzt Phase 1 und 2 voraus – ohne Nachfassdaten und Trichter kann der Assistent
die Fragen nicht beantworten.

- ❌ „Was muss ich heute erledigen?"
- ❌ Kunden mit Nachfassbedarf erkennen
- ❌ Tagesroute, Termine und Aufgaben kombinieren
- ❌ Monatsziel analysieren
- ❌ Vertriebsentwicklung erklären
- ❌ Teamleiter-Assistent
- ❌ Handlungsempfehlungen aus den eigenen Daten
