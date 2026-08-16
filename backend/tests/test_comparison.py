"""Tests fuer den Mitarbeiter-/Team-/Bezirks-/Regionsvergleich.

Schwerpunkt: Team-, Bezirks- und Regionszahlen muessen exakt der Summe der
zugehoerigen Mitarbeiter entsprechen (keine getrennte Berechnung), und eine
Quote aus zu wenigen Terminen muss als "nicht aussagekraeftig" markiert sein,
statt eine falsche Rangliste zu ermoeglichen.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentStatus,
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

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


def _person(email, name, role=Role.EMPLOYEE, team_id=None, target=10):
    db = SessionLocal()
    try:
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=role, must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name, team_id=team_id, monthly_units_target=target)
        db.add(employee)
        db.flush()
        db.commit()
        return {"user": user.id, "employee": employee.id}
    finally:
        db.close()


def _org():
    db = SessionLocal()
    try:
        region = Region(name="Region Ost")
        db.add(region)
        db.flush()
        district = District(region_id=region.id, name="Bezirk Ost-1")
        db.add(district)
        db.flush()
        team_a = Team(district_id=district.id, name="Team Adler")
        team_b = Team(district_id=district.id, name="Team Bussard")
        db.add_all([team_a, team_b])
        db.commit()
        return {"region": region.id, "district": district.id, "team_a": team_a.id, "team_b": team_b.id}
    finally:
        db.close()


def _sale(employee_id, cents, product_id=None):
    db = SessionLocal()
    try:
        c = Customer(employee_id=employee_id, first_name="Kunde", last_name="Test")
        db.add(c)
        if product_id is None:
            p = Product(name=f"Produkt-{cents}", verified=True, active=True)
            db.add(p)
            db.flush()
            product_id = p.id
        sale = Sale(customer_id=c.id, employee_id=employee_id, sold_at=datetime.now(timezone.utc))
        db.add(sale)
        db.flush()
        db.add(SaleItem(sale_id=sale.id, product_id=product_id, product_name_snapshot="Produkt",
                        quantity=1, unit_price_cents=cents))
        db.commit()
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


def test_comparison_verweigert_mitarbeitern(client):
    _person("anna@example.com", "Anna Mitarbeiterin")
    kopf = _login(client, "anna@example.com")
    assert client.get("/api/v1/team/comparison", headers=kopf).status_code == 403


def test_mitarbeiterebene_zeigt_umsatz_und_quote_hinweis(client):
    _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)
    anna = _person("anna@example.com", "Anna Mitarbeiterin", target=20)
    _sale(anna["employee"], 100000)

    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/team/comparison?level=employee&period=month", headers=kopf).json()

    assert daten["level"] == "employee"
    zeile = next(r for r in daten["rows"] if r["name"] == "Anna Mitarbeiterin")
    assert zeile["revenue_cents"] == 100000
    assert zeile["goal_units_target"] == 20
    # Kein Termin erfasst - die Quote darf nicht als verlaesslich gelten.
    assert zeile["has_enough_data"] is False
    assert daten["minimum_appointments_for_quote"] == 3


def test_teamebene_summiert_die_mitglieder_exakt(client):
    org = _org()
    _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)
    anna = _person("anna@example.com", "Anna", team_id=org["team_a"], target=10)
    bodo = _person("bodo@example.com", "Bodo", team_id=org["team_a"], target=15)
    _person("carla@example.com", "Carla", team_id=org["team_b"], target=10)

    _sale(anna["employee"], 50000)
    _sale(bodo["employee"], 70000)
    _sale(bodo["employee"], 30000)

    kopf = _login(client, "chefin@example.com")
    daten = client.get(f"/api/v1/team/comparison?level=team&district_id={org['district']}", headers=kopf).json()

    team_a_zeile = next(r for r in daten["rows"] if r["name"] == "Team Adler")
    assert team_a_zeile["revenue_cents"] == 150000
    assert team_a_zeile["employee_count"] == 2
    assert team_a_zeile["goal_units_target"] == 25

    # Team Bussard gehoert zum selben Bezirk und muss ebenfalls auftauchen,
    # aber ohne die Umsaetze von Team Adler.
    team_b_zeile = next(r for r in daten["rows"] if r["name"] == "Team Bussard")
    assert team_b_zeile["revenue_cents"] == 0


def test_bezirks_und_regionsebene_aggregieren_gleich(client):
    org = _org()
    _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)
    anna = _person("anna@example.com", "Anna", team_id=org["team_a"])
    bodo = _person("bodo@example.com", "Bodo", team_id=org["team_b"])
    _sale(anna["employee"], 40000)
    _sale(bodo["employee"], 60000)

    kopf = _login(client, "chefin@example.com")

    bezirke = client.get("/api/v1/team/comparison?level=district", headers=kopf).json()
    bezirk = next(r for r in bezirke["rows"] if r["name"] == "Bezirk Ost-1")
    assert bezirk["revenue_cents"] == 100000
    assert bezirk["employee_count"] == 2

    regionen = client.get("/api/v1/team/comparison?level=region", headers=kopf).json()
    region = next(r for r in regionen["rows"] if r["name"] == "Region Ost")
    assert region["revenue_cents"] == 100000
    assert region["employee_count"] == 2


def test_ausreichend_termine_macht_quote_verlaesslich(client):
    _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)
    anna = _person("anna@example.com", "Anna Mitarbeiterin")

    db = SessionLocal()
    try:
        c = Customer(employee_id=anna["employee"], first_name="Kunde", last_name="Test")
        db.add(c)
        db.flush()
        for _ in range(3):
            db.add(Appointment(
                customer_id=c.id, employee_id=anna["employee"],
                start_at=datetime.now(timezone.utc) - timedelta(days=1),
                status=AppointmentStatus.COMPLETED,
            ))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/team/comparison?level=employee", headers=kopf).json()
    zeile = next(r for r in daten["rows"] if r["name"] == "Anna Mitarbeiterin")
    assert zeile["appointments_done"] == 3
    assert zeile["has_enough_data"] is True


def test_eigener_zeitraum_grenzt_verkaeufe_ein(client):
    _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)
    anna = _person("anna@example.com", "Anna Mitarbeiterin")

    db = SessionLocal()
    try:
        c = Customer(employee_id=anna["employee"], first_name="Kunde", last_name="Test")
        db.add(c)
        p = Product(name="Altprodukt", verified=True, active=True)
        db.add(p)
        db.flush()
        alt = Sale(customer_id=c.id, employee_id=anna["employee"],
                   sold_at=datetime.now(timezone.utc) - timedelta(days=200))
        db.add(alt)
        db.flush()
        db.add(SaleItem(sale_id=alt.id, product_id=p.id, product_name_snapshot=p.name,
                        quantity=1, unit_price_cents=99999))
        db.commit()
    finally:
        db.close()

    _sale(anna["employee"], 10000)

    kopf = _login(client, "chefin@example.com")

    heute = datetime.now(timezone.utc).date()
    von = (heute - timedelta(days=3)).isoformat()
    bis = heute.isoformat()

    daten = client.get(
        f"/api/v1/team/comparison?level=employee&period=custom&date_from={von}&date_to={bis}",
        headers=kopf,
    ).json()
    zeile = next(r for r in daten["rows"] if r["name"] == "Anna Mitarbeiterin")
    # Nur der aktuelle Verkauf faellt in den engen Zeitraum, der 200 Tage
    # alte nicht.
    assert zeile["revenue_cents"] == 10000
