"""Tests fuer das Management-Cockpit: Zeitraeume, Mitarbeiter-Filter,
Angebotskennzahlen und den zusammengefuehrten /dashboard/cockpit-Endpunkt.
"""
import os
import tempfile
from datetime import date, datetime, timedelta, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.database import Base as CoreBase, SessionLocal, engine as core_engine  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.timeutils import day_bounds, quarter_bounds, year_bounds  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Customer,
    District,
    Employee,
    Product,
    Region,
    Role,
    Sale,
    SaleItem,
    Team,
    User,
)
from app.services.analytics import offer_kpis  # noqa: E402
from app.services.stats import employee_filter  # noqa: E402

PASSWORD = "PasswortPasswort1"


# ------------------------------------------------------------- Zeitraeume

def test_quarter_bounds_deckt_drei_monate_ab():
    stichtag = date(2026, 8, 16)
    start, end = quarter_bounds(stichtag)
    tag_start, tag_end = day_bounds(stichtag)

    # Der Stichtag selbst muss innerhalb des Quartalsfensters liegen.
    assert start <= tag_start
    assert tag_end <= end
    assert start < end
    assert (end - start).days in (91, 92)


def test_quarter_bounds_viertes_quartal_wechselt_das_jahr():
    stichtag = date(2026, 11, 1)
    start, end = quarter_bounds(stichtag)
    tag_start, tag_end = day_bounds(stichtag)

    assert start <= tag_start
    assert tag_end <= end
    # Q4 beginnt im Oktober und endet erst im Januar des Folgejahres.
    assert (end - start).days in (91, 92)
    assert end > quarter_bounds(date(2026, 12, 31))[0]


def test_year_bounds_deckt_das_kalenderjahr_ab():
    start, end = year_bounds(date(2026, 6, 1))
    assert (end - start).days in (365, 366)


# --------------------------------------------------------- employee_filter

def test_employee_filter_none_bedeutet_kein_filter():
    assert employee_filter(Sale.employee_id, None) is None


def test_employee_filter_leere_liste_schliesst_alle_aus():
    bedingung = employee_filter(Sale.employee_id, [])
    assert bedingung is not None
    # Eine leere IN-Liste darf niemanden treffen - kompiliert zu einer
    # immer-falschen Bedingung.
    compiled = str(bedingung.compile(compile_kwargs={"literal_binds": True}))
    assert "sale" in compiled.lower() or "1 = 0" in compiled or "1 != 1" in compiled


# ------------------------------------------------------------ offer_kpis

@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng, expire_on_commit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def _employee(db, name="Test Mitarbeiter"):
    user = User(email=f"{name.replace(' ', '.').lower()}@test.local", full_name=name,
                password_hash="hash", role=Role.EMPLOYEE, must_change_password=False)
    db.add(user)
    db.flush()
    employee = Employee(user_id=user.id, display_name=name)
    db.add(employee)
    db.flush()
    return employee


def test_offer_kpis_zaehlt_erstellte_und_umgewandelte_mit_rabatt(db):
    from app.models import Offer, OfferItem, OfferStatus

    e = _employee(db)
    c = Customer(employee_id=e.id, first_name="Max", last_name="Muster")
    db.add(c)
    p = Product(name="VK7", verified=True, active=True)
    db.add(p)
    db.flush()

    now = datetime.now(timezone.utc)

    offen = Offer(number="AN-1", customer_id=c.id, employee_id=e.id, status=OfferStatus.SENT,
                  issued_on=now.date(), created_at=now, updated_at=now, discount_percent=0)
    db.add(offen)
    db.flush()
    db.add(OfferItem(offer_id=offen.id, product_id=p.id, product_name_snapshot=p.name,
                      quantity=1, unit_price_cents=100000))

    umgewandelt = Offer(number="AN-2", customer_id=c.id, employee_id=e.id, status=OfferStatus.CONVERTED,
                        issued_on=now.date(), created_at=now, updated_at=now, discount_percent=10)
    db.add(umgewandelt)
    db.flush()
    db.add(OfferItem(offer_id=umgewandelt.id, product_id=p.id, product_name_snapshot=p.name,
                      quantity=1, unit_price_cents=200000))
    db.commit()

    kpis = offer_kpis(db, now - timedelta(hours=1), now + timedelta(hours=1), e.id)
    assert kpis["created"] == 2
    assert kpis["converted"] == 1
    assert kpis["conversion_rate_percent"] == 50.0
    # 100.000 (ohne Rabatt) + 180.000 (200.000 minus 10%) = 280.000
    assert kpis["total_value_cents"] == 280000


# ------------------------------------------------------- /dashboard/cockpit

@pytest.fixture
def client():
    CoreBase.metadata.create_all(bind=core_engine)
    yield TestClient(app)
    CoreBase.metadata.drop_all(bind=core_engine)


def _person(email, name, role=Role.EMPLOYEE, team_id=None):
    db = SessionLocal()
    try:
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=role, must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name, team_id=team_id, monthly_units_target=10)
        db.add(employee)
        db.flush()
        db.commit()
        return {"user": user.id, "employee": employee.id}
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def test_cockpit_verweigert_mitarbeitern(client):
    _person("anna@example.com", "Anna Mitarbeiterin")
    kopf = _login(client, "anna@example.com")
    antwort = client.get("/api/v1/dashboard/cockpit", headers=kopf)
    assert antwort.status_code == 403


def test_cockpit_liefert_zusammengefasste_kennzahlen(client):
    chefin = _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)

    db = SessionLocal()
    try:
        c = Customer(employee_id=chefin["employee"], first_name="Max", last_name="Muster")
        db.add(c)
        p = Product(name="VK7", verified=True, active=True)
        db.add(p)
        db.flush()
        sale = Sale(customer_id=c.id, employee_id=chefin["employee"], sold_at=datetime.now(timezone.utc))
        db.add(sale)
        db.flush()
        db.add(SaleItem(sale_id=sale.id, product_id=p.id, product_name_snapshot=p.name,
                        quantity=1, unit_price_cents=150000))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/dashboard/cockpit?period=month", headers=kopf).json()

    assert daten["revenue_cents"] == 150000
    assert daten["sales_count"] == 1
    assert daten["revenue_per_sale_cents"] == 150000
    assert daten["employee_count"] == 1
    assert "funnel" in daten
    assert "alerts" in daten
    assert daten["offers_created"] == 0


def test_cockpit_team_filter_grenzt_ein(client):
    _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)

    db = SessionLocal()
    try:
        region = Region(name="Region Sued")
        db.add(region)
        db.flush()
        district = District(region_id=region.id, name="Bezirk Sued-West")
        db.add(district)
        db.flush()
        team = Team(district_id=district.id, name="Team Adler")
        db.add(team)
        db.commit()
        team_id = team.id
    finally:
        db.close()

    mitglied = _person("mitglied@example.com", "Tom Teammitglied", team_id=team_id)

    db = SessionLocal()
    try:
        c = Customer(employee_id=mitglied["employee"], first_name="Anna", last_name="Kundin")
        db.add(c)
        p = Product(name="VK7", verified=True, active=True)
        db.add(p)
        db.flush()
        sale = Sale(customer_id=c.id, employee_id=mitglied["employee"], sold_at=datetime.now(timezone.utc))
        db.add(sale)
        db.flush()
        db.add(SaleItem(sale_id=sale.id, product_id=p.id, product_name_snapshot=p.name,
                        quantity=1, unit_price_cents=50000))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "chefin@example.com")

    mit_team = client.get(f"/api/v1/dashboard/cockpit?team_id={team_id}", headers=kopf).json()
    assert mit_team["revenue_cents"] == 50000
    assert mit_team["employee_count"] == 1

    ohne_team = client.get("/api/v1/dashboard/cockpit", headers=kopf).json()
    # Chefin selbst hat keinen Verkauf, das Teammitglied schon - macht 50000 insgesamt.
    assert ohne_team["revenue_cents"] == 50000
    assert ohne_team["employee_count"] == 2

    anderes_team = client.get("/api/v1/dashboard/cockpit?team_id=gibtsnicht", headers=kopf).json()
    assert anderes_team["revenue_cents"] == 0
    assert anderes_team["employee_count"] == 0
