from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import require_team_leader, scoped_employee_id
from app.core.security import get_current_user
from app.core.timeutils import day_bounds, local_today, month_bounds, week_bounds, utc_aware
from app.models import Appointment, AppointmentStatus, Customer, Message, MessageHidden, MessageRead, Rental, RentalStatus, User
from app.services.stats import dashboard_stats
from app.services.analytics import (
    employee_goal_progress,
    product_ranking,
    team_alerts,
    trend,
)
from app.services.timeline import appointment_kpis, funnel_overview

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/funnel")
def funnel(employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verkaufstrichter mit Stufenbesetzung und Umwandlungsquoten."""
    scope = scoped_employee_id(db, user, employee_id)
    return funnel_overview(db, scope)


def _period_bounds(period: str):
    """Zeitraumgrenzen. Unbekannte Werte fallen auf den Monat zurück."""
    today = local_today()
    if period == "week":
        return week_bounds(today)
    if period == "day":
        return day_bounds(today)
    return month_bounds(today)


@router.get("/kpis")
def kpis(
    period: str = "month",
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Terminbezogene Kennzahlen: durchgeführte Termine, Abschlussquote,
    Umsatz pro Termin, Vorführungen."""
    scope = scoped_employee_id(db, user, employee_id)
    start, end = _period_bounds(period)
    return {"period": period, **appointment_kpis(db, start, end, scope)}


@router.get("/trend")
def trend_view(
    period: str = "month",
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Umsatz und Einheiten im Vergleich zum gleich langen Zeitraum davor."""
    scope = scoped_employee_id(db, user, employee_id)
    start, end = _period_bounds(period)
    return {"period": period, **trend(db, start, end, scope)}


@router.get("/products")
def product_ranking_view(
    period: str = "month",
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Meistverkaufte Produkte im Zeitraum."""
    scope = scoped_employee_id(db, user, employee_id)
    start, end = _period_bounds(period)
    return {"period": period, "products": product_ranking(db, start, end, scope)}


@router.get("/team-overview")
def team_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Zielerreichung je Mitarbeiter und Hinweise auf auffällige Entwicklungen."""
    require_team_leader(user)
    return {
        "employees": employee_goal_progress(db),
        "alerts": team_alerts(db),
    }


@router.get("")
def dashboard(employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stats = dashboard_stats(db, scope)
    now = datetime.now(timezone.utc)
    ds, de = day_bounds(local_today())
    appt_stmt = select(Appointment).where(Appointment.start_at >= ds, Appointment.start_at < de).order_by(Appointment.start_at)
    next_stmt = select(Appointment).where(Appointment.start_at >= now, Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED])).order_by(Appointment.start_at)
    rental_stmt = select(Rental).where(Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE])).order_by(Rental.due_at.asc().nullslast()).limit(5)
    if scope:
        appt_stmt = appt_stmt.where(Appointment.employee_id == scope)
        next_stmt = next_stmt.where(Appointment.employee_id == scope)
        rental_stmt = rental_stmt.where(Rental.employee_id == scope)
    today_appts = db.scalars(appt_stmt).all()
    next_a = db.scalar(next_stmt)
    rentals = db.scalars(rental_stmt).all()
    unread_stmt = (
        select(func.count(Message.id))
        .where(Message.sender_user_id != user.id)
        .where(
            or_(
                Message.recipient_user_id.is_(None),
                and_(
                    Message.recipient_user_id == user.id,
                    Message.read_at.is_(None),
                ),
            )
        )
        .where(
            ~Message.id.in_(
                select(MessageHidden.message_id).where(
                    MessageHidden.user_id == user.id
                )
            )
        )
        .where(
            ~Message.id.in_(
                select(MessageRead.message_id).where(
                    MessageRead.user_id == user.id
                )
            )
        )
    )
    unread = int(db.scalar(unread_stmt) or 0)
    def a_out(a):
        c = db.get(Customer, a.customer_id) if a and a.customer_id else None
        return None if not a else {"id": a.id, "start_at": utc_aware(a.start_at), "end_at": utc_aware(a.end_at) if a.end_at else None, "customer_name": f"{c.first_name} {c.last_name}" if c else "Termin", "address": a.address_snapshot, "status": a.status.value, "appointment_type": a.appointment_type.value}
    return {
        **stats,
        "next_appointment": a_out(next_a),
        "today_appointments": [a_out(a) for a in today_appts],
        "active_rentals": len(rentals),
        "rentals": [{"id": r.id, "product_id": r.product_id, "due_at": r.due_at, "status": r.status.value} for r in rentals],
        "unread_messages": unread,
    }
