"""Tests fuer den Altgeraete-Bereich.

Schwerpunkt ist die Sichtbarkeit: ein Mitarbeiter darf fremde Altgeraete
weder sehen noch aendern noch loeschen. Dazu kommen Suche, Filter und die
Zusicherung, dass ein geloeschter Verkauf das Altgeraet nicht mitreisst.
"""
import os
import tempfile
from datetime import date, datetime, timezone

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
    Role,
    Sale,
    TradeIn,
    TradeInCondition,
    TradeInStatus,
    User,
)

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


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


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _altgeraet(besitzer, model="Kobold VK150", serial="SN-1", **rest):
    db = SessionLocal()
    try:
        row = TradeIn(
            customer_id=besitzer["customer"],
            employee_id=besitzer["employee"],
            model=model,
            serial_number=serial,
            received_on=date(2026, 5, 4),
            created_at=datetime.now(timezone.utc),
            **rest,
        )
        db.add(row)
        db.commit()
        return row.id
    finally:
        db.close()


# ------------------------------------------------------------- Anlegen

def test_anlegen_und_auflisten(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/tradeins", json={
        "customer_id": anna["customer"],
        "model": "Kobold VK140",
        "serial_number": "SN-4711",
        "condition": "defective",
        "received_on": "2026-05-04",
        "notes": "Kabel beschädigt",
    }, headers=kopf)

    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["model"] == "Kobold VK140"
    assert daten["condition_label"] == "Defekt"
    assert daten["status_label"] == "Angenommen"

    liste = client.get("/api/v1/tradeins", headers=kopf).json()
    assert len(liste) == 1


def test_anlegen_braucht_csrf_token(client, anna):
    client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    antwort = client.post("/api/v1/tradeins", json={
        "customer_id": anna["customer"], "model": "Kobold", "received_on": "2026-05-04"})
    assert antwort.status_code == 403


def test_unbekannter_kunde_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/tradeins", json={
        "customer_id": "gibtsnicht", "model": "Kobold", "received_on": "2026-05-04"}, headers=kopf)
    assert antwort.status_code == 404


# --------------------------------------------------------- Sichtbarkeit

def test_mitarbeiter_sieht_fremde_altgeraete_nicht(client, anna, bodo):
    _altgeraet(anna, model="Annas Gerät")
    _altgeraet(bodo, model="Bodos Gerät")

    kopf = _login(client, "anna@example.com")
    liste = client.get("/api/v1/tradeins", headers=kopf).json()

    assert [row["model"] for row in liste] == ["Annas Gerät"]


def test_mitarbeiter_darf_fremdes_altgeraet_nicht_aendern(client, anna, bodo):
    fremd = _altgeraet(bodo)
    kopf = _login(client, "anna@example.com")

    assert client.put(f"/api/v1/tradeins/{fremd}", json={"model": "geklaut"},
                      headers=kopf).status_code == 403
    assert client.delete(f"/api/v1/tradeins/{fremd}", headers=kopf).status_code == 403

    db = SessionLocal()
    try:
        assert db.get(TradeIn, fremd).model == "Kobold VK150"
    finally:
        db.close()


def test_teamleiter_sieht_alles(client, anna, bodo, chefin):
    _altgeraet(anna, model="Annas Gerät")
    _altgeraet(bodo, model="Bodos Gerät")

    kopf = _login(client, "chefin@example.com")
    liste = client.get("/api/v1/tradeins", headers=kopf).json()
    assert {row["model"] for row in liste} == {"Annas Gerät", "Bodos Gerät"}

    # ... und kann auf einen Mitarbeiter einschraenken.
    gefiltert = client.get(f"/api/v1/tradeins?employee_id={bodo['employee']}", headers=kopf).json()
    assert [row["model"] for row in gefiltert] == ["Bodos Gerät"]


# ----------------------------------------------------- Suche und Filter

def test_suche_ueber_modell_seriennummer_und_kunde(client, anna):
    _altgeraet(anna, model="Kobold VK150", serial="SN-AAA")
    _altgeraet(anna, model="Thermomix TM5", serial="SN-BBB")
    kopf = _login(client, "anna@example.com")

    def suche(begriff):
        return [r["model"] for r in client.get(f"/api/v1/tradeins?q={begriff}", headers=kopf).json()]

    assert suche("kobold") == ["Kobold VK150"]
    assert suche("SN-BBB") == ["Thermomix TM5"]
    # Der Kundenname trifft beide Geraete.
    assert len(suche("Anna")) == 2
    assert suche("gibtsnicht") == []


def test_filter_nach_status_und_zustand(client, anna):
    _altgeraet(anna, model="Eingelagert", serial="S1", status=TradeInStatus.STORED)
    _altgeraet(anna, model="Entsorgt", serial="S2", status=TradeInStatus.DISPOSED,
               condition=TradeInCondition.DEFECTIVE)
    kopf = _login(client, "anna@example.com")

    nach_status = client.get("/api/v1/tradeins?status=stored", headers=kopf).json()
    assert [r["model"] for r in nach_status] == ["Eingelagert"]

    nach_zustand = client.get("/api/v1/tradeins?condition=defective", headers=kopf).json()
    assert [r["model"] for r in nach_zustand] == ["Entsorgt"]


def test_zusammenfassung_zaehlt_je_status(client, anna):
    _altgeraet(anna, serial="S1", status=TradeInStatus.STORED)
    _altgeraet(anna, serial="S2", status=TradeInStatus.STORED)
    _altgeraet(anna, serial="S3", status=TradeInStatus.DISPOSED)

    kopf = _login(client, "anna@example.com")
    daten = client.get("/api/v1/tradeins/summary", headers=kopf).json()

    assert daten["total"] == 3
    assert daten["stored"] == 2
    assert daten["disposed"] == 1
    assert daten["received"] == 0


# --------------------------------------------------------- Verkaufsbezug

def test_altgeraet_ueberlebt_das_loeschen_des_verkaufs(client, anna):
    """Ein geloeschter Verkauf darf das Altgeraet nicht mitreissen - sonst
    verschwindet ein real vorhandenes Geraet aus dem Bestand."""
    db = SessionLocal()
    try:
        verkauf = Sale(
            customer_id=anna["customer"],
            employee_id=anna["employee"],
            sold_at=datetime.now(timezone.utc),
        )
        db.add(verkauf)
        db.commit()
        verkauf_id = verkauf.id
    finally:
        db.close()

    geraet = _altgeraet(anna, sale_id=verkauf_id)

    db = SessionLocal()
    try:
        db.delete(db.get(Sale, verkauf_id))
        db.commit()
    finally:
        db.close()

    db = SessionLocal()
    try:
        row = db.get(TradeIn, geraet)
        assert row is not None, "Altgerät wurde mit dem Verkauf gelöscht"
        assert row.sale_id is None
    finally:
        db.close()


def test_aendern_setzt_status_und_bleibt_protokolliert(client, anna):
    geraet = _altgeraet(anna)
    kopf = _login(client, "anna@example.com")

    antwort = client.put(f"/api/v1/tradeins/{geraet}", json={
        "status": "disposed", "notes": "nicht mehr zu retten"}, headers=kopf)

    assert antwort.status_code == 200
    assert antwort.json()["status_label"] == "Entsorgt"
    assert antwort.json()["notes"] == "nicht mehr zu retten"
