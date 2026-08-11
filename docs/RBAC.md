# Rollen und Berechtigungen

| Bereich | Mitarbeiter | Teamleiter |
|---|---|---|
| Eigene Termine/Kunden/Verkäufe | Lesen/Schreiben | Lesen/Schreiben |
| Fremde Mitarbeiterdaten | Nein | Ja |
| Teamstatistiken | Nein | Ja |
| Produkte lesen | verifizierte Datensätze | verifizierte + unverifizierte zur Prüfung |
| Produktquellen importieren | Nein | Ja |
| Eigene Buntewoche | Ja | Ja |
| Buntewoche anderer | Nein | Ja |
| Nachrichten | eigene + Teamchat | eigene + Teamchat |
| Audit-Log | Nein | Ja |
| KI auf eigene Daten | Ja | Ja |
| KI auf fremde Daten | Nein | Ja |

## Serverseitige Durchsetzung

`scoped_employee_id()` überschreibt bzw. validiert den Mitarbeiter-Scope. Mitarbeiter können durch manipulierte Request-Parameter keine fremden `employee_id`-Werte lesen. Teamleiter dürfen einen Scope explizit auswählen oder aggregiert arbeiten.
