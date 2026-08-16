"""Forecast: reicht das Tempo fuer das Monatsziel - fuer einen Mitarbeiter,
ein Team, einen Bezirk, eine Region oder das ganze Unternehmen.

Rechnet nichts neu: Einheitenziel und -stand kommen aus
employee_goal_progress() (Block 3/4), Umsatz aus revenue_between(), die
Arbeitstage-Zaehlung aus der bestehenden _arbeitstage() in briefing.py.
Alle Zahlen sind deterministisch aus vorhandenen Daten abgeleitet - kein
Wert wird geschaetzt, den niemand konfiguriert hat. Ein Umsatzziel gibt es
deshalb nur, wenn mindestens ein Mitarbeiter im Ausschnitt ein
Tagesumsatz-Ziel hinterlegt hat (Employee.daily_total_target_cents,
dasselbe Feld, das auch die Buntewoche als Tagesziel zeigt).
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.timeutils import local_today, month_bounds
from app.models import Employee
from app.services.analytics import employee_goal_progress
from app.services.briefing import _arbeitstage as arbeitstage
from app.services.stats import EmployeeScope, as_employee_ids, employee_filter, revenue_between

# Schwellen fuer die Ampel: bezogen auf den prognostizierten Monatsabschluss
# gegen das Einheitenziel. Ueber der gruenen Schwelle wird das Ziel beim
# aktuellen Tempo erreicht oder uebertroffen, darunter bis zur gelben
# Schwelle gilt es als gefaehrdet, darunter als voraussichtlich verfehlt.
AMPEL_GRUEN_AB = 1.0
AMPEL_GELB_AB = 0.9


def _status(target: int, projected: float) -> str:
    if target <= 0:
        return "green"
    ratio = projected / target
    if ratio >= AMPEL_GRUEN_AB:
        return "green"
    if ratio >= AMPEL_GELB_AB:
        return "yellow"
    return "red"


def _revenue_target_cents(db: Session, employee_id: EmployeeScope, working_days_total: int) -> int | None:
    """Monatsumsatzziel aus den hinterlegten Tagesumsatz-Zielen.

    None, wenn niemand im Ausschnitt ein Tagesziel hinterlegt hat - dann
    gibt es nichts, wovon ein fehlender Betrag ehrlich abgeleitet werden
    koennte.
    """
    stmt = select(Employee.daily_total_target_cents)
    empfilter = employee_filter(Employee.id, employee_id)
    if empfilter is not None:
        stmt = stmt.where(empfilter)
    werte = [v for v in db.scalars(stmt).all() if v]
    if not werte:
        return None
    return sum(werte) * working_days_total


def forecast(db: Session, employee_id: EmployeeScope = None, day: date | None = None) -> dict:
    heute = day or local_today()
    monatsanfang = month_bounds(heute)[0].date()
    monatsende = month_bounds(heute)[1].date() - timedelta(days=1)

    working_days_total = arbeitstage(monatsanfang, monatsende)
    working_days_elapsed = arbeitstage(monatsanfang, heute)
    working_days_left = arbeitstage(heute, monatsende)

    goal_ids = as_employee_ids(employee_id)
    goals = employee_goal_progress(db, day=heute, employee_ids=goal_ids)
    units_target = sum(g["units_target"] for g in goals)
    units_achieved = sum(g["units_month"] for g in goals)
    units_missing = max(units_target - units_achieved, 0)

    units_per_day_rate = (units_achieved / working_days_elapsed) if working_days_elapsed else 0.0
    units_projected = round(units_achieved + units_per_day_rate * working_days_left, 1)
    units_needed_per_day = round(units_missing / working_days_left, 1) if working_days_left and units_missing else 0.0

    ms, me = month_bounds(heute)
    revenue_achieved = revenue_between(db, ms, me, employee_id)
    revenue_per_day_rate = (revenue_achieved / working_days_elapsed) if working_days_elapsed else 0.0
    revenue_projected = round(revenue_achieved + revenue_per_day_rate * working_days_left)

    revenue_target = _revenue_target_cents(db, employee_id, working_days_total)
    if revenue_target is not None:
        revenue_missing = max(revenue_target - revenue_achieved, 0)
        revenue_needed_per_day = (
            round(revenue_missing / working_days_left) if working_days_left and revenue_missing else 0
        )
    else:
        revenue_missing = None
        revenue_needed_per_day = None

    return {
        "as_of": heute,
        "employee_count": len(goals),
        "working_days_total": working_days_total,
        "working_days_elapsed": working_days_elapsed,
        "working_days_left": working_days_left,
        "units_target": units_target,
        "units_achieved": units_achieved,
        "units_missing": units_missing,
        "units_needed_per_day": units_needed_per_day,
        "units_projected_month_end": units_projected,
        "revenue_target_cents": revenue_target,
        "revenue_achieved_cents": revenue_achieved,
        "revenue_missing_cents": revenue_missing,
        "revenue_needed_per_day_cents": revenue_needed_per_day,
        "revenue_projected_month_end_cents": revenue_projected,
        "status": _status(units_target, units_projected),
    }
