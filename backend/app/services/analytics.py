"""Auswertungen fuer Dashboard und Teamleitung.

Alles hier ist abgeleitet - es wird nichts zwischengespeichert. Die Zahlen
kommen aus denselben Verkaufspositionen wie die uebrigen Kennzahlen, damit
Dashboard und Verkaufsliste nicht auseinanderlaufen koennen.

Die Hinweise fuer die Teamleitung arbeiten mit festen, benannten Schwellen.
Kein Modell, keine Gewichtung: Wer einen Hinweis liest, soll ohne Nachfragen
verstehen, warum er erscheint.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutils import local_today, month_bounds, week_bounds
from app.models import (
    Appointment,
    AppointmentStatus,
    Employee,
    FollowUp,
    FollowUpStatus,
    Product,
    Rental,
    RentalStatus,
    Sale,
    SaleItem,
)
from app.services.stats import (
    is_k70_category,
    product_unit_count_from_name,
    revenue_between,
    units_between,
)
from app.services.timeline import appointment_kpis

# --- Schwellen fuer die Hinweise -------------------------------------------
# Bewusst als Konstanten, damit sie eine Stelle haben und im Zweifel
# angepasst statt gesucht werden muessen.

UMSATZ_RUECKGANG_PROZENT = 40      # Einbruch gegenueber Vorperiode
ABSCHLUSSQUOTE_ABSTAND = 20        # Prozentpunkte unter Teamdurchschnitt
UEBERFAELLIGE_NACHFASS_GRENZE = 5  # ab so vielen wird gemeldet
MINDEST_TERMINE_FUER_QUOTE = 3     # darunter ist eine Quote nicht aussagekraeftig


def previous_period(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    """Gleich langer Zeitraum unmittelbar davor."""
    laenge = end - start
    return start - laenge, start


def trend(
    db: Session,
    start: datetime,
    end: datetime,
    employee_id: str | None = None,
) -> dict:
    """Vergleich mit dem gleich langen Zeitraum davor."""
    vor_start, vor_end = previous_period(start, end)

    jetzt_umsatz = revenue_between(db, start, end, employee_id)
    vorher_umsatz = revenue_between(db, vor_start, vor_end, employee_id)
    jetzt_einheiten = units_between(db, start, end, employee_id)
    vorher_einheiten = units_between(db, vor_start, vor_end, employee_id)

    def veraenderung(jetzt: int, vorher: int) -> float | None:
        # Ohne Vorwert gibt es keine sinnvolle Prozentangabe - dann lieber
        # nichts anzeigen als "+100 %" oder "unendlich".
        if not vorher:
            return None
        return round((jetzt - vorher) / vorher * 100, 1)

    return {
        "revenue_cents": jetzt_umsatz,
        "revenue_previous_cents": vorher_umsatz,
        "revenue_change_percent": veraenderung(jetzt_umsatz, vorher_umsatz),
        "units": jetzt_einheiten,
        "units_previous": vorher_einheiten,
        "units_change_percent": veraenderung(jetzt_einheiten, vorher_einheiten),
    }


def product_ranking(
    db: Session,
    start: datetime,
    end: datetime,
    employee_id: str | None = None,
    limit: int = 8,
) -> list[dict]:
    """Meistverkaufte Produkte im Zeitraum, nach Umsatz sortiert.

    Gruppiert wird ueber den Namensschnappschuss der Verkaufsposition, nicht
    ueber die Produkt-ID: So bleiben Verkaeufe zaehlbar, deren Produkt spaeter
    umbenannt oder deaktiviert wurde.
    """
    stmt = (
        select(
            SaleItem.product_name_snapshot,
            func.sum(SaleItem.quantity).label("menge"),
            func.sum(SaleItem.quantity * SaleItem.unit_price_cents).label("umsatz"),
            func.max(Product.category).label("kategorie"),
        )
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .outerjoin(Product, Product.id == SaleItem.product_id)
        .where(Sale.sold_at >= start, Sale.sold_at < end)
        .group_by(SaleItem.product_name_snapshot)
        .order_by(func.sum(SaleItem.quantity * SaleItem.unit_price_cents).desc())
        .limit(limit)
    )
    if employee_id:
        stmt = stmt.where(Sale.employee_id == employee_id)

    zeilen = db.execute(stmt).all()
    gesamt = sum(int(z.umsatz or 0) for z in zeilen) or 0

    return [
        {
            "name": z.product_name_snapshot,
            "category": z.kategorie,
            "quantity": int(z.menge or 0),
            "revenue_cents": int(z.umsatz or 0),
            "units": (
                0
                if is_k70_category(z.kategorie)
                else int(z.menge or 0) * product_unit_count_from_name(z.product_name_snapshot)
            ),
            "share_percent": (
                round(int(z.umsatz or 0) / gesamt * 100, 1) if gesamt else 0.0
            ),
        }
        for z in zeilen
    ]


def employee_goal_progress(db: Session, day: date | None = None) -> list[dict]:
    """Zielerreichung je Mitarbeiter im laufenden Monat."""
    ms, me = month_bounds(day)
    ws, we = week_bounds(day)

    ergebnis = []
    for e in db.scalars(select(Employee).order_by(Employee.display_name)).all():
        einheiten = units_between(db, ms, me, e.id)
        ziel = e.monthly_units_target or 0
        kpis = appointment_kpis(db, ms, me, e.id)

        ergebnis.append(
            {
                "employee_id": e.id,
                "display_name": e.display_name,
                "units_month": einheiten,
                "units_target": ziel,
                "units_missing": max(ziel - einheiten, 0),
                "percent": round(einheiten / ziel * 100, 1) if ziel else 0.0,
                "revenue_month_cents": revenue_between(db, ms, me, e.id),
                "revenue_week_cents": revenue_between(db, ws, we, e.id),
                "appointments_done": kpis["appointments_done"],
                "close_rate_percent": kpis["close_rate_percent"],
            }
        )

    return ergebnis


def team_alerts(db: Session, day: date | None = None) -> list[dict]:
    """Auffaellige Entwicklungen im Team.

    Jeder Hinweis nennt den Mitarbeiter, was auffaellt und die Zahl dahinter -
    ohne diese drei Angaben ist ein Hinweis nicht handlungsfaehig.
    """
    heute = day or local_today()
    ms, me = month_bounds(day)
    ws, we = week_bounds(day)
    vor_ms, vor_me = previous_period(ms, me)

    mitarbeiter = db.scalars(select(Employee).order_by(Employee.display_name)).all()
    if not mitarbeiter:
        return []

    # Teamdurchschnitt der Abschlussquote als Bezugsgroesse.
    quoten = []
    for e in mitarbeiter:
        k = appointment_kpis(db, ms, me, e.id)
        if k["appointments_done"] >= MINDEST_TERMINE_FUER_QUOTE:
            quoten.append(k["close_rate_percent"])
    schnitt = round(sum(quoten) / len(quoten), 1) if quoten else None

    hinweise: list[dict] = []

    for e in mitarbeiter:
        kpis = appointment_kpis(db, ms, me, e.id)

        # 1. Keine Termine in der laufenden Woche
        termine_woche = db.scalar(
            select(func.count(Appointment.id)).where(
                Appointment.employee_id == e.id,
                Appointment.start_at >= ws,
                Appointment.start_at < we,
                Appointment.status != AppointmentStatus.CANCELLED,
            )
        ) or 0
        if termine_woche == 0:
            hinweise.append({
                "kind": "no_appointments",
                "severity": "warn",
                "employee_id": e.id,
                "employee": e.display_name,
                "title": "Keine Termine diese Woche",
                "detail": f"{e.display_name} hat für diese Woche keinen Termin eingetragen.",
                "value": 0,
            })

        # 2. Umsatzeinbruch gegenueber dem Vormonat
        jetzt = revenue_between(db, ms, me, e.id)
        vorher = revenue_between(db, vor_ms, vor_me, e.id)
        if vorher > 0:
            veraenderung = (jetzt - vorher) / vorher * 100
            if veraenderung <= -UMSATZ_RUECKGANG_PROZENT:
                hinweise.append({
                    "kind": "revenue_drop",
                    "severity": "critical",
                    "employee_id": e.id,
                    "employee": e.display_name,
                    "title": f"Umsatz {round(abs(veraenderung))} % unter Vormonat",
                    "detail": (
                        f"{_geld(jetzt)} in diesem Monat gegenüber "
                        f"{_geld(vorher)} im Vormonat."
                    ),
                    "value": round(veraenderung, 1),
                })

        # 3. Abschlussquote deutlich unter dem Teamschnitt
        if (
            schnitt is not None
            and kpis["appointments_done"] >= MINDEST_TERMINE_FUER_QUOTE
            and kpis["close_rate_percent"] <= schnitt - ABSCHLUSSQUOTE_ABSTAND
        ):
            hinweise.append({
                "kind": "low_close_rate",
                "severity": "warn",
                "employee_id": e.id,
                "employee": e.display_name,
                "title": "Abschlussquote unter Teamschnitt",
                "detail": (
                    f"{kpis['close_rate_percent']} % bei {kpis['appointments_done']} "
                    f"durchgeführten Terminen; Team liegt bei {schnitt} %."
                ),
                "value": kpis["close_rate_percent"],
            })

        # 4. Liegengebliebene Nachfassaktionen
        ueberfaellig = db.scalar(
            select(func.count(FollowUp.id)).where(
                FollowUp.employee_id == e.id,
                FollowUp.status == FollowUpStatus.OPEN,
                FollowUp.due_on < heute,
            )
        ) or 0
        if ueberfaellig >= UEBERFAELLIGE_NACHFASS_GRENZE:
            hinweise.append({
                "kind": "overdue_followups",
                "severity": "warn",
                "employee_id": e.id,
                "employee": e.display_name,
                "title": f"{ueberfaellig} überfällige Nachfassaktionen",
                "detail": f"{e.display_name} hat {ueberfaellig} Wiedervorlagen liegen lassen.",
                "value": ueberfaellig,
            })

        # 5. Ueberfaellige Verleihgeraete
        offene_rueckgaben = db.scalar(
            select(func.count(Rental.id)).where(
                Rental.employee_id == e.id,
                Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]),
                Rental.due_at.isnot(None),
                Rental.due_at < datetime.combine(heute, datetime.min.time()),
            )
        ) or 0
        if offene_rueckgaben:
            hinweise.append({
                "kind": "overdue_rentals",
                "severity": "warn",
                "employee_id": e.id,
                "employee": e.display_name,
                "title": f"{offene_rueckgaben} Gerät(e) überfällig",
                "detail": "Rückgabetermin liegt in der Vergangenheit.",
                "value": offene_rueckgaben,
            })

    hinweise = _gruppieren(hinweise)

    # Kritisches zuerst, danach alphabetisch - damit die Reihenfolge bei
    # gleichbleibender Lage stabil bleibt.
    rang = {"critical": 0, "warn": 1, "info": 2}
    hinweise.sort(key=lambda h: (rang.get(h["severity"], 9), h["employee"], h["kind"]))
    return hinweise


# Ab so vielen Betroffenen wird ein Hinweis zusammengefasst.
GRUPPIEREN_AB = 3

_GRUPPENTEXTE = {
    "no_appointments": ("{n} Mitarbeiter ohne Termine diese Woche", "Betroffen: {namen}."),
    "overdue_followups": ("{n} Mitarbeiter mit liegengebliebenen Nachfassaktionen", "Betroffen: {namen}."),
    "overdue_rentals": ("{n} Mitarbeiter mit überfälligen Geräten", "Betroffen: {namen}."),
    "low_close_rate": ("{n} Mitarbeiter unter dem Teamschnitt", "Betroffen: {namen}."),
    "revenue_drop": ("{n} Mitarbeiter mit Umsatzeinbruch", "Betroffen: {namen}."),
}


def _gruppieren(hinweise: list[dict]) -> list[dict]:
    """Gleichartige Hinweise zusammenfassen.

    Betrifft dieselbe Sache das halbe Team, ist eine Liste mit acht gleich
    lautenden Zeilen unbrauchbar: Sie verdeckt genau die Faelle, die
    heraus stechen sollten. Ab drei Betroffenen wird daraus eine Zeile mit
    Namensnennung.
    """
    nach_art: dict[str, list[dict]] = {}
    for h in hinweise:
        nach_art.setdefault(h["kind"], []).append(h)

    ergebnis: list[dict] = []
    for art, gruppe in nach_art.items():
        if len(gruppe) < GRUPPIEREN_AB or art not in _GRUPPENTEXTE:
            ergebnis.extend(gruppe)
            continue

        namen = sorted(h["employee"] for h in gruppe)
        titel, detail = _GRUPPENTEXTE[art]
        # Die schwerste Einstufung der Gruppe bleibt erhalten.
        schwere = "critical" if any(h["severity"] == "critical" for h in gruppe) else gruppe[0]["severity"]

        ergebnis.append({
            "kind": art,
            "severity": schwere,
            "employee_id": None,
            "employee": "Team",
            "title": titel.format(n=len(gruppe)),
            "detail": detail.format(namen=", ".join(namen)),
            "value": len(gruppe),
            "grouped": True,
            "employees": namen,
        })

    return ergebnis


def _geld(cents: int) -> str:
    return f"{cents / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
