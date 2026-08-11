from datetime import date, datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.timeutils import day_bounds, local_today, month_bounds, week_bounds
from app.models import Employee, Sale, SaleChannel, SaleItem, WeeklyStatistic


def revenue_between(db: Session, start: datetime, end: datetime, employee_id: str | None = None, channel: SaleChannel | None = None) -> int:
    stmt = (
        select(func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_price_cents), 0))
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.sold_at >= start, Sale.sold_at < end)
    )
    if employee_id:
        stmt = stmt.where(Sale.employee_id == employee_id)
    if channel:
        stmt = stmt.where(Sale.channel == channel)
    return int(db.scalar(stmt) or 0)


def units_between(db: Session, start: datetime, end: datetime, employee_id: str | None = None) -> int:
    stmt = (
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.sold_at >= start, Sale.sold_at < end)
    )
    if employee_id:
        stmt = stmt.where(Sale.employee_id == employee_id)
    return int(db.scalar(stmt) or 0)


def dashboard_stats(db: Session, employee_id: str | None = None) -> dict:
    today = local_today()
    ds, de = day_bounds(today)
    ws, we = week_bounds(today)
    ms, me = month_bounds(today)
    revenue_today = revenue_between(db, ds, de, employee_id)
    revenue_week = revenue_between(db, ws, we, employee_id)
    revenue_month = revenue_between(db, ms, me, employee_id)
    units_week = units_between(db, ws, we, employee_id)
    target = 30
    if employee_id:
        employee = db.get(Employee, employee_id)
        if employee:
            target = employee.weekly_units_target
    missing = max(target - units_week, 0)
    pct = round((units_week / target * 100), 1) if target else 0
    return {
        "revenue_today_cents": revenue_today,
        "revenue_week_cents": revenue_week,
        "revenue_month_cents": revenue_month,
        "units_week": units_week,
        "units_target": target,
        "units_missing": missing,
        "units_percent": pct,
    }


def refresh_weekly_stat(db: Session, employee_id: str, day: date | None = None):
    ws, we = week_bounds(day)
    week_start = ws.date()
    revenue = revenue_between(db, ws, we, employee_id)
    units = units_between(db, ws, we, employee_id)
    row = db.scalar(select(WeeklyStatistic).where(WeeklyStatistic.employee_id == employee_id, WeeklyStatistic.week_start == week_start))
    if not row:
        row = WeeklyStatistic(employee_id=employee_id, week_start=week_start)
        db.add(row)
    row.revenue_cents = revenue
    row.units = units
    row.calculated_at = datetime.now(timezone.utc)
