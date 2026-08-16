from datetime import datetime, timezone
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import require_team_leader
from app.core.security import get_current_user
from app.core.timeutils import local_today, month_bounds, week_bounds
from app.models import Appointment, Employee, ProductPresentation, Rental, RentalStatus, Sale, User
from app.services.analytics import employee_goal_progress
from app.services.orgscope import org_lookup, team_chain
from app.services.stats import dashboard_stats

router = APIRouter(prefix="/team", tags=["team"])


@router.get("/employees")
def employees(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_team_leader(user)
    rows = db.scalars(select(Employee).order_by(Employee.display_name)).all()
    ws, we = week_bounds(); ms, me = month_bounds()
    result = []
    for e in rows:
        stats = dashboard_stats(db, e.id)
        appointments = db.scalar(select(func.count(Appointment.id)).where(Appointment.employee_id == e.id, Appointment.start_at >= ws, Appointment.start_at < we)) or 0
        sales = db.scalar(select(func.count(Sale.id)).where(Sale.employee_id == e.id, Sale.sold_at >= ws, Sale.sold_at < we)) or 0
        presentations = db.scalar(select(func.count(ProductPresentation.id)).where(ProductPresentation.employee_id == e.id, ProductPresentation.presented_at >= ws, ProductPresentation.presented_at < we)) or 0
        rentals = db.scalar(select(func.count(Rental.id)).where(Rental.employee_id == e.id, Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]))) or 0
        chain = team_chain(db, e.team_id)
        result.append({
            "id": e.id, "display_name": e.display_name, "position": e.position,
            "team_id": chain.team_id, "team_name": chain.team_name,
            "district_id": chain.district_id, "district_name": chain.district_name,
            "region_id": chain.region_id, "region_name": chain.region_name,
            **stats, "appointments_week": appointments, "sales_week": sales,
            "presentations_week": presentations, "active_rentals": rentals,
        })
    return result


@router.get("/org-lookup")
def org_lookup_route(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Regionen, Bezirke und Teams als Auswahlliste fuer Filter.

    Anders als /sysadmin/org auch fuer Teamleiter und Regionalleiter
    erreichbar - die brauchen die Liste fuer die Pipeline- und
    Vergleichsfilter, duerfen die Struktur selbst aber nicht verwalten.
    """
    require_team_leader(user)
    return org_lookup(db)


@router.get("/stats")
def team_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_team_leader(user)
    stats = dashboard_stats(db, None)
    count = db.scalar(select(func.count(Employee.id))) or 0
    return {**stats, "employees": count, "average_units_per_employee": round(stats["units_week"] / count, 1) if count else 0}


@router.get("/stats/export.xlsx")
def export_team_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Zielerreichung je Mitarbeiter als Excel-Datei - dieselben Zahlen, die
    auf der Teamstatistiken-Seite angezeigt werden."""
    require_team_leader(user)
    rows = employee_goal_progress(db)

    wb = Workbook()
    ws = wb.active
    ws.title = "Teamstatistik"
    headers = ["Mitarbeiter", "Einheiten Monat", "Monatsziel", "Fehlend", "Zielerreichung %", "Umsatz Monat", "Umsatz Woche", "Termine durchgeführt", "Abschlussquote %"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    for row in rows:
        ws.append([
            row["display_name"],
            row["units_month"],
            row["units_target"],
            row["units_missing"],
            row["percent"],
            row["revenue_month_cents"] / 100,
            row["revenue_week_cents"] / 100,
            row["appointments_done"],
            row["close_rate_percent"],
        ])

    for column_cells in ws.columns:
        length = max((len(str(c.value)) for c in column_cells if c.value is not None), default=10)
        ws.column_dimensions[column_cells[0].column_letter].width = min(max(length + 2, 12), 32)

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"Teamstatistik_{local_today().isoformat()}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/audit")
def audit_log(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models import AuditLog
    require_team_leader(user)
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500)).all()
    return [{"id": r.id, "user_id": r.user_id, "action": r.action, "entity_type": r.entity_type, "entity_id": r.entity_id, "created_at": r.created_at, "before": r.before_json, "after": r.after_json} for r in rows]
