# API-Struktur

Basis: `/api/v1`

- `/auth` – Login, Logout, aktuelle Session, Passwortwechsel
- `/dashboard` – persönliche/ausgewählte Kennzahlen
- `/customers` – Kunden CRUD
- `/appointments` – Termine CRUD/Status
- `/sales` – Verkäufe mit mehreren Items, `/sales/wochentabelle` als Wochenblatt
- `/invoices` – Rechnungen zu Verkäufen, `/invoices/{id}/pdf` als Beleg
- `/presentations` – Produktvorstellungen
- `/products` – verifizierte Produkte + Teamleiter-Import
- `/rentals` – Verleih + Status
- `/buntewoche` – Wochenansicht + `/pdf`
- `/messages` – interne Nachrichten
- `/assistant` – Chat und Unterhaltungen
- `/search` – globale Suche
- `/history` – Kunden-/Verkaufshistorie
- `/team` – Mitarbeiter, Teamstatistiken, Audit
- `/profile` – Ziele und Profil
- `/directory/users` – Empfängerverzeichnis
- `/notifications` – Benachrichtigungen

Alle Mutationen nutzen CSRF-Schutz. Die Session kommt aus einem HttpOnly-Cookie.
