from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user
from app.core.timeutils import day_bounds, local_today
from app.models import Appointment, AppointmentStatus, Customer, Message, Rental, RentalStatus, User
from app.services.stats import dashboard_stats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stats = dashboard_stats(db, scope)
    now = datetime.now(timezone.utc)
    ds, de = day_bounds(now.date())
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
    unread = db.query(Message).filter(Message.recipient_user_id == user.id, Message.read_at.is_(None)).count()
    def a_out(a):
        c = db.get(Customer, a.customer_id) if a and a.customer_id else None
        return None if not a else {"id": a.id, "start_at": a.start_at, "end_at": a.end_at, "customer_name": f"{c.first_name} {c.last_name}" if c else "Termin", "address": a.address_snapshot, "status": a.status.value, "appointment_type": a.appointment_type.value}
    return {
        **stats,
        "next_appointment": a_out(next_a),
        "today_appointments": [a_out(a) for a in today_appts],
        "active_rentals": len(rentals),
        "rentals": [{"id": r.id, "product_id": r.product_id, "due_at": r.due_at, "status": r.status.value} for r in rentals],
        "unread_messages": unread,
    }
