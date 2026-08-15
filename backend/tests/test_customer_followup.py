"""Tests fuer die naechste Wiedervorlage im Kundenprofil.

Die Zeitleiste zeigte bisher, wann Wiedervorlagen angelegt wurden - aber
nicht, wann der naechste Kontakt ansteht. Genau das ist die Frage, die man
vor einem Kundenbesuch hat. Geprueft wird, dass immer die faelligste offene
Wiedervorlage erscheint, erledigte nicht mehr auftauchen und ein Mitarbeiter
darueber nichts von fremden Kunden erfaehrt.
"""
import os
import tempfile
from datetime import date, timedelta

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.timeutils import local_today  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Customer,
    Employee,
    FollowUp,
    FollowUpReason,
    FollowUpStatus,
    Role,
    User,
)

PASSWORD = "PasswortPasswort1"


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _person(email, name, role=Role.EMPLOYEE):
    db = SessionLocal()
    try:
        user = User(
            email=email,
            full_name=name,
            password_hash=hash_password(PASSWORD),
            role=role,
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name)
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Karl", last_name=name.split()[0])
        db.add(kunde)
        db.commit()
        return {"user": user.id, "employee": employee.id, "customer": kunde.id}
    finally:
        db.close()


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


@pytest.fixture
def bodo():
    return _person("bodo@example.com", "Bodo Kollege")


def _login(client, email="anna@example.com"):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _wiedervorlage(person, faellig: date, status=FollowUpStatus.OPEN,
                   reason=FollowUpReason.MANUAL, note=None):
    db = SessionLocal()
    try:
        f = FollowUp(
            customer_id=person["customer"],
            employee_id=person["employee"],
            due_on=faellig,
            reason=reason,
            status=status,
            note=note,
        )
        db.add(f)
        db.commit()
        return f.id
    finally:
        db.close()


def _timeline(client, kopf, kunde):
    return client.get(f"/api/v1/customers/{kunde}/timeline", headers=kopf).json()


# ---------------------------------------------------------- Grundfaelle

def test_ohne_wiedervorlage_steht_dort_nichts(client, anna):
    kopf = _login(client)
    daten = _timeline(client, kopf, anna["customer"])

    assert daten["next_follow_up"] is None


def test_offene_wiedervorlage_erscheint(client, anna):
    kopf = _login(client)
    _wiedervorlage(anna, local_today() + timedelta(days=5), note="Angebot VK7 nachfassen")

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]

    assert naechste["days_until"] == 5
    assert naechste["is_overdue"] is False
    assert naechste["is_today"] is False
    assert naechste["note"] == "Angebot VK7 nachfassen"


def test_immer_die_faelligste_von_mehreren(client, anna):
    kopf = _login(client)
    _wiedervorlage(anna, local_today() + timedelta(days=30))
    _wiedervorlage(anna, local_today() + timedelta(days=3))
    _wiedervorlage(anna, local_today() + timedelta(days=14))

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]
    assert naechste["days_until"] == 3


def test_heute_faellig_wird_als_heute_gemeldet(client, anna):
    kopf = _login(client)
    _wiedervorlage(anna, local_today())

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]
    assert naechste["is_today"] is True
    assert naechste["is_overdue"] is False
    assert naechste["days_until"] == 0


def test_ueberfaellige_wird_als_ueberfaellig_gemeldet(client, anna):
    kopf = _login(client)
    _wiedervorlage(anna, local_today() - timedelta(days=4))

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]
    assert naechste["is_overdue"] is True
    assert naechste["days_until"] == -4


def test_ueberfaellige_geht_vor_kuenftiger(client, anna):
    """Was liegen geblieben ist, gehoert zuerst gesehen."""
    kopf = _login(client)
    _wiedervorlage(anna, local_today() + timedelta(days=2))
    _wiedervorlage(anna, local_today() - timedelta(days=9))

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]
    assert naechste["is_overdue"] is True


def test_erledigte_zaehlt_nicht_mehr(client, anna):
    kopf = _login(client)
    _wiedervorlage(anna, local_today() + timedelta(days=1), status=FollowUpStatus.DONE)

    assert _timeline(client, kopf, anna["customer"])["next_follow_up"] is None


def test_abgebrochene_zaehlt_nicht_mehr(client, anna):
    kopf = _login(client)
    _wiedervorlage(anna, local_today() + timedelta(days=1), status=FollowUpStatus.CANCELLED)

    assert _timeline(client, kopf, anna["customer"])["next_follow_up"] is None


def test_grund_wird_mitgegeben(client, anna):
    kopf = _login(client)
    _wiedervorlage(anna, local_today() + timedelta(days=2), reason=FollowUpReason.RENTAL_RETURN)

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]
    assert naechste["reason"] == "rental_return"


# ------------------------------------------------ Anlegen ueber die API

def test_anlegen_erscheint_sofort_im_profil(client, anna):
    """Der Weg, den die Kundenakte geht: anlegen, dann neu laden."""
    kopf = _login(client)
    morgen = (local_today() + timedelta(days=1)).isoformat()

    antwort = client.post("/api/v1/followups", json={
        "customer_id": anna["customer"],
        "due_on": morgen,
        "note": "Rueckruf vereinbart",
    }, headers=kopf)
    assert antwort.status_code in (200, 201), antwort.text

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]
    assert naechste["due_on"] == morgen
    assert naechste["note"] == "Rueckruf vereinbart"


def test_verschieben_aendert_das_datum(client, anna):
    kopf = _login(client)
    eintrag = _wiedervorlage(anna, local_today() + timedelta(days=2))
    spaeter = (local_today() + timedelta(days=20)).isoformat()

    antwort = client.put(f"/api/v1/followups/{eintrag}",
                         json={"due_on": spaeter, "note": "verschoben"}, headers=kopf)
    assert antwort.status_code == 200, antwort.text

    naechste = _timeline(client, kopf, anna["customer"])["next_follow_up"]
    assert naechste["due_on"] == spaeter


def test_erledigen_raeumt_das_profil(client, anna):
    kopf = _login(client)
    eintrag = _wiedervorlage(anna, local_today())

    antwort = client.post(f"/api/v1/followups/{eintrag}/complete",
                          json={"completed_note": None}, headers=kopf)
    assert antwort.status_code == 200, antwort.text

    assert _timeline(client, kopf, anna["customer"])["next_follow_up"] is None


# ----------------------------------------------------------- Sichtbarkeit

def test_fremde_kundenakte_bleibt_verschlossen(client, anna, bodo):
    _wiedervorlage(bodo, local_today())
    kopf = _login(client, "anna@example.com")

    antwort = client.get(f"/api/v1/customers/{bodo['customer']}/timeline", headers=kopf)
    assert antwort.status_code == 403


def test_timeline_braucht_anmeldung(client, anna):
    antwort = client.get(f"/api/v1/customers/{anna['customer']}/timeline")
    assert antwort.status_code == 401
