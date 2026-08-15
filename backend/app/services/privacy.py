"""Datenschutz: Auskunft, Anonymisierung und Aufbewahrungsfristen.

Drei Aufgaben, die eine Anwendung mit Kundendaten erfuellen koennen muss:

* **Auskunft** (Art. 15 DSGVO) - alles herausgeben, was zu einer Person
  gespeichert ist. Nicht nur der Stammdatensatz, sondern auch Termine,
  Verkaeufe, Notizen und alles Weitere.
* **Loeschung** (Art. 17 DSGVO) - die personenbezogenen Felder unwiderruflich
  entfernen. Bewusst durch Anonymisieren statt Zeilenloeschen: ein Verkauf
  aus dem Vorjahr gehoert in die Umsatzzahlen, auch wenn der Kunde heute
  seine Loeschung verlangt. Was verschwindet, ist der Personenbezug.
* **Aufbewahrung** - zeigen, welche Kunden lange genug still sind, um
  aufgeraeumt zu werden.

Wichtig beim Anonymisieren: Termine speichern Kopien von Adresse, Telefon
und E-Mail (die *_snapshot-Spalten). Wer nur den Kundendatensatz leert,
laesst genau dort die Daten stehen, die verschwinden sollten.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import (
    Appointment,
    AuditLog,
    Customer,
    CustomerNote,
    Employee,
    FollowUp,
    ProductPresentation,
    Rental,
    Sale,
    SaleItem,
    TradeIn,
)

# Felder, die im Audit-Log einen Personenbezug tragen koennen.
PERSONENFELDER = {
    "first_name", "last_name", "full_name", "customer_name",
    "street", "house_number", "postal_code", "city",
    "phone", "email", "notes", "address",
}

# Platzhalter nach der Anonymisierung. Bewusst erkennbar statt leer, damit in
# Listen nicht der Eindruck eines kaputten Datensatzes entsteht.
ANONYM_VORNAME = "Anonymisierter"
ANONYM_NACHNAME = "Kunde"
ANONYM_NOTIZ = "[anonymisiert]"


def _mitarbeiter_name(db: Session, employee_id: str | None) -> str | None:
    if not employee_id:
        return None
    mitarbeiter = db.get(Employee, employee_id)
    return mitarbeiter.display_name if mitarbeiter else None


def export_customer(db: Session, customer: Customer) -> dict:
    """Alles, was zu diesem Kunden gespeichert ist - fuer die Auskunft.

    Bewusst ohne Filter: eine Auskunft, die etwas weglaesst, ist keine.
    """
    termine = db.scalars(
        select(Appointment).where(Appointment.customer_id == customer.id).order_by(Appointment.start_at)
    ).all()

    verkaeufe = db.scalars(
        select(Sale).where(Sale.customer_id == customer.id).order_by(Sale.sold_at)
    ).all()

    vorfuehrungen = db.scalars(
        select(ProductPresentation)
        .where(ProductPresentation.customer_id == customer.id)
        .order_by(ProductPresentation.presented_at)
    ).all()

    verleih = db.scalars(
        select(Rental).where(Rental.customer_id == customer.id).order_by(Rental.issued_at)
    ).all()

    notizen = db.scalars(
        select(CustomerNote)
        .where(CustomerNote.customer_id == customer.id)
        .order_by(CustomerNote.created_at)
    ).all()

    wiedervorlagen = db.scalars(
        select(FollowUp).where(FollowUp.customer_id == customer.id).order_by(FollowUp.due_on)
    ).all()

    altgeraete = db.scalars(
        select(TradeIn).where(TradeIn.customer_id == customer.id).order_by(TradeIn.received_on)
    ).all()

    def verkauf_posten(sale_id: str) -> list[dict]:
        posten = db.scalars(select(SaleItem).where(SaleItem.sale_id == sale_id)).all()
        return [
            {
                "produkt": p.product_name_snapshot,
                "menge": p.quantity,
                "einzelpreis_cent": p.unit_price_cents,
            }
            for p in posten
        ]

    return {
        "erstellt_am": datetime.now(timezone.utc),
        "hinweis": (
            "Auskunft nach Art. 15 DSGVO. Enthält alle zu dieser Person "
            "gespeicherten Daten aus OrgaBoard."
        ),
        "stammdaten": {
            "id": customer.id,
            "vorname": customer.first_name,
            "nachname": customer.last_name,
            "strasse": customer.street,
            "hausnummer": customer.house_number,
            "plz": customer.postal_code,
            "ort": customer.city,
            "telefon": customer.phone,
            "email": customer.email,
            "notizen": customer.notes,
            "angelegt_am": customer.created_at,
            "geloescht_am": customer.deleted_at,
            "anonymisiert_am": customer.anonymized_at,
            "zustaendig": _mitarbeiter_name(db, customer.employee_id),
        },
        "termine": [
            {
                "beginn": a.start_at,
                "ende": a.end_at,
                "art": a.appointment_type.value,
                "status": a.status.value,
                "adresse": a.address_snapshot,
                "telefon": a.phone_snapshot,
                "email": a.email_snapshot,
                "notizen": a.notes,
                "mitarbeiter": _mitarbeiter_name(db, a.employee_id),
            }
            for a in termine
        ],
        "verkaeufe": [
            {
                "verkauft_am": s.sold_at,
                "kanal": s.channel.value,
                "notizen": s.notes,
                "storniert_am": s.cancelled_at,
                "stornogrund": s.cancellation_reason,
                "posten": verkauf_posten(s.id),
                "mitarbeiter": _mitarbeiter_name(db, s.employee_id),
            }
            for s in verkaeufe
        ],
        "vorfuehrungen": [
            {"am": v.presented_at, "mitarbeiter": _mitarbeiter_name(db, v.employee_id)}
            for v in vorfuehrungen
        ],
        "verleih": [
            {
                "ausgegeben_am": r.issued_at,
                "faellig_am": r.due_at,
                "zurueck_am": r.returned_at,
                "status": r.status.value,
                "seriennummer": r.serial_number,
                "notizen": r.notes,
            }
            for r in verleih
        ],
        "notizen_verlauf": [
            {"am": n.created_at, "text": n.body, "autor": _mitarbeiter_name(db, n.employee_id)}
            for n in notizen
        ],
        "wiedervorlagen": [
            {
                "faellig_am": f.due_on,
                "grund": f.reason.value,
                "status": f.status.value,
                "notiz": f.note,
            }
            for f in wiedervorlagen
        ],
        "altgeraete": [
            {
                "modell": t.model,
                "seriennummer": t.serial_number,
                "zustand": t.condition.value,
                "status": t.status.value,
                "angenommen_am": t.received_on,
                "bemerkung": t.notes,
            }
            for t in altgeraete
        ],
    }


def _schwaerze(wert):
    """Personenbezogene Werte in einem Audit-Abbild ersetzen."""
    if not isinstance(wert, dict):
        return wert
    return {
        schluessel: (ANONYM_NOTIZ if schluessel in PERSONENFELDER and inhalt not in (None, "") else _schwaerze(inhalt))
        for schluessel, inhalt in wert.items()
    }


def _audit_schwaerzen(db: Session, customer_id: str) -> int:
    """Personenbezug aus den Audit-Eintraegen dieses Kunden entfernen.

    Das Audit-Log bleibt bestehen - wer wann was getan hat, ist genau sein
    Zweck und ueberlebt die Loeschung. Ersetzt werden nur die Werte: sonst
    stuende der geloeschte Name weiterhin im Protokoll und die Loeschung
    waere wirkungslos.

    Erfasst werden Eintraege zum Kunden selbst und solche anderer Vorgaenge,
    die den Kunden nennen - ein Verkaufsprotokoll enthaelt zum Beispiel den
    Kundennamen.
    """
    betroffen = 0
    for eintrag in db.scalars(select(AuditLog)).all():
        gehoert_dazu = (
            eintrag.entity_type == "customer" and eintrag.entity_id == customer_id
        ) or any(
            isinstance(abbild, dict) and abbild.get("customer_id") == customer_id
            for abbild in (eintrag.before_json, eintrag.after_json)
        )
        if not gehoert_dazu:
            continue

        eintrag.before_json = _schwaerze(eintrag.before_json)
        eintrag.after_json = _schwaerze(eintrag.after_json)
        betroffen += 1

    return betroffen


def anonymize_customer(db: Session, customer: Customer) -> dict:
    """Personenbezug unwiderruflich entfernen, Geschaeftszahlen behalten.

    Geleert werden: Stammdaten, die Kopien in den Terminen und der
    Notizverlauf. Erhalten bleiben Verkaufsbetraege, Mengen und Zeitpunkte -
    sie sind fuer Buchhaltung und Statistik noetig und ohne Namen nicht mehr
    personenbezogen.

    Gibt zurueck, was angefasst wurde - fuer das Audit-Log und als Beleg
    gegenueber der anfragenden Person.
    """
    if customer.anonymized_at:
        return {"already": True, "appointments": 0, "notes": 0}

    customer.first_name = ANONYM_VORNAME
    customer.last_name = ANONYM_NACHNAME
    customer.street = ""
    customer.house_number = ""
    customer.postal_code = ""
    customer.city = ""
    customer.phone = None
    customer.email = None
    customer.notes = None
    customer.anonymized_at = datetime.now(timezone.utc)
    # Ein anonymisierter Kunde gehoert nicht mehr in die Arbeitslisten.
    if not customer.deleted_at:
        customer.deleted_at = customer.anonymized_at

    # Termine tragen Kopien der Kontaktdaten - die zaehlen genauso.
    termine = db.scalars(
        select(Appointment).where(Appointment.customer_id == customer.id)
    ).all()
    for termin in termine:
        termin.address_snapshot = None
        termin.phone_snapshot = None
        termin.email_snapshot = None

    # Freitexte koennen alles enthalten, auch Gesundheits- oder Familienangaben.
    notizen = db.scalars(
        select(CustomerNote).where(CustomerNote.customer_id == customer.id)
    ).all()
    for notiz in notizen:
        notiz.body = ANONYM_NOTIZ

    # Offene Wiedervorlagen ergeben ohne Person keinen Sinn mehr.
    wiedervorlagen = db.scalars(
        select(FollowUp).where(FollowUp.customer_id == customer.id)
    ).all()
    for wiedervorlage in wiedervorlagen:
        wiedervorlage.note = None

    # Ohne diesen Schritt stuende der geloeschte Name weiterhin im Protokoll.
    audit_eintraege = _audit_schwaerzen(db, customer.id)

    return {
        "already": False,
        "appointments": len(termine),
        "notes": len(notizen),
        "follow_ups": len(wiedervorlagen),
        "audit_entries": audit_eintraege,
    }


def retention_candidates(db: Session, jahre: int = 3, employee_id: str | None = None) -> list[dict]:
    """Kunden ohne Aktivitaet seit `jahre` - Vorschlagsliste, keine Automatik.

    Bewusst nur ein Vorschlag: ob geloescht werden darf, haengt an
    Aufbewahrungspflichten, die diese Anwendung nicht kennt. Die Entscheidung
    trifft ein Mensch.
    """
    grenze = datetime.now(timezone.utc) - timedelta(days=365 * jahre)

    stmt = select(Customer).where(Customer.anonymized_at.is_(None))
    if employee_id:
        stmt = stmt.where(Customer.employee_id == employee_id)

    kandidaten: list[dict] = []
    for kunde in db.scalars(stmt).all():
        letzter_termin = db.scalar(
            select(Appointment.start_at)
            .where(Appointment.customer_id == kunde.id)
            .order_by(Appointment.start_at.desc())
            .limit(1)
        )
        letzter_verkauf = db.scalar(
            select(Sale.sold_at)
            .where(Sale.customer_id == kunde.id)
            .order_by(Sale.sold_at.desc())
            .limit(1)
        )
        offener_verleih = db.scalar(
            select(Rental.id)
            .where(Rental.customer_id == kunde.id, Rental.returned_at.is_(None))
            .limit(1)
        )

        # Ein laufender Verleih ist ein aktiver Vorgang - der Kunde bleibt.
        if offener_verleih:
            continue

        zeitpunkte = [z for z in (letzter_termin, letzter_verkauf, kunde.created_at) if z]
        letzte_aktivitaet = max(zeitpunkte) if zeitpunkte else kunde.created_at
        if letzte_aktivitaet.tzinfo is None:
            letzte_aktivitaet = letzte_aktivitaet.replace(tzinfo=timezone.utc)

        if letzte_aktivitaet < grenze:
            kandidaten.append({
                "id": kunde.id,
                "name": f"{kunde.first_name} {kunde.last_name}".strip(),
                "letzte_aktivitaet": letzte_aktivitaet,
                "bereits_geloescht": kunde.deleted_at is not None,
            })

    kandidaten.sort(key=lambda k: k["letzte_aktivitaet"])
    return kandidaten
