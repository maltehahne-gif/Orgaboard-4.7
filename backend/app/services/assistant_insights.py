"""Auswertungen, die der Assistent als Werkzeuge anbietet.

Alles hier ist abgeleitet und deterministisch. Kein Sprachmodell rechnet -
das Modell bekommt fertige Zahlen und formuliert sie hoechstens aus. Der
Grund ist derselbe wie beim Tagesbriefing: eine Zahl ueber Umsatz oder
Zielerreichung, die ein Modell aus dem Kontext zusammensetzt, liegt
gelegentlich daneben, und genau dort faellt es niemandem auf.

Jede Funktion bekommt eine bereits geprueefte employee_id. Die Pruefung
passiert im Aufrufer ueber scoped_employee_id - hier entsteht keine zweite,
womoeglich abweichende Rechtelogik.

Wiederverwendet werden die vorhandenen Dienste: analytics, stats, timeline,
briefing. Es gibt keine zweite Kunden-, Verkaufs- oder Terminlogik nur fuer
die KI.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutils import local_today, month_bounds, to_business_tz, utc_aware, week_bounds
from app.models import (
    Appointment,
    AppointmentStatus,
    Customer,
    CustomerNote,
    FollowUp,
    FollowUpStatus,
    Product,
    ProductPresentation,
    Rental,
    RentalStatus,
    Sale,
    SaleItem,
    User,
)
from app.services.analytics import previous_period, product_ranking, trend
from app.services.stats import dashboard_stats, not_cancelled
from app.services.timeline import appointment_kpis, customer_timeline, funnel_stage

# Ab so vielen Tagen ohne Kontakt gilt ein Kunde als vernachlaessigt.
STILL_SEIT_TAGEN = 60

# Unter so vielen Terminen ist eine Abschlussquote nicht aussagekraeftig.
MINDEST_TERMINE = 3

# Vorschlaege fuer die Nachbetreuung nach einem Verkauf.
NACHBETREUUNG_STUFEN = [
    (7, "Zufriedenheit prüfen"),
    (30, "Zubehör und Nachkauf ansprechen"),
    (90, "Erneut melden"),
]


def _kundenname(c: Customer | None) -> str:
    return f"{c.first_name} {c.last_name}" if c else "Unbekannter Kunde"


def _adresse(c: Customer | None) -> str | None:
    if not c:
        return None
    teile = [c.street, c.house_number, c.postal_code, c.city]
    text = " ".join(t for t in teile if t)
    return text or None


def _eigene_kunden(db: Session, employee_id: str | None):
    stmt = select(Customer).where(Customer.deleted_at.is_(None))
    if employee_id:
        stmt = stmt.where(Customer.employee_id == employee_id)
    return db.scalars(stmt).all()


def _letzter_kontakt(db: Session, customer_id: str) -> datetime | None:
    """Juengster Termin, Verkauf oder Notiz - was zuletzt passiert ist."""
    zeitpunkte = []

    a = db.scalar(
        select(func.max(Appointment.start_at)).where(Appointment.customer_id == customer_id)
    )
    s = db.scalar(
        select(func.max(Sale.sold_at)).where(Sale.customer_id == customer_id, not_cancelled())
    )
    n = db.scalar(
        select(func.max(CustomerNote.created_at)).where(CustomerNote.customer_id == customer_id)
    )
    for wert in (a, s, n):
        if wert is not None:
            zeitpunkte.append(utc_aware(wert))

    return max(zeitpunkte) if zeitpunkte else None


# ================================================================ Prioritäten

def prioritaeten(db: Session, user: User, employee_id: str | None) -> dict:
    """Was heute am wichtigsten ist - mit Begruendung je Eintrag.

    Die Reihenfolge entsteht aus benannten Regeln, nicht aus einer
    Gewichtung, die niemand nachrechnen kann. Wer einen Eintrag liest, soll
    ohne Nachfragen verstehen, warum er oben steht.
    """
    heute = local_today()
    eintraege: list[dict] = []

    # 1. Ueberfaellige Wiedervorlagen - was liegen geblieben ist, zuerst.
    stmt = select(FollowUp).where(
        FollowUp.status == FollowUpStatus.OPEN, FollowUp.due_on < heute
    )
    if employee_id:
        stmt = stmt.where(FollowUp.employee_id == employee_id)
    for f in db.scalars(stmt.order_by(FollowUp.due_on)).all():
        c = db.get(Customer, f.customer_id)
        tage = (heute - f.due_on).days
        eintraege.append({
            "level": "hoch",
            "kind": "follow_up_overdue",
            "customer_id": f.customer_id,
            "customer": _kundenname(c),
            "title": f"{_kundenname(c)} nachfassen",
            "reasons": [
                f"Wiedervorlage seit {tage} {'Tag' if tage == 1 else 'Tagen'} überfällig",
                *( [f.note] if f.note else [] ),
            ],
        })

    # 2. Vorfuehrungen ohne Verkauf - der Punkt, an dem am meisten liegen bleibt.
    for c in _eigene_kunden(db, employee_id):
        letzte = db.scalar(
            select(func.max(ProductPresentation.presented_at))
            .where(ProductPresentation.customer_id == c.id)
        )
        if letzte is None:
            continue
        verkauft = db.scalar(
            select(func.count(Sale.id)).where(
                Sale.customer_id == c.id, Sale.sold_at >= letzte, not_cancelled()
            )
        )
        if verkauft:
            continue
        tage = (heute - to_business_tz(letzte).date()).days
        if tage < 2 or tage > 45:
            continue
        eintraege.append({
            "level": "hoch" if tage <= 14 else "mittel",
            "kind": "presentation_without_sale",
            "customer_id": c.id,
            "customer": _kundenname(c),
            "title": f"{_kundenname(c)} nachfassen",
            "reasons": [
                f"Vorführung vor {tage} Tagen",
                "bisher kein Verkauf erfasst",
            ],
        })

    # 3. Heute faellige Wiedervorlagen.
    stmt = select(FollowUp).where(
        FollowUp.status == FollowUpStatus.OPEN, FollowUp.due_on == heute
    )
    if employee_id:
        stmt = stmt.where(FollowUp.employee_id == employee_id)
    for f in db.scalars(stmt).all():
        c = db.get(Customer, f.customer_id)
        eintraege.append({
            "level": "mittel",
            "kind": "follow_up_today",
            "customer_id": f.customer_id,
            "customer": _kundenname(c),
            "title": f"{_kundenname(c)} kontaktieren",
            "reasons": ["Wiedervorlage heute fällig", *( [f.note] if f.note else [] )],
        })

    # 4. Verleihgeraete, die zurueckmuessen.
    stmt = select(Rental).where(Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]))
    if employee_id:
        stmt = stmt.where(Rental.employee_id == employee_id)
    for r in db.scalars(stmt).all():
        if not r.due_at:
            continue
        faellig = to_business_tz(r.due_at).date()
        tage = (faellig - heute).days
        if tage > 2:
            continue
        c = db.get(Customer, r.customer_id)
        p = db.get(Product, r.product_id)
        eintraege.append({
            "level": "hoch" if tage < 0 else "mittel",
            "kind": "rental_due",
            "customer_id": r.customer_id,
            "customer": _kundenname(c),
            "title": f"{p.name if p else 'Gerät'} bei {_kundenname(c)} zurückholen",
            "reasons": [
                f"seit {abs(tage)} {'Tag' if abs(tage) == 1 else 'Tagen'} überfällig"
                if tage < 0 else
                ("heute fällig" if tage == 0 else f"in {tage} Tagen fällig"),
            ],
        })

    rang = {"hoch": 0, "mittel": 1, "niedrig": 2}
    eintraege.sort(key=lambda e: rang.get(e["level"], 9))

    return {
        "date": heute,
        "items": eintraege[:15],
        "counts": {
            "hoch": len([e for e in eintraege if e["level"] == "hoch"]),
            "mittel": len([e for e in eintraege if e["level"] == "mittel"]),
        },
        "note": None if eintraege else "Heute steht nichts Dringendes an.",
    }


# ========================================================= Terminvorbereitung

def terminvorbereitung(db: Session, employee_id: str | None,
                       appointment_id: str | None = None) -> dict:
    """Alles zum naechsten Termin auf einen Blick.

    Ohne appointment_id der naechste anstehende. Was hier steht, kommt
    ausschliesslich aus der Kundenakte - Empfehlungen benennen die Tatsache,
    aus der sie folgen, damit sich beides trennen laesst.
    """
    if appointment_id:
        a = db.get(Appointment, appointment_id)
        if a and employee_id and a.employee_id != employee_id:
            return {"error": "Termin nicht gefunden oder nicht berechtigt"}
    else:
        stmt = select(Appointment).where(
            Appointment.start_at >= datetime.now(timezone.utc),
            Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]),
        )
        if employee_id:
            stmt = stmt.where(Appointment.employee_id == employee_id)
        a = db.scalar(stmt.order_by(Appointment.start_at))

    if a is None:
        return {"appointment": None, "note": "Es steht kein Termin an."}

    c = db.get(Customer, a.customer_id) if a.customer_id else None

    gekauft: list[dict] = []
    if c:
        for s in db.scalars(
            select(Sale).where(Sale.customer_id == c.id, not_cancelled())
            .order_by(Sale.sold_at.desc()).limit(10)
        ).all():
            for i in db.scalars(select(SaleItem).where(SaleItem.sale_id == s.id)).all():
                gekauft.append({
                    "product": i.product_name_snapshot,
                    "quantity": i.quantity,
                    "sold_at": s.sold_at,
                })

    vorgefuehrt: list[dict] = []
    if c:
        for pr in db.scalars(
            select(ProductPresentation).where(ProductPresentation.customer_id == c.id)
            .order_by(ProductPresentation.presented_at.desc()).limit(10)
        ).all():
            p = db.get(Product, pr.product_id)
            vorgefuehrt.append({
                "product": p.name if p else None,
                "presented_at": pr.presented_at,
                "notes": pr.notes,
            })

    notizen = []
    if c:
        notizen = [
            {"body": n.body, "created_at": n.created_at}
            for n in db.scalars(
                select(CustomerNote).where(CustomerNote.customer_id == c.id)
                .order_by(CustomerNote.created_at.desc()).limit(5)
            ).all()
        ]

    offene_nachfass = []
    if c:
        offene_nachfass = [
            {"due_on": f.due_on, "note": f.note, "reason": f.reason.value}
            for f in db.scalars(
                select(FollowUp).where(
                    FollowUp.customer_id == c.id, FollowUp.status == FollowUpStatus.OPEN
                ).order_by(FollowUp.due_on)
            ).all()
        ]

    verleih = []
    if c:
        verleih = [
            {"product": (db.get(Product, r.product_id).name
                         if db.get(Product, r.product_id) else None),
             "due_at": r.due_at, "serial_number": r.serial_number}
            for r in db.scalars(
                select(Rental).where(
                    Rental.customer_id == c.id,
                    Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]),
                )
            ).all()
        ]

    # Hinweise statt Ratschlaege: jeder Satz nennt die Tatsache, aus der er
    # folgt. Was daraus zu tun ist, entscheidet der Mensch im Gespraech.
    hinweise: list[str] = []
    if vorgefuehrt:
        hinweise.append(
            f"Zuletzt vorgeführt: {vorgefuehrt[0]['product']} "
            f"({to_business_tz(utc_aware(vorgefuehrt[0]['presented_at'])).strftime('%d.%m.%Y')})"
        )
    if gekauft:
        namen = sorted({g["product"] for g in gekauft})
        hinweise.append("Besitzt bereits: " + ", ".join(namen[:5]))
    if offene_nachfass:
        hinweise.append(f"{len(offene_nachfass)} offene Wiedervorlage(n)")
    if verleih:
        hinweise.append(f"{len(verleih)} Verleihgerät(e) noch beim Kunden")
    if not gekauft and not vorgefuehrt:
        hinweise.append("Zu diesem Kunden ist noch keine Vorführung und kein Verkauf erfasst")

    return {
        "appointment": {
            "id": a.id,
            "start_at": a.start_at,
            "end_at": a.end_at,
            "type": a.appointment_type.value,
            "status": a.status.value,
            "notes": a.notes,
            "address": a.address_snapshot or _adresse(c),
        },
        "customer": None if not c else {
            "id": c.id,
            "name": _kundenname(c),
            "phone": c.phone,
            "email": c.email,
            "address": _adresse(c),
            "funnel_stage": funnel_stage(db, c.id).value,
        },
        "last_contact": _letzter_kontakt(db, c.id) if c else None,
        "purchased": gekauft,
        "presented": vorgefuehrt,
        "notes": notizen,
        "open_follow_ups": offene_nachfass,
        "rentals": verleih,
        "hints": hinweise,
    }


# ========================================================== Nachfass-Assistent

def nachfassvorschlaege(db: Session, employee_id: str | None) -> dict:
    """Wen man heute anrufen sollte - priorisiert und begruendet."""
    heute = local_today()
    liste: list[dict] = []

    for c in _eigene_kunden(db, employee_id):
        gruende: list[str] = []
        rang = 0

        offen = db.scalar(
            select(FollowUp).where(
                FollowUp.customer_id == c.id,
                FollowUp.status == FollowUpStatus.OPEN,
            ).order_by(FollowUp.due_on)
        )
        if offen and offen.due_on <= heute:
            tage = (heute - offen.due_on).days
            gruende.append("Wiedervorlage heute fällig" if tage == 0
                           else f"Wiedervorlage seit {tage} Tagen überfällig")
            rang += 100 + tage

        letzte_vorfuehrung = db.scalar(
            select(func.max(ProductPresentation.presented_at))
            .where(ProductPresentation.customer_id == c.id)
        )
        if letzte_vorfuehrung is not None:
            verkauft = db.scalar(
                select(func.count(Sale.id)).where(
                    Sale.customer_id == c.id,
                    Sale.sold_at >= letzte_vorfuehrung,
                    not_cancelled(),
                )
            )
            if not verkauft:
                tage = (heute - to_business_tz(letzte_vorfuehrung).date()).days
                gruende.append(f"Vorführung vor {tage} Tagen ohne Verkauf")
                rang += 60

        kontakt = _letzter_kontakt(db, c.id)
        if kontakt is not None:
            tage = (heute - to_business_tz(kontakt).date()).days
            if tage >= STILL_SEIT_TAGEN:
                gruende.append(f"seit {tage} Tagen kein Kontakt")
                rang += 20

        if gruende:
            liste.append({
                "customer_id": c.id,
                "customer": _kundenname(c),
                "phone": c.phone,
                "score": rang,
                "reasons": gruende,
            })

    liste.sort(key=lambda x: -x["score"])
    for eintrag in liste:
        eintrag.pop("score")

    return {
        "date": heute,
        "customers": liste[:20],
        "note": None if liste else "Aktuell gibt es keinen offenen Nachfassbedarf.",
    }


def nachbetreuung(db: Session, employee_id: str | None) -> dict:
    """Kunden, bei denen nach einem Verkauf eine Nachbetreuung faellig waere.

    Es wird nichts angelegt - nur vorgeschlagen. Ein System, das nach jedem
    Verkauf ungefragt Wiedervorlagen erzeugt, fuellt die Liste mit Eintraegen,
    die niemand bestellt hat.
    """
    heute = local_today()
    vorschlaege: list[dict] = []

    stmt = select(Sale).where(not_cancelled())
    if employee_id:
        stmt = stmt.where(Sale.employee_id == employee_id)

    for s in db.scalars(stmt.order_by(Sale.sold_at.desc()).limit(200)).all():
        tage = (heute - to_business_tz(utc_aware(s.sold_at)).date()).days
        passend = [(d, text) for d, text in NACHBETREUUNG_STUFEN if d <= tage < d + 14]
        if not passend:
            continue

        # Gibt es schon eine offene Wiedervorlage, ist nichts vorzuschlagen.
        offen = db.scalar(
            select(func.count(FollowUp.id)).where(
                FollowUp.customer_id == s.customer_id,
                FollowUp.status == FollowUpStatus.OPEN,
            )
        )
        if offen:
            continue

        c = db.get(Customer, s.customer_id)
        stufe, text = passend[0]
        vorschlaege.append({
            "customer_id": s.customer_id,
            "customer": _kundenname(c),
            "sold_at": s.sold_at,
            "days_since": tage,
            "stage_days": stufe,
            "suggestion": text,
            "reasons": [f"Verkauf vor {tage} Tagen", "keine offene Wiedervorlage"],
        })

    return {
        "date": heute,
        "suggestions": vorschlaege[:20],
        "note": ("Es wird nichts automatisch angelegt - die Vorschläge müssen "
                 "einzeln bestätigt werden."),
    }


# ============================================================= Verkaufscoach

def verkaufscoach(db: Session, employee_id: str | None) -> dict:
    """Wie der Monat laeuft - und woran es liegt.

    Die Begruendung bleibt bei dem, was die Zahlen hergeben: mehr oder
    weniger Termine, bessere oder schlechtere Abschlussquote. Alles darueber
    hinaus waere geraten.
    """
    heute = local_today()
    start, ende = month_bounds(heute)
    vor_start, vor_ende = previous_period(start, ende)

    zahlen = trend(db, start, ende, employee_id)
    jetzt = appointment_kpis(db, start, ende, employee_id)
    davor = appointment_kpis(db, vor_start, vor_ende, employee_id)

    befunde: list[str] = []
    hebel: str | None = None

    termin_delta = jetzt["appointments_done"] - davor["appointments_done"]
    quote_delta = round(jetzt["close_rate_percent"] - davor["close_rate_percent"], 1)

    if jetzt["appointments_done"] < MINDEST_TERMINE:
        befunde.append(
            f"Nur {jetzt['appointments_done']} durchgeführte Termine in diesem Monat - "
            "für eine belastbare Aussage zur Abschlussquote zu wenig."
        )
        hebel = "Mehr Termine durchführen; darunter lässt sich nichts ableiten."
    else:
        befunde.append(
            f"{jetzt['appointments_done']} Termine durchgeführt "
            f"({'+' if termin_delta >= 0 else ''}{termin_delta} gegenüber Vormonat), "
            f"Abschlussquote {jetzt['close_rate_percent']} % "
            f"({'+' if quote_delta >= 0 else ''}{quote_delta} Punkte)."
        )

        if quote_delta <= -5 and termin_delta >= 0:
            hebel = ("Die Terminzahl stimmt, die Abschlussquote ist gesunken. Der größte "
                     "Hebel liegt aktuell nicht bei mehr Terminen, sondern beim "
                     "konsequenteren Nachfassen bestehender Vorführungen.")
        elif termin_delta < 0 and quote_delta >= 0:
            hebel = ("Die Abschlussquote hält, es kommen aber weniger Termine zustande. "
                     "Der Hebel liegt bei der Terminierung.")
        elif termin_delta < 0 and quote_delta < 0:
            hebel = "Termine und Abschlussquote liegen beide unter dem Vormonat."
        else:
            hebel = "Termine und Abschlussquote liegen auf oder über Vormonatsniveau."

    return {
        "period": "month",
        "metrics": {
            **zahlen,
            "appointments_done": jetzt["appointments_done"],
            "appointments_done_previous": davor["appointments_done"],
            "appointments_with_sale": jetzt["appointments_with_sale"],
            "presentations": jetzt["presentations"],
            "close_rate_percent": jetzt["close_rate_percent"],
            "close_rate_percent_previous": davor["close_rate_percent"],
            "revenue_per_appointment_cents": jetzt["revenue_per_appointment_cents"],
        },
        "findings": befunde,
        "biggest_lever": hebel,
    }


def zielprognose(db: Session, employee_id: str | None) -> dict:
    """Reicht das Tempo fuer das Monatsziel?"""
    from app.services.briefing import _arbeitstage

    heute = local_today()
    stats = dashboard_stats(db, employee_id)

    monatsende = month_bounds(heute)[1].date() - timedelta(days=1)
    rest = _arbeitstage(heute, monatsende)
    fehlend = int(stats.get("units_missing") or 0)

    return {
        "units_month": int(stats.get("units_month") or 0),
        "units_target": int(stats.get("units_target") or 0),
        "units_missing": fehlend,
        "units_percent": stats.get("units_percent"),
        "revenue_month_cents": int(stats.get("revenue_month_cents") or 0),
        "working_days_left": rest,
        "units_per_working_day": (round(fehlend / rest, 1) if rest and fehlend else 0.0),
        "note": (None if rest else
                 "Im laufenden Monat sind keine Arbeitstage mehr übrig."),
    }


# ============================================================== Trichter

def trichter(db: Session, employee_id: str | None) -> dict:
    """Wo Kunden verloren gehen - abgeleitet aus den Ereignissen."""
    stufen = ["contact", "appointment_set", "appointment_done",
              "presentation", "offer", "sale", "aftercare"]
    bezeichnung = {
        "contact": "Kontakt", "appointment_set": "Termin",
        "appointment_done": "durchgeführt", "presentation": "Vorführung",
        "offer": "Angebot", "sale": "Verkauf", "aftercare": "Nachbetreuung",
    }

    erreicht = {s: 0 for s in stufen}
    kunden = _eigene_kunden(db, employee_id)
    for c in kunden:
        stufe = funnel_stage(db, c.id).value
        if stufe not in stufen:
            continue
        # Wer eine Stufe erreicht hat, hat alle davor auch erreicht.
        for s in stufen[:stufen.index(stufe) + 1]:
            erreicht[s] += 1

    zeilen = [{"stage": s, "label": bezeichnung[s], "count": erreicht[s]} for s in stufen]

    # Der groesste Abfall zwischen zwei Stufen - dort geht am meisten verloren.
    groesster = None
    for vorher, nachher in zip(zeilen, zeilen[1:]):
        if vorher["count"] == 0:
            continue
        verlust = vorher["count"] - nachher["count"]
        anteil = round(verlust / vorher["count"] * 100, 1)
        if groesster is None or verlust > groesster["lost"]:
            groesster = {
                "from": vorher["label"], "to": nachher["label"],
                "lost": verlust, "percent": anteil,
            }

    return {
        "customers": len(kunden),
        "stages": zeilen,
        "biggest_drop": groesster,
        "note": None if kunden else "Zu diesem Bereich sind keine Kunden erfasst.",
    }


# ========================================================== Produktanalyse

def produktanalyse(db: Session, employee_id: str | None, tage: int = 90) -> dict:
    """Was sich verkauft - ausschliesslich aus echten Verkaufsdaten."""
    ende = datetime.now(timezone.utc)
    start = ende - timedelta(days=tage)

    rangliste = product_ranking(db, start, ende, employee_id, limit=15)

    # Produkte, die im Zeitraum kein einziges Mal verkauft wurden.
    verkauft = {p["name"] for p in rangliste}
    ohne = [
        p.name for p in db.scalars(
            select(Product).where(Product.active.is_(True), Product.verified.is_(True))
            .order_by(Product.name)
        ).all()
        if p.name not in verkauft
    ]

    return {
        "days": tage,
        "products": rangliste,
        "never_sold": ohne[:20],
        "note": (None if rangliste else
                 f"In den letzten {tage} Tagen wurde nichts verkauft."),
    }
