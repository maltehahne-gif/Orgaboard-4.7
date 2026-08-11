# KI-Architektur

## Prinzip

Die KI darf keine Datenbankabfragen frei formulieren. `assistant_tools.py` definiert erlaubte Funktionen inklusive JSON-Schema. Der Tool-Executor führt sie mit dem authentifizierten `User` und einer SQLAlchemy-Session aus.

## Enthaltene Tools

- `get_next_appointment`
- `get_appointments`
- `search_customer`
- `get_customer_history`
- `search_products`
- `get_product_details`
- `get_weekly_revenue`
- `get_weekly_units`
- `get_rentals`
- `create_appointment`
- `update_appointment_status`
- `create_sale` mit explizitem Bestätigungsparameter
- `send_message`

## Kontext

Unterhaltungen und Nachrichten werden lokal in `conversations`/`conversation_messages` gespeichert. Zusätzlich kann `last_entity_type/id` für sichere Folgefragen verwendet werden. Der lokale Fallback versteht u. a. Folgefragen zur Adresse des zuletzt genannten Termins und zu Varianten/Zubehör des zuletzt genannten Produkts.

## Keine Halluzinationen

- Produktdetails nur bei `Product.verified=true`.
- Preis nur aus einem aktuell gültigen `ProductPrice.verified=true`.
- Fehlende Werte führen zu einer klaren Nichtverfügbarkeitsmeldung.
- Verkaufspreise werden nicht aus unsicheren Produktpreisen übernommen oder geraten.
