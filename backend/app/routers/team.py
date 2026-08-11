from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import require_team_leader
from app.core.security import get_current_user
from app.core.timeutils import month_bounds, week_bounds
from app.models import Appointment, Employee, ProductPresentation, Rental, RentalStatus, Sale, User
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
        result.append({
            "id": e.id, "display_name": e.display_name, "position": e.position,
            **stats, "appointments_week": appointments, "sales_week": sales,
            "presentations_week": presentations, "active_rentals": rentals,
        })
    return result


@router.get("/stats")
def team_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_team_leader(user)
    stats = dashboard_stats(db, None)
    count = db.scalar(select(func.count(Employee.id))) or 0
    return {**stats, "employees": count, "average_units_per_employee": round(stats["units_week"] / count, 1) if count else 0}


@router.get("/audit")
def audit_log(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.models import AuditLog
    require_team_leader(user)
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500)).all()
    return [{"id": r.id, "user_id": r.user_id, "action": r.action, "entity_type": r.entity_type, "entity_id": r.entity_id, "created_at": r.created_at, "before": r.before_json, "after": r.after_json} for r in rows]
