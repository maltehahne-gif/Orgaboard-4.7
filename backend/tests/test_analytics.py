"""Tests fuer Produkt-Ranking, Trends, Zielerreichung und Teamhinweise."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.core.timeutils import local_today, month_bounds
from app.models import (
    Appointment,
    AppointmentStatus,
    Customer,
    Employee,
    FollowUp,
    FollowUpReason,
    Product,
    Role,
    Sale,
    SaleItem,
    User,
)
from app.services.analytics import (
    UEBERFAELLIGE_NACHFASS_GRENZE,
    employee_goal_progress,
    previous_period,
    product_ranking,
    team_alerts,
    trend,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


def make_employee(db, name="Test Mitarbeiter", target=30):
    user = User(
        email=f"{name.replace(' ', '.').lower()}@example.com",
        full_name=name, password_hash="hash", role=Role.EMPLOYEE,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    e = Employee(user_id=user.id, display_name=name, monthly_units_target=target)
    db.add(e)
    db.flush()
    return e


def make_sale(db, employee, customer, product, quantity, cents, when):
    s = Sale(customer_id=customer.id, employee_id=employee.id, sold_at=when)
    db.add(s)
    db.flush()
    db.add(SaleItem(sale_id=s.id, product_id=product.id,
                    product_name_snapshot=product.name,
                    quantity=quantity, unit_price_cents=cents))
    return s


def test_product_ranking_sorted_by_revenue_with_share(db):
    e = make_employee(db)
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    teuer = Product(name="Kobold VK7", category="Kobold", verified=True)
    guenstig = Product(name="Filtertüten", category="Zubehör", verified=True)
    db.add_all([teuer, guenstig])
    db.flush()

    now = datetime.now(timezone.utc)
    make_sale(db, e, c, teuer, 1, 240000, now)
    make_sale(db, e, c, guenstig, 2, 30000, now)
    db.commit()

    ms, me = month_bounds()
    ranking = product_ranking(db, ms, me, e.id)

    assert [p["name"] for p in ranking] == ["Kobold VK7", "Filtertüten"]
    assert ranking[0]["revenue_cents"] == 240000
    assert ranking[1]["revenue_cents"] == 60000
    # 240000 von 300000
    assert ranking[0]["share_percent"] == 80.0
    assert sum(p["share_percent"] for p in ranking) == pytest.approx(100.0, abs=0.2)


def test_product_ranking_groups_by_name_snapshot(db):
    """Verkaeufe bleiben zaehlbar, auch wenn das Produkt spaeter wegfaellt.

    Deshalb wird ueber den Namensschnappschuss gruppiert, nicht ueber die
    Produkt-ID.
    """
    e = make_employee(db)
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    p = Product(name="Kobold VK7", category="Kobold", verified=True)
    db.add(p)
    db.flush()

    now = datetime.now(timezone.utc)
    make_sale(db, e, c, p, 1, 100000, now)
    make_sale(db, e, c, p, 1, 100000, now)
    db.commit()

    ms, me = month_bounds()
    ranking = product_ranking(db, ms, me, e.id)
    assert len(ranking) == 1
    assert ranking[0]["quantity"] == 2
    assert ranking[0]["revenue_cents"] == 200000


def test_trend_returns_none_without_previous_value(db):
    """Ohne Vorwert gibt es keine sinnvolle Prozentangabe."""
    e = make_employee(db)
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    p = Product(name="VK7", verified=True)
    db.add(p)
    db.flush()
    make_sale(db, e, c, p, 1, 100000, datetime.now(timezone.utc))
    db.commit()

    ms, me = month_bounds()
    t = trend(db, ms, me, e.id)

    assert t["revenue_cents"] == 100000
    assert t["revenue_previous_cents"] == 0
    # Kein "+100 %" oder unendlich, sondern schlicht keine Angabe.
    assert t["revenue_change_percent"] is None


def test_trend_computes_change_against_previous_period(db):
    e = make_employee(db)
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    p = Product(name="VK7", verified=True)
    db.add(p)
    db.flush()

    ms, me = month_bounds()
    vor_start, _ = previous_period(ms, me)

    make_sale(db, e, c, p, 1, 200000, ms + timedelta(days=1))
    make_sale(db, e, c, p, 1, 100000, vor_start + timedelta(days=1))
    db.commit()

    t = trend(db, ms, me, e.id)
    assert t["revenue_cents"] == 200000
    assert t["revenue_previous_cents"] == 100000
    assert t["revenue_change_percent"] == 100.0


def test_employee_goal_progress(db):
    e = make_employee(db, "Ziel Person", target=10)
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    p = Product(name="VK7 + PB7", verified=True)  # zwei Einheiten je Stueck
    db.add(p)
    db.flush()
    make_sale(db, e, c, p, 2, 100000, datetime.now(timezone.utc))
    db.commit()

    zeilen = employee_goal_progress(db)
    zeile = next(z for z in zeilen if z["employee_id"] == e.id)

    assert zeile["units_month"] == 4          # 2 Stueck x 2 Einheiten
    assert zeile["units_target"] == 10
    assert zeile["units_missing"] == 6
    assert zeile["percent"] == 40.0


def test_alert_when_employee_has_no_appointments_this_week(db):
    make_employee(db, "Ohne Termine")
    db.commit()

    hinweise = team_alerts(db)
    arten = {h["kind"] for h in hinweise}
    assert "no_appointments" in arten


def test_alert_for_piled_up_follow_ups(db):
    e = make_employee(db, "Viel Offen")
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    db.flush()
    heute = local_today()

    for i in range(UEBERFAELLIGE_NACHFASS_GRENZE):
        db.add(FollowUp(customer_id=c.id, employee_id=e.id,
                        due_on=heute - timedelta(days=i + 1),
                        reason=FollowUpReason.MANUAL))
    db.commit()

    hinweise = team_alerts(db)
    treffer = [h for h in hinweise if h["kind"] == "overdue_followups"]
    assert treffer, "Liegengebliebene Nachfassaktionen muessen gemeldet werden"
    assert treffer[0]["value"] == UEBERFAELLIGE_NACHFASS_GRENZE


def test_alerts_are_sorted_critical_first(db):
    """Kritisches zuerst - sonst geht es in der Liste unter."""
    e = make_employee(db, "Einbruch")
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    p = Product(name="VK7", verified=True)
    db.add(p)
    db.flush()

    ms, me = month_bounds()
    vor_start, _ = previous_period(ms, me)
    # Vormonat stark, aktueller Monat schwach.
    make_sale(db, e, c, p, 1, 500000, vor_start + timedelta(days=1))
    make_sale(db, e, c, p, 1, 50000, ms + timedelta(days=1))
    db.commit()

    hinweise = team_alerts(db)
    assert hinweise, "Ein Einbruch von 90 % muss auffallen"
    assert hinweise[0]["severity"] == "critical"
    assert hinweise[0]["kind"] == "revenue_drop"


def test_alert_needs_minimum_appointments_for_close_rate(db):
    """Eine Quote aus einem einzigen Termin ist keine Aussage."""
    stark = make_employee(db, "Stark")
    schwach = make_employee(db, "Schwach")
    for e in (stark, schwach):
        c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
        db.add(c)
    db.flush()

    now = datetime.now(timezone.utc)
    # Schwach hat genau einen erfolglosen Termin - zu wenig fuer einen Hinweis.
    db.add(Appointment(employee_id=schwach.id, start_at=now,
                       status=AppointmentStatus.COMPLETED, outcome="none"))
    db.commit()

    hinweise = team_alerts(db)
    assert not [h for h in hinweise if h["kind"] == "low_close_rate"]


def test_repeated_alerts_are_grouped(db):
    """Acht gleich lautende Zeilen verdecken das, was heraussticht."""
    from app.services.analytics import GRUPPIEREN_AB

    for i in range(GRUPPIEREN_AB + 2):
        make_employee(db, f"Ohne Termine {i}")
    db.commit()

    hinweise = team_alerts(db)
    ohne_termine = [h for h in hinweise if h["kind"] == "no_appointments"]

    assert len(ohne_termine) == 1, "gleichartige Hinweise gehoeren zusammengefasst"
    assert ohne_termine[0]["grouped"] is True
    assert ohne_termine[0]["value"] == GRUPPIEREN_AB + 2
    # Die Namen muessen erhalten bleiben, sonst ist der Hinweis nicht nutzbar.
    assert len(ohne_termine[0]["employees"]) == GRUPPIEREN_AB + 2


def test_single_alert_is_not_grouped(db):
    """Ein Einzelfall bleibt ein Einzelfall - mit Namen im Titel."""
    make_employee(db, "Alleine")
    db.commit()

    hinweise = team_alerts(db)
    treffer = [h for h in hinweise if h["kind"] == "no_appointments"]
    assert len(treffer) == 1
    assert not treffer[0].get("grouped")
    assert treffer[0]["employee"] == "Alleine"
