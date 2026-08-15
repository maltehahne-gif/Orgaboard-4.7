"""Tagesbriefing: was heute ansteht und was daraus folgt.

Bewusst ohne Sprachmodell gerechnet. Drei Gruende:

1. Ohne OpenAI-Schluessel gibt es sonst gar nichts - und der Schluessel ist
   optional. Ein Assistent, der ohne ihn nichts kann, ist keiner.
2. Aussagen ueber Kunden, Umsatz und Zielerreichung muessen stimmen. Ein
   Sprachmodell, das Zahlen aus dem Kontext zusammensetzt, liegt gelegentlich
   daneben - und gerade hier faellt das niemandem auf.
3. Das Modell kann dieses Ergebnis als Werkzeug abrufen und in eigenen Worten
   erklaeren. Die Fakten kommen aber von hier.

Alle Zahlen stammen aus denselben Diensten, die auch das Dashboard speisen -
Briefing und Dashboard koennen dadurch nicht auseinanderlaufen.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.timeutils import day_bounds, local_today, month_bounds, week_bounds
from app.models import (
    Appointment,
    AppointmentStatus,
    Customer,
    Employee,
    FollowUp,
    FollowUpStatus,
    Rental,
    RentalStatus,
    User,
)
from app.services.analytics import employee_goal_progress, previous_period, team_alerts, trend
from app.services.stats import dashboard_stats
from app.services.timeline import appointment_kpis

# Ab hier gilt ein Verleihgeraet als "bald faellig".
BALD_FAELLIG_TAGE = 3


def _geld(cents: int) -> str:
    return f"{cents / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _zahl(wert: float) -> str:
    """Deutsche Schreibweise mit Komma - "0.8 Einheiten" liest sich falsch."""
    text = f"{wert:.1f}".replace(".", ",")
    return text[:-2] if text.endswith(",0") else text


def _arbeitstage(von: date, bis: date) -> int:
    """Werktage einschliesslich beider Grenzen (Mo-Fr).

    Samstag und Sonntag zaehlen nicht mit - ein Monatsziel auf Kalendertage
    umzulegen ergaebe eine Tagesvorgabe, die niemand erreichen kann.
    """
    if bis < von:
        return 0
    tage = 0
    lauf = von
    while lauf <= bis:
        if lauf.weekday() < 5:
            tage += 1
        lauf += timedelta(days=1)
    return tage


def _aufgaben(db: Session, user: User, employee_id: str | None, heute: date) -> list[dict]:
    """Was heute ansteht, nach Dringlichkeit sortiert."""
    aufgaben: list[dict] = []

    # ---- Wiedervorlagen -------------------------------------------------
    stmt = select(FollowUp).where(FollowUp.status == FollowUpStatus.OPEN)
    if employee_id:
        stmt = stmt.where(FollowUp.employee_id == employee_id)
    offene = db.scalars(stmt).all()

    ueberfaellig = [f for f in offene if f.due_on < heute]
    heute_faellig = [f for f in offene if f.due_on == heute]

    def kundenname(follow_up: FollowUp) -> str:
        kunde = db.get(Customer, follow_up.customer_id)
        return f"{kunde.first_name} {kunde.last_name}".strip() if kunde else "Unbekannt"

    if ueberfaellig:
        aufgaben.append({
            "kind": "followup_overdue",
            "priority": 1,
            "title": f"{len(ueberfaellig)} überfällige Wiedervorlage{'n' if len(ueberfaellig) != 1 else ''}",
            "detail": ", ".join(sorted({kundenname(f) for f in ueberfaellig})[:5]),
            "count": len(ueberfaellig),
            "link": "/nachfassen",
        })

    if heute_faellig:
        aufgaben.append({
            "kind": "followup_today",
            "priority": 2,
            "title": f"{len(heute_faellig)} Wiedervorlage{'n' if len(heute_faellig) != 1 else ''} heute fällig",
            "detail": ", ".join(sorted({kundenname(f) for f in heute_faellig})[:5]),
            "count": len(heute_faellig),
            "link": "/nachfassen",
        })

    # ---- Termine heute --------------------------------------------------
    von, bis = day_bounds(heute)
    termin_stmt = (
        select(Appointment)
        .where(
            Appointment.start_at >= von,
            Appointment.start_at < bis,
            Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]),
        )
        .order_by(Appointment.start_at)
    )
    if employee_id:
        termin_stmt = termin_stmt.where(Appointment.employee_id == employee_id)
    termine = db.scalars(termin_stmt).all()

    if termine:
        aufgaben.append({
            "kind": "appointments",
            "priority": 2,
            "title": f"{len(termine)} Termin{'e' if len(termine) != 1 else ''} heute",
            "detail": f"ab {termine[0].start_at.astimezone().strftime('%H:%M')} Uhr",
            "count": len(termine),
            "link": "/termine",
        })

    # ---- Verleihgeraete -------------------------------------------------
    verleih_stmt = select(Rental).where(Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]))
    if employee_id:
        verleih_stmt = verleih_stmt.where(Rental.employee_id == employee_id)
    verleih = db.scalars(verleih_stmt).all()

    ueberzogen = [r for r in verleih if r.due_at and r.due_at.date() < heute]
    bald = [
        r for r in verleih
        if r.due_at and heute <= r.due_at.date() <= heute + timedelta(days=BALD_FAELLIG_TAGE)
    ]

    if ueberzogen:
        aufgaben.append({
            "kind": "rental_overdue",
            "priority": 1,
            "title": f"{len(ueberzogen)} Verleihgerät{'e' if len(ueberzogen) != 1 else ''} überfällig",
            "detail": "Rückholung vereinbaren",
            "count": len(ueberzogen),
            "link": "/verleih",
        })
    if bald:
        aufgaben.append({
            "kind": "rental_due_soon",
            "priority": 3,
            "title": f"{len(bald)} Verleihgerät{'e' if len(bald) != 1 else ''} in den nächsten Tagen fällig",
            "detail": f"innerhalb von {BALD_FAELLIG_TAGE} Tagen",
            "count": len(bald),
            "link": "/verleih",
        })

    aufgaben.sort(key=lambda a: (a["priority"], -a["count"]))
    return aufgaben


def _route(db: Session, employee_id: str | None, heute: date) -> dict:
    """Tagesroute: Stopps mit und ohne brauchbare Adresse."""
    von, bis = day_bounds(heute)
    stmt = (
        select(Appointment)
        .where(
            Appointment.start_at >= von,
            Appointment.start_at < bis,
            Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED]),
        )
        .order_by(Appointment.start_at)
    )
    if employee_id:
        stmt = stmt.where(Appointment.employee_id == employee_id)
    termine = db.scalars(stmt).all()

    mit_adresse = [a for a in termine if (a.address_snapshot or "").strip()]
    ohne_adresse = [a for a in termine if not (a.address_snapshot or "").strip()]

    return {
        "stops": len(mit_adresse),
        "without_address": len(ohne_adresse),
        "first_at": termine[0].start_at if termine else None,
        "last_at": termine[-1].start_at if termine else None,
    }


def _ziel(db: Session, employee_id: str | None, heute: date) -> dict:
    """Monatsziel: Stand, Restbedarf und ob das Tempo reicht."""
    stats = dashboard_stats(db, employee_id)

    monatsende = month_bounds(heute)[1].date() - timedelta(days=1)
    rest_arbeitstage = _arbeitstage(heute, monatsende)
    fehlend = int(stats.get("units_missing") or 0)

    pro_tag = round(fehlend / rest_arbeitstage, 1) if rest_arbeitstage and fehlend else 0.0

    # Lineares Soll: wie viel muesste zum heutigen Tag erreicht sein?
    monatsanfang = month_bounds(heute)[0].date()
    gesamt_arbeitstage = _arbeitstage(monatsanfang, monatsende)
    vergangen = _arbeitstage(monatsanfang, heute)
    ziel = int(stats.get("units_target") or 0)
    soll_heute = round(ziel * vergangen / gesamt_arbeitstage, 1) if gesamt_arbeitstage else 0.0
    erreicht = int(stats.get("units_month") or 0)

    return {
        "units_month": erreicht,
        "units_target": ziel,
        "units_missing": fehlend,
        "units_percent": stats.get("units_percent"),
        "working_days_left": rest_arbeitstage,
        "needed_per_working_day": pro_tag,
        "expected_by_today": soll_heute,
        "on_track": erreicht >= soll_heute,
    }


def _entwicklung(db: Session, employee_id: str | None, heute: date) -> dict:
    """Wochenvergleich - und der Versuch, die Veraenderung zu begruenden.

    Die Erklaerung bleibt bewusst bei dem, was die Zahlen hergeben: mehr oder
    weniger Termine, bessere oder schlechtere Abschlussquote. Alles darueber
    hinaus waere geraten.
    """
    start, ende = week_bounds(heute)
    vorher_start, vorher_ende = previous_period(start, ende)

    zahlen = trend(db, start, ende, employee_id)
    jetzt = appointment_kpis(db, start, ende, employee_id)
    davor = appointment_kpis(db, vorher_start, vorher_ende, employee_id)

    termin_delta = jetzt["appointments_done"] - davor["appointments_done"]
    quote_delta = round(jetzt["close_rate_percent"] - davor["close_rate_percent"], 1)

    gruende: list[str] = []
    if termin_delta:
        gruende.append(
            f"{abs(termin_delta)} Termin{'e' if abs(termin_delta) != 1 else ''} "
            f"{'mehr' if termin_delta > 0 else 'weniger'} durchgeführt"
        )
    if quote_delta:
        gruende.append(
            f"Abschlussquote {'höher' if quote_delta > 0 else 'niedriger'} "
            f"({jetzt['close_rate_percent']} % statt {davor['close_rate_percent']} %)"
        )
    if not gruende:
        gruende.append("Termine und Abschlussquote liegen auf Vorwochenniveau")

    return {
        "revenue_cents": zahlen["revenue_cents"],
        "revenue_previous_cents": zahlen["revenue_previous_cents"],
        "revenue_change_percent": zahlen["revenue_change_percent"],
        "units": zahlen["units"],
        "units_previous": zahlen["units_previous"],
        "appointments_done": jetzt["appointments_done"],
        "appointments_done_previous": davor["appointments_done"],
        "close_rate_percent": jetzt["close_rate_percent"],
        "close_rate_percent_previous": davor["close_rate_percent"],
        "reasons": gruende,
    }


def _empfehlungen(aufgaben: list[dict], ziel: dict, entwicklung: dict, route: dict) -> list[str]:
    """Konkrete naechste Schritte - jeder Satz haengt an einer Zahl von oben."""
    empfehlungen: list[str] = []

    ueberfaellig = next((a for a in aufgaben if a["kind"] == "followup_overdue"), None)
    if ueberfaellig:
        empfehlungen.append(
            f"Zuerst die {ueberfaellig['count']} überfälligen Wiedervorlagen abarbeiten – "
            "je länger sie liegen, desto kälter der Kontakt."
        )

    rueckholung = next((a for a in aufgaben if a["kind"] == "rental_overdue"), None)
    if rueckholung:
        anzahl = rueckholung["count"]
        empfehlungen.append(
            f"{anzahl} überfällige{'s' if anzahl == 1 else ''} "
            f"Verleihgerät{'' if anzahl == 1 else 'e'} zurückholen – "
            f"{'es fehlt' if anzahl == 1 else 'sie fehlen'} sonst für den nächsten Termin."
        )

    if route["stops"] >= 2:
        empfehlungen.append(
            f"{route['stops']} Kundentermine mit Adresse – vor der Abfahrt einmal die Route planen."
        )
    if route["without_address"]:
        ohne = route["without_address"]
        empfehlungen.append(
            f"{ohne} Termin{'' if ohne == 1 else 'e'} ohne Adresse – "
            f"so {'fehlt er' if ohne == 1 else 'fehlen sie'} in der Routenplanung."
        )

    if ziel["units_target"]:
        if ziel["units_missing"] <= 0:
            empfehlungen.append("Monatsziel ist erreicht.")
        elif ziel["working_days_left"] == 0:
            empfehlungen.append(
                f"Der Monat ist vorbei, es fehlen {ziel['units_missing']} Einheiten."
            )
        elif not ziel["on_track"]:
            empfehlungen.append(
                f"Beim Monatsziel {_zahl(ziel['expected_by_today'] - ziel['units_month'])} "
                f"Einheiten hinter dem Soll – für den Rest reichen "
                f"{_zahl(ziel['needed_per_working_day'])} Einheiten pro Arbeitstag."
            )
        else:
            empfehlungen.append(
                f"Monatsziel im Plan – {_zahl(ziel['needed_per_working_day'])} Einheiten pro "
                f"verbleibendem Arbeitstag halten das Tempo."
            )

    veraenderung = entwicklung["revenue_change_percent"]
    if veraenderung is not None and abs(veraenderung) >= 10:
        richtung = "über" if veraenderung > 0 else "unter"
        empfehlungen.append(
            f"Wochenumsatz {_zahl(abs(veraenderung))} % {richtung} der Vorwoche – "
            f"{entwicklung['reasons'][0]}."
        )

    return empfehlungen


def day_briefing(db: Session, user: User, employee_id: str | None = None) -> dict:
    """Vollstaendiges Tagesbriefing fuer den angemeldeten Benutzer.

    `employee_id` ist bereits ueber scoped_employee_id geprueft: None bedeutet
    fuer einen Teamleiter "alle", fuer alle anderen kommt hier nie None an.
    """
    heute = local_today()

    aufgaben = _aufgaben(db, user, employee_id, heute)
    route = _route(db, employee_id, heute)
    ziel = _ziel(db, employee_id, heute)
    entwicklung = _entwicklung(db, employee_id, heute)

    briefing = {
        "date": heute,
        "for_name": user.full_name,
        "scope": "team" if employee_id is None else "own",
        "tasks": aufgaben,
        "route": route,
        "goal": ziel,
        "development": entwicklung,
        "recommendations": _empfehlungen(aufgaben, ziel, entwicklung, route),
    }

    # Teamleiter bekommen zusaetzlich den Blick aufs Team.
    if employee_id is None:
        hinweise = team_alerts(db, heute)
        fortschritt = employee_goal_progress(db, heute)
        briefing["team"] = {
            "alerts": hinweise,
            "employees_behind": [
                e for e in fortschritt
                if isinstance(e.get("units_percent"), (int, float)) and e["units_percent"] < 60
            ],
        }

    return briefing


def briefing_als_text(briefing: dict) -> str:
    """Das Briefing als lesbarer Absatz - fuer die Antwort ohne Sprachmodell."""
    zeilen: list[str] = []

    if briefing["tasks"]:
        zeilen.append("Heute steht an:")
        for aufgabe in briefing["tasks"]:
            detail = f" ({aufgabe['detail']})" if aufgabe.get("detail") else ""
            zeilen.append(f"• {aufgabe['title']}{detail}")
    else:
        zeilen.append("Für heute stehen keine Termine, Wiedervorlagen oder Rückholungen an.")

    ziel = briefing["goal"]
    if ziel["units_target"]:
        zeilen.append(
            f"\nMonatsziel: {ziel['units_month']} von {ziel['units_target']} Einheiten"
            f" ({ziel['units_percent']} %)."
        )

    entwicklung = briefing["development"]
    if entwicklung["revenue_change_percent"] is not None:
        zeilen.append(
            f"Wochenumsatz {_geld(entwicklung['revenue_cents'])}, "
            f"{entwicklung['revenue_change_percent']} % gegenüber der Vorwoche – "
            f"{entwicklung['reasons'][0]}."
        )

    if briefing["recommendations"]:
        zeilen.append("\nVorschlag:")
        for satz in briefing["recommendations"]:
            zeilen.append(f"• {satz}")

    return "\n".join(zeilen)
