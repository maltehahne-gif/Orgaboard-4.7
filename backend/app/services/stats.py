import re
from datetime import date, datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.timeutils import day_bounds, local_today, month_bounds, week_bounds
from app.models import Employee, Product, Sale, SaleChannel, SaleItem, WeeklyStatistic


K70_CATEGORY = "k70"


def not_cancelled():
    """Bedingung fuer "zaehlt in Auswertungen".

    An einer Stelle, weil sie an elf Stellen gebraucht wird. Liefe sie
    auseinander, wuerden Dashboard, Buntewoche und Verkaufsliste
    unterschiedliche Umsaetze zeigen - und niemand wuesste, welcher stimmt.
    """
    return Sale.cancelled_at.is_(None)


EmployeeScope = str | list[str] | None


def employee_filter(column, employee_id: EmployeeScope):
    """where()-Bedingung fuer einen einzelnen Mitarbeiter oder eine Gruppe.

    Dieselbe Stelle fuer Umsatz, Einheiten, Termine, Produktmix und Angebote -
    sonst rechnet eine Team- oder Regionsauswertung frueher oder spaeter mit
    einer anderen Grundgesamtheit als eine Einzelauswertung, und zwei Zahlen
    fuer denselben Ausschnitt laufen auseinander.

    None heisst "kein Ausschnitt, alle zaehlen mit". Eine - auch leere -
    Liste ist dagegen ein bereits aufgeloester Ausschnitt (z. B. ein Team
    ohne Mitglieder): die leere Liste muss dann niemanden treffen, nicht
    stillschweigend auf "alle" zurueckfallen.
    """
    if employee_id is None:
        return None
    if isinstance(employee_id, (list, tuple, set)):
        return column.in_(list(employee_id))
    return column == employee_id


def as_employee_ids(employee_id: EmployeeScope) -> list[str] | None:
    """Normiert einen EmployeeScope auf das, was employee_goal_progress()
    und team_alerts() erwarten: eine Liste oder None, nie eine einzelne
    Zeichenkette. scoped_employee_id() liefert bei einem einzelnen
    Mitarbeiter genau diese Zeichenkette zurueck."""
    if employee_id is None:
        return None
    return [employee_id] if isinstance(employee_id, str) else list(employee_id)


def is_k70_category(category: str | None) -> bool:
    return (category or "").strip().casefold() == K70_CATEGORY


def revenue_between(
    db: Session,
    start: datetime,
    end: datetime,
    employee_id: EmployeeScope = None,
    channel: SaleChannel | None = None,
    product_category: str | None = None,
) -> int:
    stmt = (
        select(func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_price_cents), 0))
        .select_from(SaleItem)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.sold_at >= start, Sale.sold_at < end, not_cancelled())
    )
    empfilter = employee_filter(Sale.employee_id, employee_id)
    if empfilter is not None:
        stmt = stmt.where(empfilter)
    if channel:
        stmt = stmt.where(Sale.channel == channel)
    if product_category:
        stmt = stmt.join(Product, Product.id == SaleItem.product_id).where(
            func.lower(func.trim(Product.category)) == product_category.strip().casefold()
        )
    return int(db.scalar(stmt) or 0)


def product_unit_count_from_name(name: str | None) -> int:
    """
    Ermittelt automatisch, wie viele eigenständige Geräte/
    Produktkomponenten in einem Katalogprodukt enthalten sind.

    Beispiele:
    VK7 + PB7 + EB7 -> 3
    VK7 inkl. EB7   -> 2
    VR7 + RB7       -> 2
    SP7             -> 1

    Verpackungsgrößen wie "12 Stück Filtertüten" werden NICHT
    als 12 Einheiten gerechnet, da nur Modellbezeichnungen zählen.
    """

    if not name:
        return 1

    codes = {
        match.upper()
        for match in re.findall(
            r"(?<![A-Za-z0-9])"
            r"([A-Za-z]{1,4}\d{1,4}\+?)"
            r"(?![A-Za-z0-9])",
            name,
        )
    }

    return max(len(codes), 1)


def units_between(
    db: Session,
    start: datetime,
    end: datetime,
    employee_id: EmployeeScope = None,
) -> int:

    stmt = (
        select(
            SaleItem.quantity,
            Product.name,
            Product.category,
        )
        .select_from(SaleItem)
        .join(
            Sale,
            Sale.id == SaleItem.sale_id,
        )
        .outerjoin(
            Product,
            Product.id == SaleItem.product_id,
        )
        .where(
            Sale.sold_at >= start,
            Sale.sold_at < end,
            not_cancelled(),
        )
    )

    empfilter = employee_filter(Sale.employee_id, employee_id)
    if empfilter is not None:
        stmt = stmt.where(empfilter)

    rows = db.execute(stmt).all()

    total = 0

    for quantity, product_name, product_category in rows:

        if is_k70_category(product_category):
            continue

        quantity = int(quantity or 0)

        unit_factor = (
            product_unit_count_from_name(
                product_name
            )
        )

        total += quantity * unit_factor

    return total


def sales_count_between(
    db: Session,
    start: datetime,
    end: datetime,
    employee_id: EmployeeScope = None,
) -> int:
    """Anzahl der (nicht stornierten) Verkaufsvorgaenge im Zeitraum.

    Getrennt von revenue_between/units_between: dort zaehlen Positionen,
    hier zaehlt der Verkauf als Ganzes - fuer "Umsatz pro Verkauf" braucht
    es beide Zahlen unabhaengig voneinander.
    """
    stmt = select(func.count(Sale.id)).where(Sale.sold_at >= start, Sale.sold_at < end, not_cancelled())
    empfilter = employee_filter(Sale.employee_id, employee_id)
    if empfilter is not None:
        stmt = stmt.where(empfilter)
    return int(db.scalar(stmt) or 0)


def dashboard_stats(db: Session, employee_id: str | None = None) -> dict:
    today = local_today()
    ds, de = day_bounds(today)
    ws, we = week_bounds(today)
    ms, me = month_bounds(today)
    revenue_today = revenue_between(db, ds, de, employee_id)
    revenue_week = revenue_between(db, ws, we, employee_id)
    revenue_month = revenue_between(db, ms, me, employee_id)
    k70_revenue_today = revenue_between(db, ds, de, employee_id, product_category=K70_CATEGORY)
    k70_revenue_week = revenue_between(db, ws, we, employee_id, product_category=K70_CATEGORY)
    k70_revenue_month = revenue_between(db, ms, me, employee_id, product_category=K70_CATEGORY)
    units_week = units_between(db, ws, we, employee_id)
    units_month = units_between(db, ms, me, employee_id)
    target = 30
    if employee_id:
        employee = db.get(Employee, employee_id)
        if employee:
            target = employee.monthly_units_target
    missing = max(target - units_month, 0)
    pct = round((units_month / target * 100), 1) if target else 0
    return {
        "revenue_today_cents": revenue_today,
        "revenue_week_cents": revenue_week,
        "revenue_month_cents": revenue_month,
        "k70_revenue_today_cents": k70_revenue_today,
        "k70_revenue_week_cents": k70_revenue_week,
        "k70_revenue_month_cents": k70_revenue_month,
        "units_week": units_week,
        "units_month": units_month,
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
