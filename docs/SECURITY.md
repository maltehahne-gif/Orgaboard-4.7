# Sicherheits- und Datenschutzkonzept

## Bereits im Code

- Argon2-Passwort-Hashing
- HttpOnly-Sessioncookie
- SameSite-Cookie und CSRF-Token für Mutationen
- serverseitiges RBAC/Data Scoping
- keine Datenbankzugriffe durch das LLM selbst
- Audit-Logs wichtiger Fachänderungen
- Soft-Delete-Feld für Kunden vorbereitet
- Quell-/Verifikationspflicht für Produktdaten
- keine produktiven Demo-Preise

## Vor Produktion organisatorisch/technisch ergänzen

- HTTPS/TLS und `COOKIE_SECURE=true`
- Secret Manager statt `.env` auf dem Server
- Rate Limiting/Brute-Force-Schutz beim Login
- Backup- und Restore-Konzept
- zentrale revisionsgeeignete Logs je Anforderung
- Datenaufbewahrung und Löschworkflows gemäß Rechtsgrundlage
- AV-Verträge mit Hosting-/KI-/Speech-Anbietern
- Berechtigungskonzept regelmäßig prüfen
- Penetrationstest/Dependency-Scanning
- Incident-Response-Prozess

Die Anwendung kann technisch DSGVO-gerecht betrieben werden; eine Aussage „100 % DSGVO-konform“ kann ohne konkrete Betriebsumgebung, Rechtsgrundlagen, Verträge und Prozesse nicht seriös allein durch Quellcode garantiert werden.
