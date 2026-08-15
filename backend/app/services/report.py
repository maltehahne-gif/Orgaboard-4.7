"""Wochen- und Monatsberichte.

Der Bericht wird bei jedem Abruf frisch gerechnet, nicht zwischengespeichert.
Er greift auf dieselben Dienste zu wie Dashboard und Briefing - eine
nachtraeglich stornierte Buchung schlaegt damit auch in einem alten Bericht
durch, statt eine ueberholte Zahl zu konservieren.

Bewusst ohne Sprachmodell: die Saetze unter "Auffaelligkeiten" entstehen aus
festen Regeln, jede haengt an einer Zahl aus demselben Bericht. Wer einen
Satz liest, kann ihn eine Zeile weiter oben nachrechnen.

Was hier NICHT passiert: der Bericht wird nicht von selbst verschickt. Dafuer
braeuchte es einen Mailversand und einen Job, der ausserhalb einer Anfrage
laeuft - beides gibt es in dieser Installation nicht. "Automatisch" heisst
hier: niemand muss die Zahlen zusammentragen, der Bericht steht fuer jede
vergangene Woche und jeden vergangenen Monat auf Abruf bereit.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import sieht_fremde_daten
from app.core.timeutils import local_today, month_bounds, utc_aware, week_bounds
from app.models import (
    Employee,
    FollowUp,
    FollowUpStatus,
    Rental,
    RentalStatus,
    Sale,
    User,
)
from app.services.analytics import employee_goal_progress, previous_period, product_ranking, trend
from app.services.stats import not_cancelled
from app.services.timeline import appointment_kpis

MONATE = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
]

# Ab dieser Veraenderung wird ein Rueckgang oder Anstieg eigens erwaehnt.
AUFFAELLIG_PROZENT = 20

# Unter so vielen Terminen ist eine Abschlussquote nicht aussagekraeftig.
MINDEST_TERMINE_FUER_QUOTE = 3


def _geld(cents: int) -> str:
    return f"{cents / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _zahl(wert: float) -> str:
    """Deutsche Schreibweise mit Komma - "0.8 Einheiten" liest sich falsch."""
    text = f"{wert:.1f}".replace(".", ",")
    return text[:-2] if text.endswith(",0") else text


def _prozent(wert: float | None) -> str:
    if wert is None:
        return "kein Vorwert"
    return f"{'+' if wert > 0 else ''}{_zahl(wert)} %"


def zeitraum(kind: str, offset: int = 0, heute: date | None = None) -> tuple[datetime, datetime, str]:
    """Grenzen und Bezeichnung eines Zeitraums.

    offset zaehlt rueckwaerts: 0 ist die laufende Woche bzw. der laufende
    Monat, 1 die vorige. So laesst sich der Bericht der abgeschlossenen
    Periode abrufen, ohne ein Datum ausrechnen zu muessen.
    """
    tag = heute or local_today()

    if kind == "week":
        bezug = tag - timedelta(weeks=offset)
        start, ende = week_bounds(bezug)
        montag = start.date()
        sonntag = (ende - timedelta(days=1)).date()
        label = f"KW {montag.isocalendar().week} ({montag.strftime('%d.%m.')} – {sonntag.strftime('%d.%m.%Y')})"
        return start, ende, label

    if kind == "month":
        bezug = tag.replace(day=1)
        for _ in range(offset):
            bezug = (bezug - timedelta(days=1)).replace(day=1)
        start, ende = month_bounds(bezug)
        label = f"{MONATE[bezug.month - 1]} {bezug.year}"
        return start, ende, label

    raise ValueError("Unbekannter Zeitraum")


def _verkaeufe(db: Session, start: datetime, ende: datetime, employee_id: str | None) -> int:
    stmt = select(Sale).where(Sale.sold_at >= start, Sale.sold_at < ende, not_cancelled())
    if employee_id:
        stmt = stmt.where(Sale.employee_id == employee_id)
    return len(db.scalars(stmt).all())


def _verleih(db: Session, start: datetime, ende: datetime, employee_id: str | None) -> dict:
    """Was im Zeitraum rausging, zurueckkam und was noch aussteht."""
    raus = select(Rental).where(Rental.issued_at >= start, Rental.issued_at < ende)
    zurueck = select(Rental).where(Rental.returned_at.is_not(None),
                                   Rental.returned_at >= start, Rental.returned_at < ende)
    offen = select(Rental).where(Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]))

    if employee_id:
        raus = raus.where(Rental.employee_id == employee_id)
        zurueck = zurueck.where(Rental.employee_id == employee_id)
        offen = offen.where(Rental.employee_id == employee_id)

    # "Ueberfaellig" heisst hier: noch draussen, obwohl die Rueckgabe bis zum
    # Ende des Berichtszeitraums faellig war. Bei einem alten Bericht bleibt
    # die Aussage damit richtig, statt am heutigen Datum zu haengen.
    # utc_aware, weil SQLite auch bei timezone=True naive Werte zurueckgibt -
    # ein direkter Vergleich wuerde dort abbrechen, in PostgreSQL aber nicht.
    noch_draussen = db.scalars(offen).all()
    ueberfaellig = [r for r in noch_draussen if r.due_at and utc_aware(r.due_at) < ende]

    return {
        "issued": len(db.scalars(raus).all()),
        "returned": len(db.scalars(zurueck).all()),
        "still_out": len(noch_draussen),
        "overdue": len(ueberfaellig),
    }


def _nachfassen(db: Session, start: datetime, ende: datetime, employee_id: str | None) -> dict:
    """Wiedervorlagen: neu entstanden, erledigt, offen geblieben."""
    neu = select(FollowUp).where(FollowUp.created_at >= start, FollowUp.created_at < ende)
    offen = select(FollowUp).where(FollowUp.status == FollowUpStatus.OPEN)

    if employee_id:
        neu = neu.where(FollowUp.employee_id == employee_id)
        offen = offen.where(FollowUp.employee_id == employee_id)

    offene = db.scalars(offen).all()
    stichtag = (ende - timedelta(days=1)).date()

    return {
        "created": len(db.scalars(neu).all()),
        "open": len(offene),
        "overdue": len([f for f in offene if f.due_on and f.due_on < stichtag]),
    }


def _team(db: Session, start: datetime, ende: datetime) -> list[dict]:
    """Eine Zeile je aktivem Mitarbeiter, nach Umsatz sortiert."""
    zeilen = []
    for e in db.scalars(select(Employee)).all():
        zahlen = trend(db, start, ende, e.id)
        termine = appointment_kpis(db, start, ende, e.id)
        zeilen.append({
            "employee_id": e.id,
            "name": e.display_name,
            "revenue_cents": zahlen["revenue_cents"],
            "revenue_change_percent": zahlen["revenue_change_percent"],
            "units": zahlen["units"],
            "appointments_done": termine["appointments_done"],
            "close_rate_percent": termine["close_rate_percent"],
        })

    zeilen.sort(key=lambda z: -z["revenue_cents"])
    return zeilen


def _auffaelligkeiten(kennzahlen: dict, termine: dict, verleih: dict, nachfassen: dict,
                      produkte: list[dict]) -> list[str]:
    """Saetze, die jeweils an genau einer Zahl von oben haengen."""
    saetze: list[str] = []

    aenderung = kennzahlen["revenue_change_percent"]
    if aenderung is not None and abs(aenderung) >= AUFFAELLIG_PROZENT:
        richtung = "über" if aenderung > 0 else "unter"
        saetze.append(
            f"Umsatz liegt {_zahl(abs(aenderung))} % {richtung} dem Vergleichszeitraum "
            f"({_geld(kennzahlen['revenue_cents'])} statt {_geld(kennzahlen['revenue_previous_cents'])})."
        )
    elif aenderung is None and kennzahlen["revenue_cents"]:
        saetze.append(
            f"Umsatz {_geld(kennzahlen['revenue_cents'])}. Für den Vergleichszeitraum "
            "liegen keine Zahlen vor."
        )

    if termine["appointments_done"] >= MINDEST_TERMINE_FUER_QUOTE:
        saetze.append(
            f"Aus {termine['appointments_done']} durchgeführten Terminen wurden "
            f"{termine['appointments_with_sale']} Abschlüsse – Quote {_zahl(termine['close_rate_percent'])} %, "
            f"im Schnitt {_geld(termine['revenue_per_appointment_cents'])} je Termin."
        )
    elif termine["appointments_done"]:
        saetze.append(
            f"Nur {termine['appointments_done']} durchgeführte Termine – für eine "
            "Abschlussquote ist das zu wenig, um daraus etwas abzuleiten."
        )
    else:
        saetze.append("In diesem Zeitraum wurde kein Termin als durchgeführt erfasst.")

    if produkte:
        spitze = produkte[0]
        saetze.append(
            f"Stärkstes Produkt: {spitze['name']} mit {_geld(spitze['revenue_cents'])} "
            f"({_zahl(spitze['share_percent'])} % des Umsatzes)."
        )

    if verleih["overdue"]:
        saetze.append(
            f"{verleih['overdue']} Verleihgerät{'e sind' if verleih['overdue'] != 1 else ' ist'} "
            "überfällig und sollte zurückgeholt werden."
        )

    if nachfassen["overdue"]:
        saetze.append(
            f"{nachfassen['overdue']} Wiedervorlage{'n liegen' if nachfassen['overdue'] != 1 else ' liegt'} "
            "über dem Termin."
        )

    return saetze


def build_report(
    db: Session,
    user: User,
    kind: str,
    employee_id: str | None = None,
    offset: int = 0,
    heute: date | None = None,
) -> dict:
    """Vollstaendiger Bericht fuer eine Woche oder einen Monat.

    employee_id = None bedeutet: alles, was der Anfragende sehen darf. Die
    Einschraenkung selbst passiert im Router, damit hier keine zweite,
    womoeglich abweichende Rechtelogik entsteht.
    """
    start, ende, label = zeitraum(kind, offset, heute)
    vor_start, vor_ende = previous_period(start, ende)

    kennzahlen = trend(db, start, ende, employee_id)
    termine = appointment_kpis(db, start, ende, employee_id)
    davor = appointment_kpis(db, vor_start, vor_ende, employee_id)
    produkte = product_ranking(db, start, ende, employee_id, limit=5)
    verleih = _verleih(db, start, ende, employee_id)
    nachfassen = _nachfassen(db, start, ende, employee_id)

    bericht = {
        "kind": kind,
        "label": label,
        "start": start,
        "end": ende,
        "employee_id": employee_id,
        "is_complete": ende <= datetime.now(ende.tzinfo),
        "metrics": {
            **kennzahlen,
            "sales": _verkaeufe(db, start, ende, employee_id),
            "appointments_total": termine["appointments_total"],
            "appointments_done": termine["appointments_done"],
            "appointments_done_previous": davor["appointments_done"],
            "appointments_with_sale": termine["appointments_with_sale"],
            "presentations": termine["presentations"],
            "close_rate_percent": termine["close_rate_percent"],
            "close_rate_percent_previous": davor["close_rate_percent"],
            "revenue_per_appointment_cents": termine["revenue_per_appointment_cents"],
        },
        "products": produkte,
        "rentals": verleih,
        "follow_ups": nachfassen,
        "highlights": _auffaelligkeiten(kennzahlen, termine, verleih, nachfassen, produkte),
        "team": None,
        "goals": None,
    }

    # Teamsicht nur fuer die Teamleitung und nur ohne Einschraenkung auf eine
    # Person - eine "Teamtabelle" mit einer Zeile waere irrefuehrend.
    if sieht_fremde_daten(user) and employee_id is None:
        bericht["team"] = _team(db, start, ende)
        if kind == "month" and offset == 0:
            bericht["goals"] = employee_goal_progress(db)

    return bericht


def report_als_text(bericht: dict) -> str:
    """Der Bericht als lesbarer Text - zum Weitergeben ausserhalb des Systems."""
    m = bericht["metrics"]
    titel = "Wochenbericht" if bericht["kind"] == "week" else "Monatsbericht"

    zeilen = [
        f"{titel} – {bericht['label']}",
        "=" * (len(titel) + len(bericht["label"]) + 3),
        "",
    ]

    if not bericht["is_complete"]:
        zeilen += ["Hinweis: Der Zeitraum läuft noch. Die Zahlen sind ein Zwischenstand.", ""]

    zeilen += [
        "Kennzahlen",
        "----------",
        f"Umsatz                  {_geld(m['revenue_cents'])}  ({_prozent(m['revenue_change_percent'])})",
        f"Einheiten               {m['units']}  (davor {m['units_previous']})",
        f"Verkäufe                {m['sales']}",
        f"Termine durchgeführt    {m['appointments_done']}  (davor {m['appointments_done_previous']})",
        f"davon mit Abschluss     {m['appointments_with_sale']}",
        f"Abschlussquote          {_zahl(m['close_rate_percent'])} %  "
        f"(davor {_zahl(m['close_rate_percent_previous'])} %)",
        f"Umsatz je Termin        {_geld(m['revenue_per_appointment_cents'])}",
        f"Vorführungen            {m['presentations']}",
        "",
    ]

    if bericht["products"]:
        zeilen += ["Produkte", "--------"]
        for p in bericht["products"]:
            zeilen.append(
                f"{p['name']:<34} {_geld(p['revenue_cents']):>14}  "
                f"{p['quantity']}×  {_zahl(p['share_percent'])} %"
            )
        zeilen.append("")

    v = bericht["rentals"]
    f = bericht["follow_ups"]
    zeilen += [
        "Verleih und Nachfassen",
        "----------------------",
        f"Geräte ausgegeben       {v['issued']}",
        f"Geräte zurück           {v['returned']}",
        f"noch unterwegs          {v['still_out']}  (davon überfällig: {v['overdue']})",
        f"Wiedervorlagen neu      {f['created']}",
        f"Wiedervorlagen offen    {f['open']}  (davon überfällig: {f['overdue']})",
        "",
    ]

    if bericht["team"]:
        zeilen += ["Team", "----"]
        for t in bericht["team"]:
            zeilen.append(
                f"{t['name']:<26} {_geld(t['revenue_cents']):>14}  "
                f"{t['units']} Einheiten  {t['appointments_done']} Termine  "
                f"Quote {_zahl(t['close_rate_percent'])} %"
            )
        zeilen.append("")

    if bericht["highlights"]:
        zeilen += ["Auffälligkeiten", "---------------"]
        zeilen += [f"- {s}" for s in bericht["highlights"]]
        zeilen.append("")

    zeilen.append("Erstellt aus den Daten in OrgaBoard. Stornierte Verkäufe sind nicht enthalten.")
    return "\n".join(zeilen)
