"""Tests fuer die Geraetehistorie im Verleih.

Die Verleihliste zeigt Vorgaenge. Diese Ansicht zeigt Geraete: ein Eintrag
je Seriennummer, mit allen Ausgaben dazu. Geprueft wird vor allem, dass
gleiche Geraete zusammenfinden (auch bei unterschiedlicher Schreibweise),
dass fremde Verleihe nicht durchscheinen und dass ein Geraet ohne
Seriennummer gar nicht erst auftaucht - denn dann waere es nicht
unterscheidbar.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

# Muss vor dem Import der App gesetzt sein - get_settings() ist gecacht.
os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Customer,
    Employee,
    Product,
    Rental,
    RentalStatus,
    Role,
    User,
)

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
        kunde = Customer(employee_id=employee.id, first_name="Anna", last_name=name.split()[0])
        db.add(kunde)
        zweiter = Customer(employee_id=employee.id, first_name="Berta", last_name=name.split()[0])
        db.add(zweiter)
        db.commit()
        return {
            "user": user.id,
            "employee": employee.id,
            "customer": kunde.id,
            "customer2": zweiter.id,
        }
    finally:
        db.close()


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


@pytest.fixture
def bodo():
    return _person("bodo@example.com", "Bodo Kollege")


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


@pytest.fixture
def produkt():
    db = SessionLocal()
    try:
        p = Product(name="Kobold VK7", category="Staubsauger", verified=True, active=True)
        db.add(p)
        db.commit()
        return p.id
    finally:
        db.close()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _verleih(besitzer, produkt_id, serial, tage_her=10, dauer=7, zurueck_nach=None, kunde=None):
    """Legt einen Verleih an.

    zurueck_nach = Tage nach Ausgabe, an denen zurueckgegeben wurde;
    None heisst: laeuft noch.
    """
    db = SessionLocal()
    try:
        ausgabe = datetime.now(timezone.utc) - timedelta(days=tage_her)
        row = Rental(
            product_id=produkt_id,
            customer_id=kunde or besitzer["customer"],
            employee_id=besitzer["employee"],
            serial_number=serial,
            issued_at=ausgabe,
            due_at=ausgabe + timedelta(days=dauer),
            returned_at=None if zurueck_nach is None else ausgabe + timedelta(days=zurueck_nach),
            status=RentalStatus.RENTED if zurueck_nach is None else RentalStatus.RETURNED,
        )
        db.add(row)
        db.commit()
        return row.id
    finally:
        db.close()


# --------------------------------------------------------- Geraeteliste

def test_mehrere_ausgaben_werden_zu_einem_geraet(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=60, zurueck_nach=5)
    _verleih(anna, produkt, "VK7-1000", tage_her=30, zurueck_nach=4)
    _verleih(anna, produkt, "VK7-1000", tage_her=10, zurueck_nach=6)

    kopf = _login(client, "anna@example.com")
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()

    assert len(geraete) == 1
    assert geraete[0]["serial_number"] == "VK7-1000"
    assert geraete[0]["loans"] == 3
    assert geraete[0]["days_out"] == 15
    assert geraete[0]["product_name"] == "Kobold VK7"


def test_schreibweise_der_seriennummer_trennt_das_geraet_nicht(client, anna, produkt):
    _verleih(anna, produkt, "vk7-1000", tage_her=40, zurueck_nach=3)
    _verleih(anna, produkt, " VK7-1000 ", tage_her=10, zurueck_nach=3)

    kopf = _login(client, "anna@example.com")
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()

    assert len(geraete) == 1, "Gross-/Kleinschreibung darf kein zweites Geraet erfinden"
    assert geraete[0]["loans"] == 2
    # Die juengste Schreibweise wird angezeigt, sauber beschnitten.
    assert geraete[0]["serial_number"] == "VK7-1000"


def test_verschiedene_seriennummern_bleiben_getrennt(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000")
    _verleih(anna, produkt, "VK7-2000")

    kopf = _login(client, "anna@example.com")
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()

    assert {g["serial_number"] for g in geraete} == {"VK7-1000", "VK7-2000"}


def test_ohne_seriennummer_kein_geraeteeintrag(client, anna, produkt):
    _verleih(anna, produkt, None)
    _verleih(anna, produkt, "   ")

    kopf = _login(client, "anna@example.com")
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()

    assert geraete == [], "Ohne Seriennummer ist kein Geraet unterscheidbar"


def test_laufender_verleih_wird_als_aktuell_gemeldet(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=40, zurueck_nach=3)
    _verleih(anna, produkt, "VK7-1000", tage_her=2, dauer=7)

    kopf = _login(client, "anna@example.com")
    geraet = client.get("/api/v1/rentals/devices", headers=kopf).json()[0]

    assert geraet["in_use"] is True
    assert geraet["current"]["customer_name"].startswith("Anna")
    assert geraet["current"]["is_overdue"] is False


def test_ueberfaelliges_geraet_wird_als_ueberfaellig_gemeldet(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=20, dauer=7)

    kopf = _login(client, "anna@example.com")
    geraet = client.get("/api/v1/rentals/devices", headers=kopf).json()[0]

    assert geraet["current"]["is_overdue"] is True
    assert geraet["current"]["days_overdue"] == 13


def test_verspaetete_rueckgaben_werden_gezaehlt(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=60, dauer=7, zurueck_nach=12)
    _verleih(anna, produkt, "VK7-1000", tage_her=30, dauer=7, zurueck_nach=3)

    kopf = _login(client, "anna@example.com")
    geraet = client.get("/api/v1/rentals/devices", headers=kopf).json()[0]

    assert geraet["late_returns"] == 1


def test_anzahl_kunden_zaehlt_jeden_nur_einmal(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=60, zurueck_nach=3)
    _verleih(anna, produkt, "VK7-1000", tage_her=40, zurueck_nach=3)
    _verleih(anna, produkt, "VK7-1000", tage_her=20, zurueck_nach=3, kunde=anna["customer2"])

    kopf = _login(client, "anna@example.com")
    geraet = client.get("/api/v1/rentals/devices", headers=kopf).json()[0]

    assert geraet["loans"] == 3
    assert geraet["customers"] == 2


def test_geraete_draussen_stehen_oben(client, anna, produkt):
    _verleih(anna, produkt, "VK7-ZURUECK", tage_her=5, zurueck_nach=1)
    _verleih(anna, produkt, "VK7-DRAUSSEN", tage_her=20, dauer=30)

    kopf = _login(client, "anna@example.com")
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()

    assert geraete[0]["serial_number"] == "VK7-DRAUSSEN"


# ------------------------------------------------------------ Historie

def test_historie_listet_alle_ausgaben_neueste_zuerst(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=60, zurueck_nach=3)
    _verleih(anna, produkt, "VK7-1000", tage_her=10, zurueck_nach=2, kunde=anna["customer2"])

    kopf = _login(client, "anna@example.com")
    antwort = client.get(
        "/api/v1/rentals/devices/history",
        params={"product_id": produkt, "serial_number": "VK7-1000"},
        headers=kopf,
    )

    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["loans"] == 2
    assert daten["customers"] == 2
    assert daten["history"][0]["customer_name"].startswith("Berta")
    assert daten["history"][1]["customer_name"].startswith("Anna")


def test_historie_markiert_verspaetete_rueckgabe(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=40, dauer=7, zurueck_nach=15)

    kopf = _login(client, "anna@example.com")
    daten = client.get(
        "/api/v1/rentals/devices/history",
        params={"product_id": produkt, "serial_number": "VK7-1000"},
        headers=kopf,
    ).json()

    assert daten["history"][0]["returned_late"] is True
    assert daten["history"][0]["days_out"] == 15


def test_historie_findet_geraet_auch_bei_anderer_schreibweise(client, anna, produkt):
    _verleih(anna, produkt, "VK7-1000", tage_her=10, zurueck_nach=2)

    kopf = _login(client, "anna@example.com")
    antwort = client.get(
        "/api/v1/rentals/devices/history",
        params={"product_id": produkt, "serial_number": " vk7-1000 "},
        headers=kopf,
    )

    assert antwort.status_code == 200


def test_historie_zu_unbekanntem_geraet_ist_404(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    antwort = client.get(
        "/api/v1/rentals/devices/history",
        params={"product_id": produkt, "serial_number": "GIBTESNICHT"},
        headers=kopf,
    )

    assert antwort.status_code == 404


# ----------------------------------------------------------- Sichtbarkeit

def test_fremde_verleihe_tauchen_nicht_auf(client, anna, bodo, produkt):
    _verleih(anna, produkt, "VK7-ANNA", tage_her=10, zurueck_nach=2)
    _verleih(bodo, produkt, "VK7-BODO", tage_her=10, zurueck_nach=2)

    kopf = _login(client, "anna@example.com")
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()

    assert [g["serial_number"] for g in geraete] == ["VK7-ANNA"]


def test_fremde_historie_ist_nicht_abrufbar(client, anna, bodo, produkt):
    _verleih(bodo, produkt, "VK7-BODO", tage_her=10, zurueck_nach=2)

    kopf = _login(client, "anna@example.com")
    antwort = client.get(
        "/api/v1/rentals/devices/history",
        params={"product_id": produkt, "serial_number": "VK7-BODO"},
        headers=kopf,
    )

    assert antwort.status_code == 404, "Fremde Geraete duerfen nicht durchscheinen"


def test_teamleiter_sieht_alle_geraete(client, anna, bodo, chefin, produkt):
    _verleih(anna, produkt, "VK7-ANNA", tage_her=10, zurueck_nach=2)
    _verleih(bodo, produkt, "VK7-BODO", tage_her=10, zurueck_nach=2)

    kopf = _login(client, "chefin@example.com")
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()

    assert {g["serial_number"] for g in geraete} == {"VK7-ANNA", "VK7-BODO"}


def test_teamleiter_kann_auf_eine_person_einschraenken(client, anna, bodo, chefin, produkt):
    _verleih(anna, produkt, "VK7-ANNA", tage_her=10, zurueck_nach=2)
    _verleih(bodo, produkt, "VK7-BODO", tage_her=10, zurueck_nach=2)

    kopf = _login(client, "chefin@example.com")
    geraete = client.get(
        "/api/v1/rentals/devices",
        params={"employee_id": bodo["employee"]},
        headers=kopf,
    ).json()

    assert [g["serial_number"] for g in geraete] == ["VK7-BODO"]


def test_geraeteliste_braucht_anmeldung(client, produkt):
    antwort = client.get("/api/v1/rentals/devices")
    assert antwort.status_code == 401
