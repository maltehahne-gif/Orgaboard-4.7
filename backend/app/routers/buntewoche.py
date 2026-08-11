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
        k70 = revenue_between(db, ds, de, employee_id, SaleChannel.K70)
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
        "units_target": employee.weekly_units_target,
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
    data = [["Uhrzeit", *weekday_names]]
    cell_events = {(a["day_index"], a["hour"]): a for a in payload["appointments"]}
    for slot_label, hour in SLOTS:
        row = [slot_label]
        for day_idx in range(7):
            event = cell_events.get((day_idx, hour))
            if event:
                start = event["start_at"]
                start_label = start.strftime("%H:%M") if hasattr(start, "strftime") else str(start)[11:16]
                row.append(f"{start_label}\n{event['label']}")
            else:
                row.append("")
        data.append(row)
    table = Table(data, colWidths=[76] + [95] * 7, rowHeights=[24] + [31] * len(SLOTS))
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
    hour_to_row = {h: idx + 1 for idx, (_, h) in enumerate(SLOTS)}
    for a in payload["appointments"]:
        row = hour_to_row.get(a["hour"])
        if row:
            style.append(("BACKGROUND", (a["day_index"] + 1, row), (a["day_index"] + 1, row), colors.HexColor(APPT_COLORS.get(a["appointment_type"], "#6c7a86"))))
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
