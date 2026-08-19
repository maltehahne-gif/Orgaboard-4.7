"""Die Verkaufstabelle als Wochenblatt - nach der Papiervorlage.

Die Vorlage ist ein Wochenblatt: je Wochentag ein Block aus Zeilen, jede
Zeile ein Vorgang mit Uhrzeit, Kunde und Anschrift, dahinter Ankreuzfelder
fuer Kontaktweg, Gebiet und Altgeraet, dann je Produktgruppe eine Spalte
und ganz rechts Einheiten, Produktumsatz und K70-Umsatz. Unter jedem Tag
steht eine Summe, unter der Woche die Wochensumme.

Warum die Zusammenstellung hier und nicht in der Oberflaeche: die Zeile
zieht aus fuenf Tabellen zusammen (Verkauf, Positionen, Kunde, Termin,
Altgeraet). Im Browser waeren das fuenf Abfragen und eine Verknuepfung von
Hand - je Woche neu, und bei jeder Aenderung an einer der fuenf Tabellen
an einer weiteren Stelle nachzuziehen.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.timeutils import to_business_tz, week_bounds
from app.models import (
    Appointment,
    AppointmentType,
    Customer,
    Employee,
    Product,
    ProductPresentation,
    Sale,
    SaleChannel,
    SaleItem,
    TradeIn,
)
from app.services.stats import is_k70_category, product_unit_count_from_name

WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

# Die Ankreuzspalten der Vorlage, in ihrer Reihenfolge. Der Schluessel
# steht auch in der Oberflaeche - dort haengt die Farbe daran.
KONTAKTWEGE = [
    ("promotion", "Promotion"),
    ("recommendation", "Empfehlung"),
    ("premium", "Premium Check-in"),
    ("kd_daten", "KD-Daten"),
    ("adm", "ADM"),
]

# Terminart -> Kontaktweg. Telefonie und private Zeit fuehren zu keinem
# Kontaktweg; sie stehen in der Vorlage nicht als Spalte.
KONTAKTWEG_JE_TERMINART = {
    AppointmentType.PROMOTION: "promotion",
    AppointmentType.RECOMMENDATION: "recommendation",
    AppointmentType.PREMIUM_CHECKIN: "premium",
    AppointmentType.CUSTOMER: "kd_daten",
    AppointmentType.TEAM: "adm",
}

PROFI_SPALTEN = [
    ("job_ticket", "Job-Ticket"),
    ("recommendation", "Empfehlung"),
    ("premium", "Premium Check-in"),
]

# Die acht Produktspalten der Vorlage. Zugeordnet wird ueber die
# Modellkuerzel im Produktnamen (VK7, SP7, PB7 ...) - dieselbe Schreibweise,
# aus der auch die Einheitenzahl kommt. Faellt ein Produkt durch alle
# Muster, bleibt es ohne Spalte: lieber keine Angabe als eine falsche.
PRODUKTSPALTEN = [
    ("roboter", "Roboter"),
    ("kobold", "Kobold"),
    ("tiger", "Tiger"),
    ("elektrobuerste", "Elektrobürste"),
    ("saugwischer", "Saugwischer"),
    ("polsterbuerste", "Polsterbürste"),
    ("service", "Service"),
    ("demotuecher", "Demotücher"),
]

# Reihenfolge zaehlt, das erste passende Muster gewinnt. Erst die
# Grundgeraete, dann das Zubehoer: ein "VK7 Akku-Staubsauger inkl. EB7" ist
# ein Kobold-Verkauf mit Buerste, keine einzeln verkaufte Elektrobuerste.
# Und die RB7 Servicestation gehoert zum Roboter, nicht zu "Service".
_PRODUKTMUSTER: list[tuple[str, re.Pattern[str]]] = [
    ("roboter", re.compile(r"\b(vr\d+|rb\d+)\b|saugroboter|servicestation", re.I)),
    ("tiger", re.compile(r"\b(vt\d+)\b|tiger", re.I)),
    ("kobold", re.compile(r"\b(vk\d+|vm\d+|vg\d+)\b|staubsauger|fl(ä|ae)chenreiniger", re.I)),
    ("elektrobuerste", re.compile(r"\b(eb\d+)\b|elektrob(ü|ue)rste", re.I)),
    ("saugwischer", re.compile(r"\b(sp\d+)\b|saugwischer", re.I)),
    ("polsterbuerste", re.compile(r"\b(pb\d+)\b|polster|matratzen", re.I)),
    ("demotuecher", re.compile(r"demotuch|demot(ü|ue)cher|demo-?tuch", re.I)),
    ("service", re.compile(r"\bservice\b|wartung|reparatur", re.I)),
]


def produktspalte(name: str | None, kategorie: str | None = None) -> str | None:
    """In welche Spalte der Vorlage dieses Produkt gehoert."""
    text = f"{name or ''} {kategorie or ''}"
    for schluessel, muster in _PRODUKTMUSTER:
        if muster.search(text):
            return schluessel
    return None


def _leere_produktzellen() -> dict[str, dict]:
    return {schluessel: {"sold": 0, "presented": False} for schluessel, _ in PRODUKTSPALTEN}


def _anschrift(c: Customer | None) -> str:
    if not c:
        return ""
    strasse = " ".join(x for x in (c.street, c.house_number) if x).strip()
    ort = " ".join(x for x in (c.postal_code, c.city) if x).strip()
    return ", ".join(x for x in (strasse, ort) if x)


def wochentabelle(db: Session, employee_id: str, week_start: date) -> dict:
    """Das Wochenblatt eines Mitarbeiters.

    Eine Zeile je Verkauf. Die Ankreuzfelder links kommen aus dem Termin,
    an dem der Verkauf haengt; ohne Termin bleiben sie leer. Stornierte
    Verkaeufe stehen weiterhin im Blatt, zaehlen aber in keiner Summe mit -
    dieselbe Regel wie ueberall sonst.
    """
    employee = db.get(Employee, employee_id)
    start, end = week_bounds(week_start)

    sales = db.scalars(
        select(Sale)
        .where(Sale.employee_id == employee_id, Sale.sold_at >= start, Sale.sold_at < end)
        .order_by(Sale.sold_at)
    ).all()
    sale_ids = [s.id for s in sales]

    positionen: dict[str, list[tuple[SaleItem, str | None, str | None]]] = {sid: [] for sid in sale_ids}
    if sale_ids:
        # Katalogname und Kategorie in einer Abfrage. Der Katalogname zaehlt,
        # nicht der Namensschnappschuss: die Einheitenzahl kommt bei
        # sale_units() ebenfalls von dort, und zwei Quellen fuer dieselbe
        # Zahl liefen frueher oder spaeter auseinander.
        for item, name, kategorie in db.execute(
            select(SaleItem, Product.name, Product.category)
            .outerjoin(Product, Product.id == SaleItem.product_id)
            .where(SaleItem.sale_id.in_(sale_ids))
        ).all():
            positionen[item.sale_id].append((item, name, kategorie))

    kunden = {
        c.id: c
        for c in db.scalars(
            select(Customer).where(Customer.id.in_({s.customer_id for s in sales}))
        ).all()
    } if sales else {}

    termin_ids = {s.appointment_id for s in sales if s.appointment_id}
    termine = {
        a.id: a
        for a in db.scalars(select(Appointment).where(Appointment.id.in_(termin_ids))).all()
    } if termin_ids else {}

    # Vorgefuehrt: was beim Termin gezeigt, aber nicht verkauft wurde.
    vorfuehrungen: dict[str, set[str]] = {}
    if termin_ids:
        for termin_id, name, kategorie in db.execute(
            select(ProductPresentation.appointment_id, Product.name, Product.category)
            .join(Product, Product.id == ProductPresentation.product_id)
            .where(ProductPresentation.appointment_id.in_(termin_ids))
        ).all():
            spalte = produktspalte(name, kategorie)
            if spalte:
                vorfuehrungen.setdefault(termin_id, set()).add(spalte)

    altgeraete = {
        sid
        for (sid,) in db.execute(
            select(TradeIn.sale_id).where(TradeIn.sale_id.in_(sale_ids))
        ).all()
        if sid
    } if sale_ids else set()

    zeilen_je_tag: dict[str, list[dict]] = {}
    for s in sales:
        lokal = to_business_tz(s.sold_at)
        kunde = kunden.get(s.customer_id)
        termin = termine.get(s.appointment_id) if s.appointment_id else None

        produkte = _leere_produktzellen()
        for spalte in vorfuehrungen.get(s.appointment_id or "", set()):
            produkte[spalte]["presented"] = True

        einheiten = 0
        produktumsatz = 0
        k70 = 0
        for item, katalogname, kategorie in positionen.get(s.id, []):
            betrag = item.quantity * item.unit_price_cents
            if is_k70_category(kategorie):
                k70 += betrag
                continue
            produktumsatz += betrag
            einheiten += item.quantity * product_unit_count_from_name(katalogname)
            spalte = produktspalte(katalogname or item.product_name_snapshot, kategorie)
            if spalte:
                produkte[spalte]["sold"] += item.quantity

        storniert = s.cancelled_at is not None
        zeilen_je_tag.setdefault(lokal.date().isoformat(), []).append({
            "sale_id": s.id,
            "time": lokal.strftime("%H:%M"),
            "customer_name": f"{kunde.first_name} {kunde.last_name}" if kunde else "Unbekannt",
            "customer_address": _anschrift(kunde),
            "contact_way": KONTAKTWEG_JE_TERMINART.get(termin.appointment_type) if termin else None,
            "is_customer": kunde is not None,
            "is_target_customer": False,
            "area": "field" if s.channel == SaleChannel.FIELD else "white",
            "profi": None,
            "trade_in": s.id in altgeraete,
            "products": produkte,
            "units": einheiten,
            "product_revenue_cents": produktumsatz,
            "k70_revenue_cents": k70,
            "cancelled": storniert,
        })

    tage = []
    woche = {"units": 0, "product_revenue_cents": 0, "k70_revenue_cents": 0}
    woche_produkte = {schluessel: 0 for schluessel, _ in PRODUKTSPALTEN}
    for index in range(7):
        tag = week_start + timedelta(days=index)
        zeilen = zeilen_je_tag.get(tag.isoformat(), [])
        gezaehlt = [z for z in zeilen if not z["cancelled"]]
        summe = {
            "units": sum(z["units"] for z in gezaehlt),
            "product_revenue_cents": sum(z["product_revenue_cents"] for z in gezaehlt),
            "k70_revenue_cents": sum(z["k70_revenue_cents"] for z in gezaehlt),
            "products": {
                schluessel: sum(z["products"][schluessel]["sold"] for z in gezaehlt)
                for schluessel, _ in PRODUKTSPALTEN
            },
        }
        for feld in woche:
            woche[feld] += summe[feld]
        for schluessel in woche_produkte:
            woche_produkte[schluessel] += summe["products"][schluessel]
        tage.append({
            "date": tag.isoformat(),
            "weekday": WOCHENTAGE[index],
            "rows": zeilen,
            "totals": summe,
        })

    return {
        "employee": {"id": employee_id, "name": employee.display_name if employee else "Unbekannt"},
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "calendar_week": week_start.isocalendar().week,
        "days": tage,
        "totals": {**woche, "products": woche_produkte},
        "columns": {
            "contact_ways": [{"key": k, "label": l} for k, l in KONTAKTWEGE],
            "profi": [{"key": k, "label": l} for k, l in PROFI_SPALTEN],
            "products": [{"key": k, "label": l} for k, l in PRODUKTSPALTEN],
        },
    }
