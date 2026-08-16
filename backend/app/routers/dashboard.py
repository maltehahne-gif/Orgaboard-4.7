from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session
from app.core.benutzerscope import ohne_verborgene
from app.core.database import get_db
from app.core.rbac import require_team_leader, scoped_employee_id
from app.core.security import get_current_user
from app.core.timeutils import day_bounds, local_today, period_bounds, utc_aware
from app.models import Appointment, AppointmentStatus, Customer, FollowUp, FollowUpStatus, Message, MessageHidden, MessageRead, Rental, RentalStatus, User
from app.services.forecast import forecast
from app.services.orgscope import resolve_management_scope
from app.services.stats import as_employee_ids, dashboard_stats, employee_filter, revenue_between, sales_count_between, units_between
from app.services.analytics import (
    employee_goal_progress,
    offer_kpis,
    product_ranking,
    team_alerts,
    trend,
)
from app.services.timeline import appointment_kpis, funnel_overview

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _hierarchy_scope(
    db: Session, user: User,
    employee_id: str | None, team_id: str | None, district_id: str | None, region_id: str | None,
):
    return resolve_management_scope(db, user, employee_id, team_id, district_id, region_id)


@router.get("/funnel")
def funnel(
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verkaufstrichter mit Stufenbesetzung und Umwandlungsquoten."""
    scope = _hierarchy_scope(db, user, employee_id, team_id, district_id, region_id)
    return funnel_overview(db, scope)


@router.get("/kpis")
def kpis(
    period: str = "month",
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Terminbezogene Kennzahlen: durchgeführte Termine, Abschlussquote,
    Umsatz pro Termin, Vorführungen."""
    scope = _hierarchy_scope(db, user, employee_id, team_id, district_id, region_id)
    start, end = period_bounds(period)
    return {"period": period, **appointment_kpis(db, start, end, scope)}


@router.get("/trend")
def trend_view(
    period: str = "month",
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Umsatz und Einheiten im Vergleich zum gleich langen Zeitraum davor."""
    scope = _hierarchy_scope(db, user, employee_id, team_id, district_id, region_id)
    start, end = period_bounds(period)
    return {"period": period, **trend(db, start, end, scope)}


@router.get("/products")
def product_ranking_view(
    period: str = "month",
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Meistverkaufte Produkte im Zeitraum."""
    scope = _hierarchy_scope(db, user, employee_id, team_id, district_id, region_id)
    start, end = period_bounds(period)
    return {"period": period, "products": product_ranking(db, start, end, scope)}


@router.get("/team-overview")
def team_overview(
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zielerreichung je Mitarbeiter und Hinweise auf auffällige Entwicklungen."""
    require_team_leader(user)
    scope = as_employee_ids(resolve_management_scope(db, user, None, team_id, district_id, region_id))
    # Beide Listen nennen einzelne Personen beim Namen - also gilt dieselbe
    # Sichtbarkeit wie in jeder anderen Benutzerliste.
    return {
        "employees": ohne_verborgene(db, user, employee_goal_progress(db, employee_ids=scope)),
        "alerts": ohne_verborgene(db, user, team_alerts(db, employee_ids=scope)),
    }


@router.get("/cockpit")
def cockpit(
    period: str = "month",
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Management-Cockpit: alle Führungskennzahlen für einen Ausschnitt (ein
    Mitarbeiter, ein Team, ein Bezirk, eine Region oder das ganze
    Unternehmen) in einer Antwort.

    Rechnet nichts neu, sondern ruft dieselben Bausteine wie /dashboard/kpis,
    /trend, /products, /funnel und /team-overview auf - mit derselben
    employee_filter()-Logik, damit ein Team-Cockpit und eine
    Einzelmitarbeiter-Auswertung für denselben Ausschnitt nie unterschiedliche
    Zahlen zeigen.
    """
    require_team_leader(user)
    scope = _hierarchy_scope(db, user, employee_id, team_id, district_id, region_id)
    start, end = period_bounds(period)

    revenue_cents = revenue_between(db, start, end, scope)
    units = units_between(db, start, end, scope)
    sales_count = sales_count_between(db, start, end, scope)
    appt = appointment_kpis(db, start, end, scope)
    offers = offer_kpis(db, start, end, scope)

    goal_ids = as_employee_ids(scope)
    goals = ohne_verborgene(db, user, employee_goal_progress(db, employee_ids=goal_ids))
    units_target = sum(g["units_target"] for g in goals)
    units_month = sum(g["units_month"] for g in goals)

    follow_up_stmt = select(func.count(FollowUp.id)).where(FollowUp.status == FollowUpStatus.OPEN)
    follow_up_filter = employee_filter(FollowUp.employee_id, scope)
    if follow_up_filter is not None:
        follow_up_stmt = follow_up_stmt.where(follow_up_filter)
    open_follow_ups = int(db.scalar(follow_up_stmt) or 0)

    overdue_stmt = follow_up_stmt.where(FollowUp.due_on < local_today())
    overdue_follow_ups = int(db.scalar(overdue_stmt) or 0)

    return {
        "period": period,
        "employee_count": len(goals),
        "revenue_cents": revenue_cents,
        "units": units,
        "sales_count": sales_count,
        "revenue_per_sale_cents": round(revenue_cents / sales_count) if sales_count else 0,
        "appointments_total": appt["appointments_total"],
        "appointments_done": appt["appointments_done"],
        "presentations": appt["presentations"],
        "close_rate_percent": appt["close_rate_percent"],
        "revenue_per_appointment_cents": appt["revenue_per_appointment_cents"],
        "offers_created": offers["created"],
        "offers_converted": offers["converted"],
        "offers_conversion_rate_percent": offers["conversion_rate_percent"],
        "offers_total_value_cents": offers["total_value_cents"],
        "goal_units_target": units_target,
        "goal_units_achieved": units_month,
        "goal_percent": round(units_month / units_target * 100, 1) if units_target else 0.0,
        "open_follow_ups": open_follow_ups,
        "overdue_follow_ups": overdue_follow_ups,
        "products": product_ranking(db, start, end, scope, limit=5),
        "funnel": funnel_overview(db, scope),
        "alerts": ohne_verborgene(db, user, team_alerts(db, employee_ids=goal_ids)),
    }


@router.get("/forecast")
def forecast_view(
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zielprognose fuer den laufenden Monat: Stand, Restbedarf,
    voraussichtlicher Monatsabschluss und Ampelstatus - fuer einen
    Mitarbeiter, ein Team, einen Bezirk, eine Region oder alle.

    Jeder Mitarbeiter darf seine eigene Prognose sehen (wie beim
    persoenlichen Dashboard); Team/Bezirk/Region-Filter bleiben Teamleitern
    und darueber vorbehalten - dieselbe Grenze wie ueberall sonst.
    """
    scope = _hierarchy_scope(db, user, employee_id, team_id, district_id, region_id)
    return forecast(db, scope)


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
