"""Mitarbeiter-, Team-, Bezirks- und Regionsvergleich.

Baut ausschliesslich auf den bestehenden Kennzahlfunktionen auf
(revenue_between, units_between, sales_count_between, appointment_kpis,
employee_goal_progress) - fuer jede Vergleichsebene wird nur die passende
Mitarbeitergruppe ermittelt (orgscope) und dieselbe Rechnung darauf
angewendet. Team-, Bezirks- und Regionszahlen koennen deshalb nie von einer
Einzelmitarbeiter-Auswertung fuer dieselben Personen abweichen.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import District, Employee, Region, Team
from app.services.analytics import MINDEST_TERMINE_FUER_QUOTE, employee_goal_progress
from app.services.orgscope import (
    employee_ids_in_district,
    employee_ids_in_region,
    employee_ids_in_team,
)
from app.services.stats import revenue_between, sales_count_between, units_between
from app.services.timeline import appointment_kpis


def _row(db: Session, entity_id: str, name: str, employee_ids: list[str], start: datetime, end: datetime) -> dict:
    revenue = revenue_between(db, start, end, employee_ids)
    units = units_between(db, start, end, employee_ids)
    sales_count = sales_count_between(db, start, end, employee_ids)
    appt = appointment_kpis(db, start, end, employee_ids)

    goals = employee_goal_progress(db, employee_ids=employee_ids)
    target = sum(g["units_target"] for g in goals)
    achieved = sum(g["units_month"] for g in goals)

    return {
        "id": entity_id,
        "name": name,
        "employee_count": len(employee_ids),
        "revenue_cents": revenue,
        "units": units,
        "sales_count": sales_count,
        "appointments_total": appt["appointments_total"],
        "appointments_done": appt["appointments_done"],
        "close_rate_percent": appt["close_rate_percent"],
        # Eine Quote aus zwei oder drei Terminen behauptet eine Genauigkeit,
        # die die Zahl nicht hat - die Oberflaeche soll dann warnen statt
        # eine Rangliste danach zu sortieren.
        "has_enough_data": appt["appointments_done"] >= MINDEST_TERMINE_FUER_QUOTE,
        "goal_units_target": target,
        "goal_units_achieved": achieved,
        "goal_percent": round(achieved / target * 100, 1) if target else 0.0,
    }


def employee_rows(
    db: Session, employee_ids: list[str] | None, start: datetime, end: datetime
) -> list[dict]:
    """Eine Zeile je Mitarbeiter, optional auf eine Gruppe eingegrenzt."""
    stmt = select(Employee).order_by(Employee.display_name)
    if employee_ids is not None:
        stmt = stmt.where(Employee.id.in_(employee_ids))
    return [_row(db, e.id, e.display_name, [e.id], start, end) for e in db.scalars(stmt).all()]


def team_rows(
    db: Session, start: datetime, end: datetime,
    district_id: str | None = None, region_id: str | None = None,
) -> list[dict]:
    """Eine Zeile je Team, optional auf einen Bezirk oder eine Region eingegrenzt."""
    stmt = select(Team).where(Team.is_active.is_(True)).order_by(Team.name)
    if district_id:
        stmt = stmt.where(Team.district_id == district_id)
    elif region_id:
        district_ids = db.scalars(select(District.id).where(District.region_id == region_id)).all()
        stmt = stmt.where(Team.district_id.in_(district_ids)) if district_ids else stmt.where(Team.id.in_([]))
    return [_row(db, t.id, t.name, employee_ids_in_team(db, t.id), start, end) for t in db.scalars(stmt).all()]


def district_rows(
    db: Session, start: datetime, end: datetime, region_id: str | None = None
) -> list[dict]:
    """Eine Zeile je Bezirk, optional auf eine Region eingegrenzt."""
    stmt = select(District).where(District.is_active.is_(True)).order_by(District.name)
    if region_id:
        stmt = stmt.where(District.region_id == region_id)
    return [_row(db, d.id, d.name, employee_ids_in_district(db, d.id), start, end) for d in db.scalars(stmt).all()]


def region_rows(db: Session, start: datetime, end: datetime) -> list[dict]:
    """Eine Zeile je Region."""
    stmt = select(Region).where(Region.is_active.is_(True)).order_by(Region.name)
    return [_row(db, r.id, r.name, employee_ids_in_region(db, r.id), start, end) for r in db.scalars(stmt).all()]
