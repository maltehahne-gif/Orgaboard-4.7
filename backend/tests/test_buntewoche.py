"""Die Buntewoche zeigt Termine als Bloecke.

Geprueft wird, was die Wochenansicht zum Zeichnen braucht: Kundenname,
Beginn und Dauer in Minuten. Ohne die Dauer koennte ein Block nicht ueber
seinen Zeitraum laufen - ein vierstuendiger Termin saehe aus wie ein
einstuendiger, und die Woche wirkte freier, als sie ist.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.core.timeutils import BUSINESS_TZ  # noqa: E402
from app.models import Appointment, AppointmentType, Customer, Employee, Role, User  # noqa: E402
from app.routers.buntewoche import GRID_STEP_MINUTES, make_payload, monday_of  # noqa: E402


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def mitarbeiter(db):
    user = User(
        email="mira@test.local",
        full_name="Mira Musterfrau",
        password_hash="hash",
        role=Role.EMPLOYEE,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    employee = Employee(user_id=user.id, display_name="Mira Musterfrau", monthly_units_target=30)
    db.add(employee)
    db.flush()
    return employee


def kunde(db, employee, vorname="Anna", nachname="Beispiel"):
    c = Customer(employee_id=employee.id, first_name=vorname, last_name=nachname)
    db.add(c)
    db.flush()
    return c


def montag():
    return monday_of(datetime.now(BUSINESS_TZ).date())


def termin(db, employee, customer, beginn_stunde, beginn_minute=0, dauer_minuten=60):
    # Gespeichert wird wie im echten Betrieb in UTC; die Ortszeit ist die
    # Angabe, die der Mitarbeiter eintraegt.
    start_lokal = datetime.combine(
        montag(), datetime.min.time(), tzinfo=BUSINESS_TZ
    ) + timedelta(hours=beginn_stunde, minutes=beginn_minute)
    start = start_lokal.astimezone(timezone.utc)
    a = Appointment(
        customer_id=customer.id if customer else None,
        employee_id=employee.id,
        start_at=start,
        end_at=start + timedelta(minutes=dauer_minuten) if dauer_minuten else None,
        appointment_type=AppointmentType.CUSTOMER,
    )
    db.add(a)
    db.flush()
    return a


def erster_termin(db, employee):
    return make_payload(db, employee.id, montag())["appointments"][0]


def test_termin_liefert_kundenname_uhrzeit_und_zeitraum(db, mitarbeiter):
    termin(db, mitarbeiter, kunde(db, mitarbeiter), 6, dauer_minuten=240)
    a = erster_termin(db, mitarbeiter)
    assert a["customer_name"] == "Anna Beispiel"
    assert a["start_minutes"] == 6 * 60
    assert a["end_minutes"] == 10 * 60
    assert a["time_label"] == "06:00 - 10:00"


@pytest.mark.parametrize("dauer", [15, 30, 60, 90, 240])
def test_dauer_bleibt_erhalten(db, mitarbeiter, dauer):
    termin(db, mitarbeiter, kunde(db, mitarbeiter), 9, dauer_minuten=dauer)
    a = erster_termin(db, mitarbeiter)
    assert a["duration_minutes"] == dauer


def test_viertelstundenraster_erlaubt_termine_zur_viertelstunde(db, mitarbeiter):
    termin(db, mitarbeiter, kunde(db, mitarbeiter), 9, beginn_minute=45, dauer_minuten=15)
    a = erster_termin(db, mitarbeiter)
    assert a["start_minutes"] == 9 * 60 + 45
    assert a["duration_minutes"] == GRID_STEP_MINUTES


def test_termin_ohne_ende_zaehlt_als_eine_stunde(db, mitarbeiter):
    termin(db, mitarbeiter, kunde(db, mitarbeiter), 14, dauer_minuten=0)
    a = erster_termin(db, mitarbeiter)
    assert a["duration_minutes"] == 60


def test_raster_waechst_mit_einem_termin_ausserhalb_der_regelzeit(db, mitarbeiter):
    termin(db, mitarbeiter, kunde(db, mitarbeiter), 5, beginn_minute=30, dauer_minuten=60)
    grid = make_payload(db, mitarbeiter.id, montag())["grid"]
    assert grid["start_minutes"] == 5 * 60
    assert grid["step_minutes"] == GRID_STEP_MINUTES


def test_raster_beginnt_und_endet_auf_vollen_stunden(db, mitarbeiter):
    termin(db, mitarbeiter, kunde(db, mitarbeiter), 22, beginn_minute=15, dauer_minuten=90)
    grid = make_payload(db, mitarbeiter.id, montag())["grid"]
    assert grid["start_minutes"] % 60 == 0
    assert grid["end_minutes"] % 60 == 0
    assert grid["end_minutes"] >= 23 * 60 + 45


def test_termin_ohne_kunde_behaelt_seine_bezeichnung(db, mitarbeiter):
    a = termin(db, mitarbeiter, None, 11)
    a.notes = "Telefonie"
    db.flush()
    eintrag = erster_termin(db, mitarbeiter)
    assert eintrag["customer_name"] is None
    assert eintrag["label"] == "Telefonie"


def test_termin_ueber_mitternacht_endet_am_tagesende(db, mitarbeiter):
    termin(db, mitarbeiter, kunde(db, mitarbeiter), 23, dauer_minuten=120)
    a = erster_termin(db, mitarbeiter)
    assert a["end_minutes"] == 24 * 60
    assert a["duration_minutes"] == 60
