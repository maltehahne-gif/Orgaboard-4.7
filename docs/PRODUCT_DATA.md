# Produktdatenstrategie

## Warum keine automatischen Vorwerk-Daten im Repository stehen

Aktuelle Preise, Originalbilder und Produkttexte sind zeit- und rechteabhängig. Ohne nachgewiesene offizielle API, lizenzierten Feed oder ausdrückliche Freigabe wäre ein automatischer Scraper keine robuste Grundlage.

## Speichermodell

Jeder Produktdatensatz kennt:

- Quelle (`source_url`, `source_kind`)
- Aktualisierungszeitpunkt
- Prüfstatus `verified`
- offizielle Produktseite

Preise und Bilder werden separat historisiert. Ein Bild hat zusätzlich `usage_note` für Lizenz/Nutzungshinweise.

## Produktionsintegration

Empfohlene Reihenfolge:

1. Vorwerk/offiziellen Ansprechpartner nach API/Feed/Export und Nutzungsrecht fragen.
2. Vertraglich erlaubte Felder/Bilder festlegen.
3. Provider-Adapter implementieren, der auf `upsert_verified_product()` schreibt.
4. Synchronisationsjob mit Retry, Logging und Quellzeitstempel einrichten.
5. Bei Fehlern vorhandene letzte verifizierte Daten mit Stand anzeigen; niemals Werte erfinden.
