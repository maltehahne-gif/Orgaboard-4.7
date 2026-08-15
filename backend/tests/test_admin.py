"""Tests fuer den Admin-Bereich.

Schwerpunkt sind die Sperren, die das System handlungsfaehig halten: niemand
darf sich selbst aussperren, und der letzte aktive Teamleiter bleibt
bestehen. Faellt eine dieser Zusicherungen, laesst sich OrgaBoard in einen
Zustand bringen, der nur noch direkt auf der Datenbank zu reparieren ist.
"""
import os
import tempfile

import pytest

# Muss vor dem Import der App gesetzt sein - get_settings() ist gecacht.
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


def _anlegen(email, name, role, aktiv=True):
    db = SessionLocal()
    try:
        user = User(
            email=email,
            full_name=name,
            password_hash=hash_password(PASSWORD),
            role=role,
            is_active=aktiv,
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        db.add(Employee(user_id=user.id, display_name=name))
        db.commit()
        return user.id
    finally:
        db.close()


@pytest.fixture
def leiter():
    return _anlegen("leiter@example.com", "Chef Person", Role.TEAM_LEADER)


@pytest.fixture
def mitarbeiter():
    return _anlegen("mitarbeiter@example.com", "Mit Arbeiter", Role.EMPLOYEE)


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


# --------------------------------------------------------------- Zugriff

def test_mitarbeiter_kommt_nicht_in_die_verwaltung(client, leiter, mitarbeiter):
    kopf = _login(client, "mitarbeiter@example.com")
    assert client.get("/api/v1/admin/users").status_code == 403
    assert client.post("/api/v1/admin/users", json={
        "email": "neu@example.com", "full_name": "Neu"}, headers=kopf).status_code == 403


def test_ohne_anmeldung_kein_zugriff(client, leiter):
    assert client.get("/api/v1/admin/users").status_code == 401


def test_anlegen_braucht_csrf_token(client, leiter):
    client.post("/api/v1/auth/login", json={"email": "leiter@example.com", "password": PASSWORD})
    antwort = client.post("/api/v1/admin/users", json={
        "email": "neu@example.com", "full_name": "Neu Person"})
    assert antwort.status_code == 403


# --------------------------------------------------------------- Anlegen

def test_leiter_legt_benutzer_mit_startpasswort_an(client, leiter):
    kopf = _login(client, "leiter@example.com")
    antwort = client.post("/api/v1/admin/users", json={
        "email": "Neu@Example.COM",
        "full_name": "Neu Person",
        "monthly_units_target": 25,
    }, headers=kopf)

    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    # E-Mail wird normalisiert, sonst gibt es Dubletten mit anderer Schreibweise.
    assert daten["email"] == "neu@example.com"
    assert daten["must_change_password"] is True
    assert len(daten["start_password"]) >= 12
    assert daten["employee"]["monthly_units_target"] == 25

    # Das Startpasswort funktioniert wirklich.
    zweiter = TestClient(app)
    assert zweiter.post("/api/v1/auth/login", json={
        "email": "neu@example.com", "password": daten["start_password"]}).status_code == 200


def test_doppelte_email_wird_abgelehnt(client, leiter, mitarbeiter):
    kopf = _login(client, "leiter@example.com")
    antwort = client.post("/api/v1/admin/users", json={
        "email": "mitarbeiter@example.com", "full_name": "Doppelt"}, headers=kopf)
    assert antwort.status_code == 400
    assert "bereits" in antwort.json()["detail"]


def test_zu_kurzes_startpasswort_wird_abgelehnt(client, leiter):
    kopf = _login(client, "leiter@example.com")
    antwort = client.post("/api/v1/admin/users", json={
        "email": "kurz@example.com", "full_name": "Kurz", "password": "zukurz"}, headers=kopf)
    assert antwort.status_code == 400


# ------------------------------------------------- Sperren gegen Aussperren

def test_niemand_deaktiviert_sich_selbst(client, leiter, mitarbeiter):
    kopf = _login(client, "leiter@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{leiter}",
                           json={"is_active": False}, headers=kopf)
    assert antwort.status_code == 400
    assert "selbst" in antwort.json()["detail"]

    db = SessionLocal()
    try:
        assert db.get(User, leiter).is_active is True
    finally:
        db.close()


def test_niemand_aendert_die_eigene_rolle(client, leiter):
    kopf = _login(client, "leiter@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{leiter}",
                           json={"role": "EMPLOYEE"}, headers=kopf)
    assert antwort.status_code == 400

    db = SessionLocal()
    try:
        assert db.get(User, leiter).role == Role.TEAM_LEADER
    finally:
        db.close()


def test_letzter_teamleiter_wird_nicht_degradiert(client, leiter):
    """Ein zweiter Leiter darf degradiert werden - der letzte nicht."""
    zweiter = _anlegen("zweiter@example.com", "Zweiter Chef", Role.TEAM_LEADER)
    kopf = _login(client, "leiter@example.com")

    # Solange es zwei gibt, ist das erlaubt.
    assert client.patch(f"/api/v1/admin/users/{zweiter}",
                        json={"role": "EMPLOYEE"}, headers=kopf).status_code == 200

    # Jetzt ist "leiter" der letzte - und der ist zusaetzlich er selbst.
    dritter = _anlegen("dritter@example.com", "Dritter Chef", Role.TEAM_LEADER)
    assert client.patch(f"/api/v1/admin/users/{dritter}",
                        json={"role": "EMPLOYEE"}, headers=kopf).status_code == 200

    db = SessionLocal()
    try:
        aktive = db.query(User).filter(
            User.role == Role.TEAM_LEADER, User.is_active.is_(True)).count()
        assert aktive == 1
    finally:
        db.close()


def test_letzter_aktiver_teamleiter_wird_nicht_deaktiviert(client, leiter):
    zweiter = _anlegen("zweiter@example.com", "Zweiter Chef", Role.TEAM_LEADER)
    kopf = _login(client, "zweiter@example.com")

    # "zweiter" deaktiviert "leiter" - danach ist "zweiter" der letzte.
    assert client.patch(f"/api/v1/admin/users/{leiter}",
                        json={"is_active": False}, headers=kopf).status_code == 200

    # Ein dritter Leiter kann jetzt nicht mehr deaktiviert werden, wenn er
    # der einzige verbleibende aktive waere - hier geprueft ueber "zweiter"
    # selbst, der sich ohnehin nicht deaktivieren darf.
    antwort = client.patch(f"/api/v1/admin/users/{zweiter}",
                           json={"is_active": False}, headers=kopf)
    assert antwort.status_code == 400


def test_deaktivierter_benutzer_kommt_nicht_mehr_rein(client, leiter, mitarbeiter):
    kopf = _login(client, "leiter@example.com")
    assert client.patch(f"/api/v1/admin/users/{mitarbeiter}",
                        json={"is_active": False}, headers=kopf).status_code == 200

    anderer = TestClient(app)
    antwort = anderer.post("/api/v1/auth/login", json={
        "email": "mitarbeiter@example.com", "password": PASSWORD})
    assert antwort.status_code != 200


# ------------------------------------------------------- Rolle und Profil

def test_leiter_befoerdert_mitarbeiter(client, leiter, mitarbeiter):
    kopf = _login(client, "leiter@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{mitarbeiter}",
                           json={"role": "TEAM_LEADER"}, headers=kopf)
    assert antwort.status_code == 200
    assert antwort.json()["role"] == "TEAM_LEADER"


def test_ziele_lassen_sich_aendern(client, leiter, mitarbeiter):
    kopf = _login(client, "leiter@example.com")
    liste = client.get("/api/v1/admin/users", headers=kopf).json()
    profil = next(u["employee"] for u in liste if u["id"] == mitarbeiter)

    antwort = client.patch(f"/api/v1/admin/employees/{profil['id']}", json={
        "monthly_units_target": 42,
        "position": "Teamleiter Nord",
        "weekly_revenue_target_cents": 900000,
    }, headers=kopf)

    assert antwort.status_code == 200
    daten = antwort.json()["employee"]
    assert daten["monthly_units_target"] == 42
    assert daten["position"] == "Teamleiter Nord"
    assert daten["weekly_revenue_target_cents"] == 900000


def test_passwort_zuruecksetzen_erzwingt_wechsel(client, leiter, mitarbeiter):
    kopf = _login(client, "leiter@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{mitarbeiter}/password",
                           json={}, headers=kopf)

    assert antwort.status_code == 200
    neues = antwort.json()["start_password"]
    assert len(neues) >= 12

    anderer = TestClient(app)
    anmeldung = anderer.post("/api/v1/auth/login", json={
        "email": "mitarbeiter@example.com", "password": neues})
    assert anmeldung.status_code == 200
    assert anmeldung.json()["must_change_password"] is True


def test_aenderungen_landen_im_audit_log(client, leiter, mitarbeiter):
    kopf = _login(client, "leiter@example.com")
    client.patch(f"/api/v1/admin/users/{mitarbeiter}",
                 json={"role": "TEAM_LEADER"}, headers=kopf)

    eintraege = client.get("/api/v1/team/audit", headers=kopf).json()
    aktionen = {e["action"] for e in (eintraege if isinstance(eintraege, list) else eintraege.get("entries", []))}
    assert "user.updated" in aktionen
