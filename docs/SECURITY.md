# Sicherheits- und Datenschutzkonzept

## Bereits im Code

- Argon2-Passwort-Hashing
- HttpOnly-Sessioncookie
- SameSite-Cookie und CSRF-Token für **alle** schreibenden Endpunkte
- Sperre nach wiederholten Fehllogins (prozesslokal, pro E-Mail und IP)
- Passwort-Reset-Links ausschließlich auf konfigurierte Adressen
- Start bricht ab, wenn ein im Repository nachlesbares JWT-Secret genutzt wird
- serverseitiges RBAC/Data Scoping
- keine Datenbankzugriffe durch das LLM selbst
- Audit-Logs wichtiger Fachänderungen
- Soft-Delete-Feld für Kunden vorbereitet
- Quell-/Verifikationspflicht für Produktdaten
- keine produktiven Demo-Preise

## Offene Punkte mit Datenschutzbezug

- **Routenplanung**: Die Seite löst Kundenadressen im Browser über
  `nominatim.openstreetmap.org` auf und schickt die Koordinaten an
  `router.project-osrm.org`. Beides sind öffentliche Demo-Dienste ohne
  AV-Vertrag; die OSRM-Demoinstanz ist nicht für den produktiven Einsatz
  vorgesehen, Nominatim untersagt Massenabfragen. Vor einem Einsatz mit echten
  Kundendaten auf einen Anbieter mit AV-Vertrag umstellen und die Auflösung
  über das Backend führen, damit Adressen nicht aus dem Browser abfließen.

## Vor Produktion organisatorisch/technisch ergänzen

- HTTPS/TLS und `COOKIE_SECURE=true` (wird ab `ENV=production` erzwungen)
- Secret Manager statt `.env` auf dem Server
- Login-Sperre auf gemeinsamen Speicher umstellen, sobald mehr als eine
  Instanz läuft – die aktuelle Umsetzung ist prozesslokal
- Backup- und Restore-Konzept
- zentrale revisionsgeeignete Logs je Anforderung
- Datenaufbewahrung und Löschworkflows gemäß Rechtsgrundlage
- AV-Verträge mit Hosting-/KI-/Speech-Anbietern
- Berechtigungskonzept regelmäßig prüfen
- Penetrationstest/Dependency-Scanning
- Incident-Response-Prozess

Die Anwendung kann technisch DSGVO-gerecht betrieben werden; eine Aussage „100 % DSGVO-konform“ kann ohne konkrete Betriebsumgebung, Rechtsgrundlagen, Verträge und Prozesse nicht seriös allein durch Quellcode garantiert werden.
