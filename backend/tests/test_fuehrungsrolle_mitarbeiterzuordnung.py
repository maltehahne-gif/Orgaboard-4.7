"""Mitarbeiterzuordnung bei Verkauf, Angebot und Verleih fuer Fuehrungsrollen.

Backend-Regel (zentral in app.core.rbac.scoped_employee_id):

* EMPLOYEE wird ohne Angabe automatisch sich selbst zugeordnet und kann sich
  keinen fremden Mitarbeiter manipulativ setzen.
* TEAM_LEADER, REGIONAL_LEAD und SYSTEM_ADMIN muessen bei der Erstellung
  einen Mitarbeiter angeben - sonst 400.
* Eine erfundene oder vertippte Mitarbeiter-ID wird abgelehnt (404), statt
  unbemerkt in der Datenbank zu landen oder die Anfrage mit einem rohen
  500er abzubrechen.

Dieselbe zentrale Funktion wird von Verkauf, Angebot und Verleih benutzt -
die Tests hier decken deshalb alle drei mit derselben Erwartungshaltung ab.
"""
import os
import tempfile

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, Employee, Product, Role, User  # noqa: E402

PASSWORD = "PasswortPasswort1"
FUEHRUNGSROLLEN = ["TEAM_LEADER", "REGIONAL_LEAD", "SYSTEM_ADMIN"]


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def _person(email, name, role=Role.EMPLOYEE):
    db = SessionLocal()
    try:
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=role, must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name)
        db.add(employee)
        db.commit()
        return {"user": user.id, "employee": employee.id}
    finally:
        db.close()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _produkt():
    db = SessionLocal()
    try:
        p = Product(name="VK7 Testgerät", verified=True, active=True)
        db.add(p)
        db.commit()
        return p.id
    finally:
        db.close()


def _kunde(employee_id):
    db = SessionLocal()
    try:
        c = Customer(employee_id=employee_id, first_name="Kim", last_name="Kundin")
        db.add(c)
        db.commit()
        return c.id
    finally:
        db.close()


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


@pytest.fixture
def bodo():
    """Zweiter einfacher Mitarbeiter - fuer den Manipulationsversuch."""
    return _person("bodo@example.com", "Bodo Kollege")


@pytest.fixture
def produkt():
    return _produkt()


def _fuehrungskraft(email, rolle):
    return _person(email, f"Führungskraft {rolle}", Role(rolle))


def _sale_payload(customer_id, employee_id=None):
    return {
        "customer_id": customer_id,
        "employee_id": employee_id,
        "sold_at": "2026-06-01T10:00:00Z",
        "channel": "field",
        "items": [{"product_id": None, "quantity": 1, "unit_price_cents": 10000}],
    }


def _offer_payload(customer_id, employee_id=None):
    return {
        "customer_id": customer_id,
        "employee_id": employee_id,
        "items": [{"product_id": None, "quantity": 1, "unit_price_cents": 10000}],
    }


def _rental_payload(customer_id, product_id, employee_id=None):
    return {
        "product_id": product_id,
        "customer_id": customer_id,
        "employee_id": employee_id,
        "issued_at": "2026-06-01T10:00:00Z",
    }


ENDPOINTS = ["/api/v1/sales", "/api/v1/offers", "/api/v1/rentals"]


def _payload_for(pfad, customer_id, produkt_id, employee_id=None):
    if pfad == "/api/v1/sales":
        p = _sale_payload(customer_id, employee_id)
    elif pfad == "/api/v1/offers":
        p = _offer_payload(customer_id, employee_id)
    else:
        p = _rental_payload(customer_id, produkt_id, employee_id)
    if pfad != "/api/v1/rentals":
        p["items"][0]["product_id"] = produkt_id
    return p


# ============================================================== EMPLOYEE

@pytest.mark.parametrize("pfad", ENDPOINTS)
def test_employee_wird_ohne_angabe_automatisch_sich_selbst_zugeordnet(client, anna, produkt, pfad):
    kopf = _login(client, "anna@example.com")
    kunde = _kunde(anna["employee"])
    payload = _payload_for(pfad, kunde, produkt)  # kein employee_id angegeben

    antwort = client.post(pfad, json=payload, headers=kopf)
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["employee_id"] == anna["employee"]


@pytest.mark.parametrize("pfad", ENDPOINTS)
def test_employee_kann_sich_keinen_fremden_mitarbeiter_manipulativ_setzen(client, anna, bodo, produkt, pfad):
    """Der von Hand zusammengebaute Aufruf, den die Oberfläche nie schickt."""
    kopf = _login(client, "anna@example.com")
    kunde = _kunde(anna["employee"])
    payload = _payload_for(pfad, kunde, produkt, employee_id=bodo["employee"])

    antwort = client.post(pfad, json=payload, headers=kopf)
    assert antwort.status_code == 403, antwort.text


# ======================================================= Fuehrungsrollen

@pytest.mark.parametrize("pfad", ENDPOINTS)
@pytest.mark.parametrize("rolle", FUEHRUNGSROLLEN)
def test_fuehrungsrolle_muss_mitarbeiter_angeben(client, anna, produkt, pfad, rolle):
    email = f"fk-{rolle.lower()}-{pfad.split('/')[-1]}@example.com"
    _fuehrungskraft(email, rolle)
    kopf = _login(client, email)
    kunde = _kunde(anna["employee"])
    payload = _payload_for(pfad, kunde, produkt)  # kein employee_id angegeben

    antwort = client.post(pfad, json=payload, headers=kopf)
    assert antwort.status_code == 400, antwort.text


@pytest.mark.parametrize("pfad", ENDPOINTS)
@pytest.mark.parametrize("rolle", FUEHRUNGSROLLEN)
def test_fuehrungsrolle_kann_erlaubten_mitarbeiter_waehlen(client, anna, produkt, pfad, rolle):
    email = f"fk2-{rolle.lower()}-{pfad.split('/')[-1]}@example.com"
    _fuehrungskraft(email, rolle)
    kopf = _login(client, email)
    kunde = _kunde(anna["employee"])
    payload = _payload_for(pfad, kunde, produkt, employee_id=anna["employee"])

    antwort = client.post(pfad, json=payload, headers=kopf)
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["employee_id"] == anna["employee"]


@pytest.mark.parametrize("pfad", ENDPOINTS)
@pytest.mark.parametrize("rolle", FUEHRUNGSROLLEN)
def test_fuehrungsrolle_manipulierte_mitarbeiter_id_wird_abgelehnt(client, anna, produkt, pfad, rolle):
    """Eine erfundene ID darf weder in der Datenbank landen noch einen 500er auslösen."""
    email = f"fk3-{rolle.lower()}-{pfad.split('/')[-1]}@example.com"
    _fuehrungskraft(email, rolle)
    kopf = _login(client, email)
    kunde = _kunde(anna["employee"])
    payload = _payload_for(pfad, kunde, produkt, employee_id="nicht-vorhandene-id")

    antwort = client.post(pfad, json=payload, headers=kopf)
    assert antwort.status_code == 404, antwort.text
