# Implementierungsstatus zur Definition „fertig“

| # | Kriterium | Status |
|---|---|---|
| 1 | Persönlicher Login für alle 8 Nutzer | ✅ Seed + Auth |
| 2 | Mitarbeiter sieht nur erlaubte Daten | ✅ serverseitiger Scope |
| 3 | Teamleiter sieht Teamdaten | ✅ Team-Endpunkte/Dashboard |
| 4 | Kunden erstellen/bearbeiten | ✅ |
| 5 | Termine erstellen | ✅ |
| 6 | KI erkennt nächsten Termin | ✅ lokal + Tool |
| 7 | Verkauf mit mehreren Produkten | ✅ `sale_items` |
| 8 | Umsatz automatisch | ✅ aus SaleItems berechnet |
| 9 | Einheiten automatisch | ✅ Menge der SaleItems |
| 10 | Monatsziel 30 | ✅ pro Profil konfigurierbar, Standard 30 |
| 11 | Produktvorstellungen speichern | ✅ API + Produktaktion |
| 12 | Verleih verwalten | ✅ inkl. Rückgabestatus |
| 13 | Buntewoche zeigt Termine | ✅ |
| 14 | Buntewoche-Kennzahlen automatisch | ✅ |
| 15 | PDF-Export | ✅ |
| 16 | Nachrichten | ✅ Einzel/Team + WebSocket-Event |
| 17 | Produktinfos aus echten Quellen | ⚠️ Import-Pipeline vorhanden; echte Quelle muss bereitgestellt/freigegeben werden |
| 18 | Produktpreise aus echten Quellen | ⚠️ dito |
| 19 | Produktbilder aus erlaubten Quellen | ⚠️ dito inkl. Nutzungshinweis |
| 20 | KI greift auf Produktinfos zu | ✅ auf verifizierte Datensätze |
| 21 | KI greift auf persönliche Termine zu | ✅ |
| 22 | KI versteht Folgefragen | ✅ mit LLM; lokaler Fallback für zentrale Kontexte |
| 23 | Spracheingabe | ✅ Browser-API; Browserunterstützung beachten |
| 24 | Sprachausgabe | ✅ Browser Speech Synthesis |
| 25 | Smartphone/Tablet/PC | ✅ responsive Layout |
| 26 | UI an Vorlage orientiert | ✅ visuelle Umsetzung |
| 27 | Buntewoche an Vorlage orientiert | ✅ Tabellen-/Farblogik |
| 28 | Rollen serverseitig | ✅ |
| 29 | Keine erfundenen produktiven Daten | ✅ Designprinzip/Validierung |
| 30 | Auto-Refresh nach Änderungen | ✅ WebSocket-Events; Dashboard reagiert, andere Seiten laden bei Aktionen neu |

## Externe Voraussetzungen

Die drei Punkte 17–19 können ohne zulässige Vorwerk-Datenquelle und Nutzungsfreigabe nicht seriös „vorbefüllt“ werden. Das Repository löst das durch eine kontrollierte, quellengebundene Importstrategie statt durch erfundene Daten.
