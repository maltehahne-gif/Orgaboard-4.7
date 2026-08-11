# Datenbankmodell

## Kerntabellen

- `users` – Login, Rolle, Passwort-Hash
- `employees` – Mitarbeiterprofil und Ziele
- `customers` – Kundendaten + zuständiger Mitarbeiter
- `appointments` – Termine + Status + Snapshots der Kontaktdaten
- `appointment_products` – geplante Produktvorstellungen je Termin
- `products` – verifizierbare Produktstammdaten
- `product_prices` – historisierbare Preise mit Quelle
- `product_images` – Bilder mit Quelle/Nutzungshinweis
- `sales` – Verkaufskopf
- `sale_items` – beliebig viele Produkte pro Verkauf
- `product_presentations` – vorgestellte Produkte getrennt von Verkäufen
- `rentals` – Verleih inkl. Seriennummer und Rückgabestatus
- `messages` – Einzel- oder Teamnachrichten
- `conversations`, `conversation_messages` – lokaler KI-Kontext
- `weekly_statistics` – berechenbarer Wochen-Cache
- `notifications` – Benachrichtigungen
- `audit_logs` – Änderungsprotokoll

## Beziehungen

```text
User 1 ─ 1 Employee
Employee 1 ─ n Customer
Employee 1 ─ n Appointment
Customer 1 ─ n Appointment
Appointment n ─ m Product
Employee 1 ─ n Sale
Customer 1 ─ n Sale
Sale 1 ─ n SaleItem ─ n Product
Customer 1 ─ n ProductPresentation ─ n Product
Employee 1 ─ n Rental ─ n Product
Customer 1 ─ n Rental
User 1 ─ n Message (Sender/Empfänger)
User 1 ─ n Conversation ─ n ConversationMessage
```

Umsatz wird nicht doppelt gepflegt. Er entsteht aus `quantity * unit_price_cents` der `sale_items`. Einheiten sind die Summe der `quantity`.
