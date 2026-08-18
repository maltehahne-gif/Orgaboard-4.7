"""'Angemeldet bleiben': Sitzungscookie mit oder ohne Browser-Neustart.

Die Checkbox in der Oberflaeche hatte keine tatsaechliche Wirkung - das
Sitzungscookie bekam immer dieselbe Laufzeit, unabhaengig vom Haken. Jetzt
steuert remember_me, ob das Cookie ein Ablaufdatum traegt (bleibt ueber
einen Browser-Neustart hinweg gueltig) oder ein reines Sitzungscookie ist
(verschwindet, sobald der Browser geschlossen wird).
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
from app.models import Employee, Role, User  # noqa: E402

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
def anna():
    db = SessionLocal()
    try:
        user = User(email="anna@example.com", full_name="Anna Mitarbeiterin",
                    password_hash=hash_password(PASSWORD), role=Role.EMPLOYEE,
                    must_change_password=False)
        db.add(user)
        db.flush()
        db.add(Employee(user_id=user.id, display_name="Anna Mitarbeiterin"))
        db.commit()
        return user.id
    finally:
        db.close()


def _session_cookie_header(response) -> str:
    """Der rohe Set-Cookie-Header fürs Sitzungscookie - Max-Age steht nur im Rohtext."""
    for raw_name, raw_value in response.headers.raw:
        if raw_name.decode().lower() == "set-cookie" and raw_value.decode().startswith("orgaboard_session="):
            return raw_value.decode()
    raise AssertionError("Kein Set-Cookie-Header für orgaboard_session gefunden")


def test_angemeldet_bleiben_gibt_dem_cookie_eine_laufzeit(client, anna):
    response = client.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD, "remember_me": True,
    })
    assert response.status_code == 200
    assert "max-age" in _session_cookie_header(response).lower()


def test_ohne_angemeldet_bleiben_ist_es_ein_reines_sitzungscookie(client, anna):
    response = client.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD, "remember_me": False,
    })
    assert response.status_code == 200
    header = _session_cookie_header(response).lower()
    assert "max-age" not in header
    assert "expires" not in header


def test_ohne_angabe_bleibt_das_bisherige_verhalten_erhalten(client, anna):
    """Ein Client, der remember_me nicht mitschickt, verhält sich wie zuvor (Standard: True)."""
    response = client.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD,
    })
    assert response.status_code == 200
    assert "max-age" in _session_cookie_header(response).lower()


def test_die_sitzung_selbst_funktioniert_in_beiden_faellen_gleich(client, anna):
    """remember_me betrifft nur die Cookie-Laufzeit, nicht die Gültigkeit des Tokens."""
    response = client.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD, "remember_me": False,
    })
    assert response.status_code == 200
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "anna@example.com"
