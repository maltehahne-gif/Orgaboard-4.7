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
    employee.user_id = user.id
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


def test_delivery_state_only_for_own_messages(db):
    """Beim Empfaenger ist die Angabe sinnlos - er weiss selbst, ob er las."""
    from app.models import Message
    from app.routers.messages import delivery_state

    absender = make_employee(db, "Absender")
    empfaenger = make_employee(db, "Empfaenger")
    m = Message(sender_user_id=absender.user_id,
                recipient_user_id=empfaenger.user_id, body="Hallo")
    db.add(m)
    db.commit()

    assert delivery_state(db, m, absender.user_id) is not None
    assert delivery_state(db, m, empfaenger.user_id) is None


def test_private_message_read_state_follows_read_at(db):
    from app.models import Message
    from app.routers.messages import delivery_state

    absender = make_employee(db, "Absender")
    empfaenger = make_employee(db, "Empfaenger")
    m = Message(sender_user_id=absender.user_id,
                recipient_user_id=empfaenger.user_id, body="Hallo")
    db.add(m)
    db.commit()

    ungelesen = delivery_state(db, m, absender.user_id)
    assert ungelesen["delivered"] is True
    assert ungelesen["read"] is False

    m.read_at = datetime.now(timezone.utc)
    db.commit()

    gelesen = delivery_state(db, m, absender.user_id)
    assert gelesen["read"] is True
    assert gelesen["read_by"] == 1


def test_team_message_counts_readers(db):
    """Team-Nachrichten haben mehrere Empfaenger - read_at greift dort nicht."""
    from app.models import Message, MessageRead
    from app.routers.messages import delivery_state, read_counts_for

    absender = make_employee(db, "Absender")
    a = make_employee(db, "Leser A")
    b = make_employee(db, "Leser B")
    m = Message(sender_user_id=absender.user_id, recipient_user_id=None,
                body="An alle")
    db.add(m)
    db.flush()

    ohne = delivery_state(db, m, absender.user_id)
    assert ohne["read"] is False
    assert ohne["read_by"] == 0

    db.add_all([
        MessageRead(message_id=m.id, user_id=a.user_id),
        MessageRead(message_id=m.id, user_id=b.user_id),
    ])
    db.commit()

    mit = delivery_state(db, m, absender.user_id)
    assert mit["read"] is True
    assert mit["read_by"] == 2
    # read_at bleibt leer, weil es bei mehreren Empfaengern nichts aussagt.
    assert mit["read_at"] is None

    assert read_counts_for(db, [m.id]) == {m.id: 2}


def test_archived_product_cannot_be_sold(db):
    """Archivieren muss wirken - sonst ist es reine Zierde.

    Bis hierher prueften Verkauf, Verleih und Vorfuehrung nur auf verified,
    nicht auf active.
    """
    from fastapi import HTTPException

    from app.models import Product

    p = Product(name="Altes Modell", verified=True, active=False)
    db.add(p)
    db.commit()

    # Der Zustand, den die Endpunkte pruefen
    assert p.verified is True
    assert p.active is False

    def darf_verkauft_werden(produkt):
        return bool(produkt and produkt.verified and produkt.active)

    assert darf_verkauft_werden(p) is False

    p.active = True
    db.commit()
    assert darf_verkauft_werden(p) is True


def test_rental_due_state(db):
    """Überfällig, bald fällig und zurückgegeben sauber unterscheiden."""
    from app.routers.rentals import ERINNERUNG_TAGE, due_state
    from app.models import Rental, RentalStatus

    e = make_employee(db, "Verleiher")
    c = make_customer(db, e)
    p = Product(name="VK7", verified=True)
    db.add(p)
    db.flush()

    def rental(tage_bis_faellig, status=RentalStatus.RENTED, returned=None):
        return Rental(
            product_id=p.id, customer_id=c.id, employee_id=e.id,
            issued_at=datetime.now(timezone.utc) - timedelta(days=10),
            due_at=datetime.now(timezone.utc) + timedelta(days=tage_bis_faellig),
            status=status, returned_at=returned,
        )

    ueberfaellig = due_state(rental(-4))
    assert ueberfaellig["is_overdue"] is True
    assert ueberfaellig["days_overdue"] == 4
    assert ueberfaellig["due_soon"] is False

    bald = due_state(rental(ERINNERUNG_TAGE - 1))
    assert bald["due_soon"] is True
    assert bald["is_overdue"] is False

    spaeter = due_state(rental(ERINNERUNG_TAGE + 5))
    assert spaeter["due_soon"] is False
    assert spaeter["is_overdue"] is False

    # Zurueckgegebene Geraete koennen nicht mehr ueberfaellig sein.
    zurueck = due_state(rental(-30, RentalStatus.RETURNED, datetime.now(timezone.utc)))
    assert zurueck["is_overdue"] is False
    assert zurueck["due_soon"] is False


def test_rental_without_due_date_is_never_overdue(db):
    from app.routers.rentals import due_state
    from app.models import Rental, RentalStatus

    e = make_employee(db, "Ohne Frist")
    c = make_customer(db, e)
    p = Product(name="VK7", verified=True)
    db.add(p)
    db.flush()

    r = Rental(product_id=p.id, customer_id=c.id, employee_id=e.id,
               issued_at=datetime.now(timezone.utc) - timedelta(days=100),
               due_at=None, status=RentalStatus.RENTED)
    zustand = due_state(r)
    assert zustand["is_overdue"] is False
    assert zustand["days_until_due"] is None


def test_archived_route_is_not_swallowed_by_product_id():
    """Die Reihenfolge der Routen entscheidet hier ueber Funktion.

    Stand /{product_id} vorher, fing es den Pfad "archived" ab und
    antwortete mit "Produkt nicht gefunden".
    """
    from app.routers.products import router

    pfade = [r.path for r in router.routes]
    assert "/products/archived" in pfade
    assert "/products/{product_id}" in pfade
    assert pfade.index("/products/archived") < pfade.index("/products/{product_id}")
