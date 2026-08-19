from __future__ import annotations
from datetime import date, datetime, time, timedelta, timezone
from io import BytesIO
import unicodedata
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user
from app.core.timeutils import day_bounds, local_today, to_business_tz, week_bounds
from app.models import Appointment, Customer, Employee, SaleChannel, User
from app.services.stats import revenue_between, units_between

router = APIRouter(prefix="/buntewoche", tags=["buntewoche"])

SLOTS = [
    ("08:00 – 10:00", 8), ("09:00 – 11:00", 9), ("10:00 – 12:00", 10),
    ("11:00 – 13:00", 11), ("12:00 – 14:00", 12), ("13:00 – 15:00", 13),
    ("14:00 – 16:00", 14), ("15:00 – 17:00", 15), ("16:00 – 18:00", 16),
    ("17:00 – 18:00", 17), ("18:00 – 19:00", 18), ("19:00 – 20:00", 19),
]

APPT_COLORS = {
    "promotion": "#bd632e",
    "recommendation": "#4d3a7f",
    "premium_checkin": "#a66b95",
    "customer": "#5ba84f",
    "team": "#3698d0",
    "telephone": "#efd82e",
    "other": "#6c7a86",
}


def monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def make_payload(db: Session, employee_id: str, week_start: date) -> dict:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")
    start, end = week_bounds(week_start)
    appointments = db.scalars(
        select(Appointment)
        .where(Appointment.employee_id == employee_id, Appointment.start_at >= start, Appointment.start_at < end)
        .order_by(Appointment.start_at)
    ).all()
    appts = []
    for a in appointments:
        c = db.get(Customer, a.customer_id) if a.customer_id else None
        local_start = to_business_tz(a.start_at)
        local_end = to_business_tz(a.end_at) if a.end_at else None
        appts.append({
            "id": a.id,
            "day_index": local_start.weekday(),
            "hour": local_start.hour,
            "start_at": local_start,
            "end_at": local_end,
            "label": f"{c.first_name} {c.last_name}" if c else (a.notes or "Termin"),
            "appointment_type": a.appointment_type.value,
            "status": a.status.value,
        })
    days = []
    week_revenue = 0
    week_units = 0
    for idx in range(7):
        d = week_start + timedelta(days=idx)
        ds, de = day_bounds(d)
        total = revenue_between(db, ds, de, employee_id)
        area = revenue_between(db, ds, de, employee_id, SaleChannel.FIELD)
        k70 = revenue_between(db, ds, de, employee_id, product_category="K70")
        units = units_between(db, ds, de, employee_id)
        week_revenue += total
        week_units += units
        days.append({
            "date": d.isoformat(),
            "area_target_cents": employee.daily_area_target_cents,
            "area_actual_cents": area,
            "total_target_cents": employee.daily_total_target_cents,
            "total_actual_cents": total,
            "k70_cents": k70,
            "units": units,
        })
    return {
        "employee": {"id": employee.id, "name": employee.display_name},
        "week_start": week_start.isoformat(),
        "week_end": (week_start + timedelta(days=6)).isoformat(),
        "calendar_week": week_start.isocalendar().week,
        "appointments": appts,
        "days": days,
        "week_revenue_cents": week_revenue,
        "week_units": week_units,
        "monthly_units_target": employee.monthly_units_target,
        "slots": [{"label": s, "hour": h} for s, h in SLOTS],
        "legend": APPT_COLORS,
    }


@router.get("")
def get_buntewoche(
    week_start: date | None = Query(default=None),
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = scoped_employee_id(db, user, employee_id)
    if scope is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen Mitarbeiter auswählen")
    week = monday_of(week_start or local_today())
    return make_payload(db, scope, week)


def money(cents: int | None) -> str:
    if cents is None:
        return "–"
    return f"{cents / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _uhrzeit(wert) -> str:
    return wert.strftime("%H:%M") if hasattr(wert, "strftime") else str(wert)[11:16]


# Zusatzzeilen fuer Termine ausserhalb der Standardzeiten. Sie erscheinen
# nur, wenn es solche Termine gibt - im Normalfall sieht die Tabelle aus wie
# die Vorlage.
FRUEH_LABEL = "vor 08:00"
SPAET_LABEL = "nach 20:00"


def _raster(termine: list[dict]) -> tuple[list[tuple[str, int]], dict[tuple[int, int], list[dict]]]:
    """Zeilen der Wochentabelle und die Termine je Zelle.

    Zwei Dinge, die vorher still danebengingen:

    1. Zwei Termine in derselben Stunde - etwa 10:00 und 10:30 - landeten
       im selben Schluessel eines Dictionary. Der zweite ueberschrieb den
       ersten, und im PDF stand nur noch einer. Deshalb sammelt jede Zelle
       jetzt eine Liste.
    2. Ein Termin um 07:00 oder um 21:00 fand ueberhaupt keine Zeile und
       verschwand ersatzlos. Dafuer gibt es jetzt je eine Zusatzzeile am
       Anfang und am Ende - aber nur, wenn wirklich ein solcher Termin
       existiert.

    Rueckgabe: die Zeilen als (Beschriftung, Zeilenindex) und die Termine
    je (Tag, Zeilenindex), jeweils nach Startzeit sortiert.
    """
    stunden = [h for _, h in SLOTS]
    erste, letzte = min(stunden), max(stunden)

    frueh = [t for t in termine if t["hour"] < erste]
    spaet = [t for t in termine if t["hour"] > letzte]

    zeilen: list[tuple[str, int]] = []
    zeile_je_stunde: dict[int, int] = {}
    naechste = 1

    if frueh:
        zeilen.append((FRUEH_LABEL, naechste))
        frueh_zeile = naechste
        naechste += 1
    for label, stunde in SLOTS:
        zeilen.append((label, naechste))
        zeile_je_stunde[stunde] = naechste
        naechste += 1
    if spaet:
        zeilen.append((SPAET_LABEL, naechste))
        spaet_zeile = naechste

    zellen: dict[tuple[int, int], list[dict]] = {}
    for t in sorted(termine, key=lambda x: (x["day_index"], str(x["start_at"]))):
        if t["hour"] < erste:
            zeile = frueh_zeile
        elif t["hour"] > letzte:
            zeile = spaet_zeile
        else:
            zeile = zeile_je_stunde[t["hour"]]
        zellen.setdefault((t["day_index"], zeile), []).append(t)

    return zeilen, zellen


def build_pdf(payload: dict) -> bytes:
    buffer = BytesIO()
    from reportlab.platypus import SimpleDocTemplate
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=12, leftMargin=12, topMargin=12, bottomMargin=12)
    styles = getSampleStyleSheet()
    story = []
    title = f"KW {payload['calendar_week']} · Orga-Woche · {payload['employee']['name']} · {payload['week_start']} – {payload['week_end']}"
    story.append(Paragraph(title, styles["Heading2"]))
    story.append(Spacer(1, 6))
    weekday_names = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

    zeilen_stunden, cell_events = _raster(payload["appointments"])

    data = [["Uhrzeit", *weekday_names]]
    for slot_label, _ in zeilen_stunden:
        data.append([slot_label] + ["" for _ in range(7)])

    for (tag, zeile), termine in cell_events.items():
        data[zeile][tag + 1] = "\n".join(
            f"{_uhrzeit(t['start_at'])} {t['label']}" for t in termine
        )

    # Zeilenhoehe waechst mit der vollsten Zelle: zwei Termine in derselben
    # Stunde brauchen zwei Zeilen, sonst wird der zweite abgeschnitten.
    hoehen = [24]
    for _, index in zeilen_stunden:
        proTag = [len(cell_events.get((tag, index), [])) for tag in range(7)]
        hoehen.append(max(31, 16 * max(proTag or [0]) + 6))

    table = Table(data, colWidths=[76] + [95] * 7, rowHeights=hoehen)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#3e4a44")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d8ddc4")),
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#edf0e6")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
    ]
    for (tag, zeile), termine in cell_events.items():
        # Bei mehreren Terminen in einer Zelle faerbt der erste - die
        # Uhrzeiten im Text sagen ohnehin genauer, was dort steht.
        farbe = APPT_COLORS.get(termine[0]["appointment_type"], "#6c7a86")
        style.append(("BACKGROUND", (tag + 1, zeile), (tag + 1, zeile), colors.HexColor(farbe)))
    table.setStyle(TableStyle(style))
    story.append(table)
    story.append(Spacer(1, 8))
    metrics = [
        ["", *weekday_names],
        ["Festgebietsumsatz Soll", *[money(d["area_target_cents"]) for d in payload["days"]]],
        ["Festgebietsumsatz Ist", *[money(d["area_actual_cents"]) for d in payload["days"]]],
        ["Gesamtumsatz Soll", *[money(d["total_target_cents"]) for d in payload["days"]]],
        ["Gesamtumsatz Ist", *[money(d["total_actual_cents"]) for d in payload["days"]]],
        ["K70 Umsätze pro Tag", *[money(d["k70_cents"]) for d in payload["days"]]],
        ["Einheiten pro Tag", *[str(d["units"]) for d in payload["days"]]],
    ]
    mt = Table(metrics, colWidths=[130] + [87] * 7, rowHeights=20)
    mt.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#6a6a6a")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e4e6dc")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.2),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(mt)
    story.append(Spacer(1, 7))
    legend = [[
        "Legende:",
        "Promotion / Messe", "Empfehlung", "Premium Check-in", "Kundendaten", "Team", "Telefonie"
    ]]
    lt = Table(legend, colWidths=[55, 100, 80, 95, 85, 55, 60], rowHeights=20)
    lt.setStyle(TableStyle([
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor(APPT_COLORS["promotion"])),
        ("BACKGROUND", (2, 0), (2, 0), colors.HexColor(APPT_COLORS["recommendation"])),
        ("BACKGROUND", (3, 0), (3, 0), colors.HexColor(APPT_COLORS["premium_checkin"])),
        ("BACKGROUND", (4, 0), (4, 0), colors.HexColor(APPT_COLORS["customer"])),
        ("BACKGROUND", (5, 0), (5, 0), colors.HexColor(APPT_COLORS["team"])),
        ("BACKGROUND", (6, 0), (6, 0), colors.HexColor(APPT_COLORS["telephone"])),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#777777")),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
    ]))
    story.append(lt)
    doc.build(story)
    return buffer.getvalue()


@router.get("/pdf")
def export_pdf(
    week_start: date | None = Query(default=None),
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = scoped_employee_id(db, user, employee_id)
    if scope is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen Mitarbeiter auswählen")
    week = monday_of(week_start or local_today())
    payload = make_payload(db, scope, week)
    pdf = build_pdf(payload)
    raw_name = payload['employee']['name'].replace(' ', '-')
    safe_name = unicodedata.normalize("NFKD", raw_name).encode("ascii", "ignore").decode("ascii") or "Mitarbeiter"
    filename = f"buntewoche-KW{payload['calendar_week']}-{safe_name}.pdf"
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
