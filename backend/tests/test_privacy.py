"""Tests fuer Auskunft, Anonymisierung und Aufbewahrungsfristen.

Zwei Zusicherungen tragen den ganzen Bereich und sind hier festgehalten:

* Nach einer Loeschung bleibt **nirgends** ein Personenbezug zurueck - auch
  nicht in den Termin-Snapshots, den Notizen oder im Audit-Log.
* Die Geschaeftszahlen ueberleben. Ein Verkauf aus dem Vorjahr gehoert in
  die Umsatzstatistik, auch wenn der Kunde heute seine Loeschung verlangt.

Faellt eine der beiden, ist der Bereich entweder rechtlich unbrauchbar oder
er zerstoert die Buchhaltung.
"""
import json
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
    AppointmentType,
    AuditLog,
    Customer,
    CustomerNote,
    Employee,
    Product,
    Rental,
    RentalStatus,
    Role,
    Sale,
    SaleItem,
    User,
)
from app.services.stats import revenue_between  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


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


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


def _kunde_mit_daten(besitzer):
    """Ein Kunde mit allem, was Personenbezug tragen kann."""
    db = SessionLocal()
    try:
        kunde = Customer(
            employee_id=besitzer["employee"],
            first_name="Erika", last_name="Musterfrau",
            street="Lindenweg", house_number="7",
            postal_code="30159", city="Hannover",
            phone="0511 12345", email="erika@example.com",
            notes="Hat zwei Katzen, ruft abends lieber an",
        )
        db.add(kunde)
        db.flush()

        db.add(Appointment(
            customer_id=kunde.id, employee_id=besitzer["employee"],
            start_at=datetime.now(timezone.utc) - timedelta(days=30),
            appointment_type=AppointmentType.CUSTOMER, status=AppointmentStatus.COMPLETED,
            address_snapshot="Lindenweg 7, 30159 Hannover",
            phone_snapshot="0511 12345",
            email_snapshot="erika@example.com",
        ))

        db.add(CustomerNote(
            customer_id=kunde.id, employee_id=besitzer["employee"],
            body="Ehemann ist krank, im Herbst nochmal fragen",
        ))

        produkt = Product(name="Kobold VK7", verified=True)
        db.add(produkt)
        db.flush()

        verkauf = Sale(
            customer_id=kunde.id, employee_id=besitzer["employee"],
            sold_at=datetime.now(timezone.utc) - timedelta(days=20),
        )
        db.add(verkauf)
        db.flush()
        db.add(SaleItem(
            sale_id=verkauf.id, product_id=produkt.id,
            product_name_snapshot=produkt.name, quantity=1, unit_price_cents=250_000,
        ))

        db.commit()
        return kunde.id
    finally:
        db.close()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


# --------------------------------------------------------------- Auskunft

def test_export_enthaelt_alle_bereiche(client, anna):
    kunde = _kunde_mit_daten(anna)
    _login(client, "anna@example.com")

    daten = client.get(f"/api/v1/customers/{kunde}/export").json()

    assert daten["stammdaten"]["nachname"] == "Musterfrau"
    assert daten["stammdaten"]["telefon"] == "0511 12345"
    assert len(daten["termine"]) == 1
    assert len(daten["verkaeufe"]) == 1
    assert daten["verkaeufe"][0]["posten"][0]["einzelpreis_cent"] == 250_000
    assert len(daten["notizen_verlauf"]) == 1
    # Alle Bereiche sind vorhanden, auch wenn leer - eine Auskunft mit
    # fehlenden Abschnitten waere unvollstaendig.
    for bereich in ("vorfuehrungen", "verleih", "wiedervorlagen", "altgeraete"):
        assert bereich in daten


def test_export_braucht_zugriffsrecht(client, anna):
    kunde = _kunde_mit_daten(anna)
    _person("fremd@example.com", "Fremde Person")
    _login(client, "fremd@example.com")

    assert client.get(f"/api/v1/customers/{kunde}/export").status_code == 403


# ---------------------------------------------------------- Anonymisierung

def test_anonymisieren_entfernt_jeden_personenbezug(client, anna, chefin):
    kunde = _kunde_mit_daten(anna)
    kopf = _login(client, "chefin@example.com")

    antwort = client.post(f"/api/v1/customers/{kunde}/anonymize", headers=kopf)
    assert antwort.status_code == 200, antwort.text

    db = SessionLocal()
    try:
        c = db.get(Customer, kunde)
        assert c.first_name == "Anonymisierter"
        assert c.last_name == "Kunde"
        assert c.phone is None and c.email is None and c.notes is None
        assert c.street == "" and c.postal_code == "" and c.city == ""
        assert c.anonymized_at is not None

        # Die Kopien im Termin zaehlen genauso.
        termin = db.query(Appointment).filter(Appointment.customer_id == kunde).one()
        assert termin.address_snapshot is None
        assert termin.phone_snapshot is None
        assert termin.email_snapshot is None

        # Freitexte koennen alles enthalten.
        notiz = db.query(CustomerNote).filter(CustomerNote.customer_id == kunde).one()
        assert "Ehemann" not in notiz.body
    finally:
        db.close()


def test_umsatz_ueberlebt_die_anonymisierung(client, anna, chefin):
    """Der eigentliche Grund fuer Anonymisieren statt Zeilenloeschen."""
    kunde = _kunde_mit_daten(anna)

    von = datetime.now(timezone.utc) - timedelta(days=60)
    bis = datetime.now(timezone.utc) + timedelta(days=1)

    db = SessionLocal()
    try:
        vorher = revenue_between(db, von, bis, anna["employee"])
    finally:
        db.close()
    assert vorher == 250_000

    kopf = _login(client, "chefin@example.com")
    client.post(f"/api/v1/customers/{kunde}/anonymize", headers=kopf)

    db = SessionLocal()
    try:
        nachher = revenue_between(db, von, bis, anna["employee"])
    finally:
        db.close()

    assert nachher == vorher, "Die Umsatzzahlen dürfen sich nicht ändern"


def test_audit_log_konserviert_die_geloeschten_daten_nicht(client, anna, chefin):
    """Ein Audit-Eintrag mit dem alten Namen wuerde die Loeschung aushebeln.

    Der Kunde wird hier bewusst ueber die API angelegt und geaendert, damit
    echte Audit-Eintraege mit Namen, Telefon und Notiz entstehen - genau die
    Spur, die eine Loeschanfrage mit erfassen muss.
    """
    kopf_anna = _login(client, "anna@example.com")
    angelegt = client.post("/api/v1/customers", json={
        "first_name": "Erika", "last_name": "Musterfrau",
        "street": "Lindenweg", "house_number": "7",
        "postal_code": "30159", "city": "Hannover",
        "phone": "0511 12345", "email": "erika@example.com",
        "notes": "Hat zwei Katzen",
    }, headers=kopf_anna)
    assert angelegt.status_code == 200, angelegt.text
    kunde = angelegt.json()["id"]

    client.put(f"/api/v1/customers/{kunde}", json={
        "first_name": "Erika", "last_name": "Musterfrau",
        "street": "Lindenweg", "house_number": "9",
        "postal_code": "30159", "city": "Hannover",
        "phone": "0511 99999", "email": "erika@example.com",
        "notes": "Hat zwei Katzen",
    }, headers=kopf_anna)

    kopf = _login(client, "chefin@example.com")
    assert client.post(f"/api/v1/customers/{kunde}/anonymize", headers=kopf).status_code == 200

    db = SessionLocal()
    try:
        eintraege = db.query(AuditLog).filter(AuditLog.entity_id == kunde).all()
        assert any(e.action == "customer.anonymized" for e in eintraege), \
            "Die Löschung selbst muss protokolliert bleiben"
        text = json.dumps(
            [{"before": e.before_json, "after": e.after_json} for e in eintraege],
            default=str,
        )
    finally:
        db.close()

    for geheim in ("Musterfrau", "Erika", "0511 12345", "0511 99999",
                   "erika@example.com", "Katzen", "Lindenweg"):
        assert geheim not in text, f"{geheim!r} steht noch im Audit-Log"


def test_nur_teamleiter_darf_anonymisieren(client, anna):
    kunde = _kunde_mit_daten(anna)
    kopf = _login(client, "anna@example.com")

    assert client.post(f"/api/v1/customers/{kunde}/anonymize", headers=kopf).status_code == 403

    db = SessionLocal()
    try:
        assert db.get(Customer, kunde).anonymized_at is None
    finally:
        db.close()


def test_anonymisieren_braucht_csrf_token(client, anna, chefin):
    kunde = _kunde_mit_daten(anna)
    client.post("/api/v1/auth/login", json={"email": "chefin@example.com", "password": PASSWORD})

    assert client.post(f"/api/v1/customers/{kunde}/anonymize").status_code == 403


def test_zweimal_anonymisieren_wird_abgelehnt(client, anna, chefin):
    kunde = _kunde_mit_daten(anna)
    kopf = _login(client, "chefin@example.com")

    assert client.post(f"/api/v1/customers/{kunde}/anonymize", headers=kopf).status_code == 200
    assert client.post(f"/api/v1/customers/{kunde}/anonymize", headers=kopf).status_code == 400


# ------------------------------------------------------- Aufbewahrung

def test_stille_kunden_werden_vorgeschlagen(client, anna, chefin):
    db = SessionLocal()
    try:
        alt = Customer(employee_id=anna["employee"], first_name="Alt", last_name="Kunde",
                       created_at=datetime.now(timezone.utc) - timedelta(days=365 * 5))
        neu = Customer(employee_id=anna["employee"], first_name="Neu", last_name="Kunde")
        db.add_all([alt, neu])
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/customers/privacy/retention?jahre=3", headers=kopf).json()

    namen = [k["name"] for k in daten["kandidaten"]]
    assert "Alt Kunde" in namen
    assert "Neu Kunde" not in namen


def test_laufender_verleih_schuetzt_vor_dem_vorschlag(client, anna, chefin):
    """Ein Gerät beim Kunden ist ein offener Vorgang - der Kunde bleibt."""
    db = SessionLocal()
    try:
        kunde = Customer(employee_id=anna["employee"], first_name="Alt", last_name="MitGeraet",
                         created_at=datetime.now(timezone.utc) - timedelta(days=365 * 5))
        produkt = Product(name="Kobold VK7", verified=True)
        db.add_all([kunde, produkt])
        db.flush()
        db.add(Rental(
            product_id=produkt.id, customer_id=kunde.id, employee_id=anna["employee"],
            issued_at=datetime.now(timezone.utc) - timedelta(days=365 * 4),
            status=RentalStatus.RENTED,
        ))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/customers/privacy/retention?jahre=3", headers=kopf).json()

    assert "Alt MitGeraet" not in [k["name"] for k in daten["kandidaten"]]


def test_aufbewahrungsliste_nur_fuer_teamleiter(client, anna):
    kopf = _login(client, "anna@example.com")
    assert client.get("/api/v1/customers/privacy/retention", headers=kopf).status_code == 403
