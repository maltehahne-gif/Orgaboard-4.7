"""Datenregel: status == returned <=> returned_at gesetzt.

Frueher konnte ein neuer Verleih mit status=returned angelegt werden, ohne
dass returned_at je gesetzt wurde - und ein Statuswechsel zurueck auf
"verliehen" liess ein frueheres returned_at unveraendert stehen. Beides
widerspricht sich fachlich: ein Geraet ist entweder zurueck (mit Datum) oder
nicht (ohne Datum). app.routers.rentals._normalisiertes_rueckgabedatum setzt
diese Regel jetzt unabhaengig vom Frontend durch - fuer Anlage, Bearbeitung
und Statuswechsel gleichermassen.
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


@pytest.fixture
def anna(client):
    db = SessionLocal()
    try:
        user = User(email="anna@example.com", full_name="Anna Mitarbeiterin",
                    password_hash=hash_password(PASSWORD), role=Role.EMPLOYEE,
                    must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name="Anna Mitarbeiterin")
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Kim", last_name="Kundin")
        db.add(kunde)
        produkt = Product(name="VK7 Testgerät", verified=True, active=True)
        db.add(produkt)
        db.commit()
        return {"employee": employee.id, "customer": kunde.id, "product": produkt.id}
    finally:
        db.close()


@pytest.fixture
def kopf(client, anna):
    antwort = client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    assert antwort.status_code == 200
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _anlegen(client, kopf, anna, **overrides):
    payload = {
        "product_id": anna["product"],
        "customer_id": anna["customer"],
        "issued_at": "2026-06-01T09:00:00Z",
        "status": "rented",
        **overrides,
    }
    return client.post("/api/v1/rentals", json=payload, headers=kopf)


def test_neuer_verleih_ohne_angabe_ist_ohne_rueckgabedatum(client, kopf, anna):
    antwort = _anlegen(client, kopf, anna)
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["status"] == "rented"
    assert daten["returned_at"] is None


def test_neuer_verleih_als_returned_bekommt_automatisch_ein_rueckgabedatum(client, kopf, anna):
    antwort = _anlegen(client, kopf, anna, status="returned")
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["status"] == "returned"
    assert daten["returned_at"] is not None


def test_neuer_verleih_als_returned_uebernimmt_ein_angegebenes_datum(client, kopf, anna):
    antwort = _anlegen(client, kopf, anna, status="returned", returned_at="2026-06-02T12:00:00Z")
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["returned_at"].startswith("2026-06-02T12:00")


def test_neuer_verleih_ignoriert_ein_rueckgabedatum_ohne_passenden_status(client, kopf, anna):
    """Ein mitgeschicktes returned_at bei status=rented darf nicht übernommen werden."""
    antwort = _anlegen(client, kopf, anna, status="rented", returned_at="2026-06-02T12:00:00Z")
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["returned_at"] is None


def test_statuswechsel_auf_returned_setzt_rueckgabedatum(client, kopf, anna):
    rental_id = _anlegen(client, kopf, anna).json()["id"]
    antwort = client.patch(f"/api/v1/rentals/{rental_id}/status", json={"status": "returned"}, headers=kopf)
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["status"] == "returned"
    assert daten["returned_at"] is not None


def test_statuswechsel_zurueck_auf_verliehen_loescht_rueckgabedatum(client, kopf, anna):
    """B: nach returned -> rented darf kein altes Rückgabedatum stehen bleiben."""
    rental_id = _anlegen(client, kopf, anna).json()["id"]
    client.patch(f"/api/v1/rentals/{rental_id}/status", json={"status": "returned"}, headers=kopf)

    antwort = client.patch(f"/api/v1/rentals/{rental_id}/status", json={"status": "rented"}, headers=kopf)
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["status"] == "rented"
    assert daten["returned_at"] is None


def test_mehrfacher_statuswechsel_bleibt_konsistent(client, kopf, anna):
    rental_id = _anlegen(client, kopf, anna).json()["id"]

    schritte = ["due", "returned", "rented", "due", "returned"]
    for status in schritte:
        antwort = client.patch(f"/api/v1/rentals/{rental_id}/status", json={"status": status}, headers=kopf)
        assert antwort.status_code == 200, antwort.text
        daten = antwort.json()
        assert daten["status"] == status
        if status == "returned":
            assert daten["returned_at"] is not None
        else:
            assert daten["returned_at"] is None


def test_bearbeiten_haelt_dieselbe_regel_ein(client, kopf, anna):
    rental_id = _anlegen(client, kopf, anna).json()["id"]
    antwort = client.put(f"/api/v1/rentals/{rental_id}", json={
        "product_id": anna["product"],
        "customer_id": anna["customer"],
        "issued_at": "2026-06-01T09:00:00Z",
        "status": "returned",
    }, headers=kopf)
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["returned_at"] is not None
