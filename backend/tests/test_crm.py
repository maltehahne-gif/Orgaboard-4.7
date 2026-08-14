"""Tests fuer Kunden-Timeline, Wiedervorlagen und Verkaufstrichter."""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.core.timeutils import local_today
from app.models import (
    Appointment,
    AppointmentStatus,
    Customer,
    CustomerNote,
    Employee,
    FollowUp,
    FollowUpReason,
    FollowUpStatus,
    FunnelStage,
    Product,
    ProductPresentation,
    Rental,
    Role,
    Sale,
    SaleItem,
    User,
)
from app.services.timeline import (
    appointment_kpis,
    customer_timeline,
    funnel_overview,
    funnel_stage,
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


def make_employee(db, name="Test Mitarbeiter"):
    user = User(
        email=f"{name.replace(' ', '.').lower()}@example.com",
        full_name=name,
        password_hash="hash",
        role=Role.EMPLOYEE,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    employee = Employee(user_id=user.id, display_name=name, monthly_units_target=30)
    db.add(employee)
    db.flush()
    return employee


def make_customer(db, employee, last_name="Muster"):
    c = Customer(employee_id=employee.id, first_name="Max", last_name=last_name)
    db.add(c)
    db.flush()
    return c


def test_timeline_merges_all_event_types_newest_first(db):
    e = make_employee(db)
    c = make_customer(db, e)
    p = Product(name="VK7", verified=True)
    db.add(p)
    db.flush()

    base = datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc)

    db.add(Appointment(customer_id=c.id, employee_id=e.id, start_at=base))
    db.add(
        ProductPresentation(
            customer_id=c.id, employee_id=e.id, product_id=p.id,
            presented_at=base + timedelta(days=1),
        )
    )
    sale = Sale(customer_id=c.id, employee_id=e.id, sold_at=base + timedelta(days=2))
    db.add(sale)
    db.flush()
    db.add(
        SaleItem(
            sale_id=sale.id, product_id=p.id, product_name_snapshot=p.name,
            quantity=1, unit_price_cents=249900,
        )
    )
    db.add(
        Rental(
            product_id=p.id, customer_id=c.id, employee_id=e.id,
            issued_at=base + timedelta(days=3),
        )
    )
    db.add(
        CustomerNote(
            customer_id=c.id, employee_id=e.id, body="Ruft nächste Woche zurück",
            created_at=base + timedelta(days=4),
        )
    )
    db.commit()

    events = customer_timeline(db, c.id)
    kinds = [ev["kind"] for ev in events]

    assert set(kinds) == {"appointment", "presentation", "sale", "rental", "note"}

    # Neueste zuerst - sonst liest sich die Historie verkehrt herum.
    zeiten = [ev["at"] for ev in events]
    assert zeiten == sorted(zeiten, reverse=True)

    verkauf = next(ev for ev in events if ev["kind"] == "sale")
    assert "2.499,00" in verkauf["title"]


def test_funnel_stage_derives_from_events(db):
    e = make_employee(db)

    # Nur angelegt: Kontakt
    kontakt = make_customer(db, e, "Kontakt")
    db.commit()
    assert funnel_stage(db, kontakt.id) == FunnelStage.CONTACT

    # Termin geplant
    geplant = make_customer(db, e, "Geplant")
    db.add(
        Appointment(
            customer_id=geplant.id, employee_id=e.id,
            start_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    assert funnel_stage(db, geplant.id) == FunnelStage.APPOINTMENT_SET

    # Termin durchgefuehrt
    fertig = make_customer(db, e, "Fertig")
    db.add(
        Appointment(
            customer_id=fertig.id, employee_id=e.id,
            start_at=datetime.now(timezone.utc),
            status=AppointmentStatus.COMPLETED,
        )
    )
    db.commit()
    assert funnel_stage(db, fertig.id) == FunnelStage.APPOINTMENT_DONE

    # Verkauft
    gekauft = make_customer(db, e, "Gekauft")
    db.add(Sale(customer_id=gekauft.id, employee_id=e.id, sold_at=datetime.now(timezone.utc)))
    db.commit()
    assert funnel_stage(db, gekauft.id) == FunnelStage.SALE


def test_funnel_stage_is_not_stored_and_follows_deletions(db):
    """Die Stufe wird abgeleitet, nicht gespeichert.

    Wird ein Verkauf geloescht, muss der Kunde zurueckfallen - genau deshalb
    liegt die Stufe nicht als Feld am Kunden.
    """
    e = make_employee(db)
    c = make_customer(db, e)
    sale = Sale(customer_id=c.id, employee_id=e.id, sold_at=datetime.now(timezone.utc))
    db.add(sale)
    db.commit()
    assert funnel_stage(db, c.id) == FunnelStage.SALE

    db.delete(sale)
    db.commit()
    assert funnel_stage(db, c.id) == FunnelStage.CONTACT


def test_funnel_overview_counts_and_close_rate(db):
    e = make_employee(db)
    for i in range(4):
        make_customer(db, e, f"Kontakt{i}")
    verkauft = make_customer(db, e, "Kaeufer")
    db.add(Sale(customer_id=verkauft.id, employee_id=e.id, sold_at=datetime.now(timezone.utc)))
    db.commit()

    overview = funnel_overview(db, e.id)
    assert overview["total_customers"] == 5
    # Einer von fuenf hat gekauft
    assert overview["close_rate_percent"] == 20.0

    stufen = {s["stage"]: s for s in overview["stages"]}
    assert stufen["contact"]["current"] == 4
    assert stufen["sale"]["current"] == 1


def test_appointment_kpis(db):
    e = make_employee(db)
    c = make_customer(db, e)
    p = Product(name="VK7", verified=True)
    db.add(p)
    db.flush()

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=1)
    end = now + timedelta(days=1)

    # Zwei durchgefuehrt, davon einer mit Verkauf; einer nur geplant.
    db.add(Appointment(customer_id=c.id, employee_id=e.id, start_at=now,
                       status=AppointmentStatus.COMPLETED, outcome="sale"))
    db.add(Appointment(customer_id=c.id, employee_id=e.id, start_at=now,
                       status=AppointmentStatus.COMPLETED, outcome="none"))
    db.add(Appointment(customer_id=c.id, employee_id=e.id, start_at=now))

    sale = Sale(customer_id=c.id, employee_id=e.id, sold_at=now)
    db.add(sale)
    db.flush()
    db.add(SaleItem(sale_id=sale.id, product_id=p.id, product_name_snapshot=p.name,
                    quantity=1, unit_price_cents=200000))
    db.commit()

    kpis = appointment_kpis(db, start, end, e.id)
    assert kpis["appointments_total"] == 3
    assert kpis["appointments_done"] == 2
    assert kpis["appointments_with_sale"] == 1
    assert kpis["close_rate_percent"] == 50.0
    # 2000,00 EUR auf zwei durchgefuehrte Termine
    assert kpis["revenue_per_appointment_cents"] == 100000


def test_follow_up_overdue_and_today_are_distinguished(db):
    """Ueberfaellig und heute faellig muessen getrennt zaehlbar sein."""
    from app.routers.followups import serialize

    e = make_employee(db)
    c = make_customer(db, e)
    heute = local_today()

    ueberfaellig = FollowUp(customer_id=c.id, employee_id=e.id,
                            due_on=heute - timedelta(days=3),
                            reason=FollowUpReason.NO_RESULT)
    heute_faellig = FollowUp(customer_id=c.id, employee_id=e.id, due_on=heute,
                             reason=FollowUpReason.AFTER_SALE)
    spaeter = FollowUp(customer_id=c.id, employee_id=e.id,
                       due_on=heute + timedelta(days=5),
                       reason=FollowUpReason.MANUAL)
    db.add_all([ueberfaellig, heute_faellig, spaeter])
    db.commit()

    a = serialize(db, ueberfaellig)
    assert a["is_overdue"] is True
    assert a["is_due_today"] is False
    assert a["days_overdue"] == 3

    b = serialize(db, heute_faellig)
    assert b["is_due_today"] is True
    assert b["is_overdue"] is False

    c_ = serialize(db, spaeter)
    assert c_["is_overdue"] is False
    assert c_["is_due_today"] is False


def test_completed_follow_up_is_no_longer_overdue(db):
    from app.routers.followups import serialize

    e = make_employee(db)
    c = make_customer(db, e)
    f = FollowUp(
        customer_id=c.id, employee_id=e.id,
        due_on=local_today() - timedelta(days=10),
        reason=FollowUpReason.MANUAL,
        status=FollowUpStatus.DONE,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(f)
    db.commit()

    out = serialize(db, f)
    assert out["is_overdue"] is False
    assert out["status"] == "done"
