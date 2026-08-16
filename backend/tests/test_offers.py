"""Tests fuer das Angebotssystem: Erstellung, Statuswechsel, Umwandlung.

Schwerpunkt: ein Angebot laesst sich ohne erneute Eingabe der Produkte in
einen Verkauf umwandeln, Rabatte bleiben Teamleitern vorbehalten, und ein
fremdes Angebot bleibt fuer einen Mitarbeiter unsichtbar - wie bei Verkauf
und Altgeraet auch.
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
from app.models import Customer, Employee, Offer, OfferStatus, Product, Role, User  # noqa: E402
from app.services.timeline import FunnelStage, funnel_stage  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


def _person(email, name, role=Role.EMPLOYEE):
    db = SessionLocal()
    try:
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=role, must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name)
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Anna", last_name=name.split()[0],
                          email="kunde@example.com")
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


@pytest.fixture
def produkt():
    db = SessionLocal()
    try:
        p = Product(name="VK7", verified=True, active=True)
        db.add(p)
        db.commit()
        return p.id
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


def _payload(anna, produkt, **overrides):
    base = {
        "customer_id": anna["customer"],
        "items": [{"product_id": produkt, "quantity": 2, "unit_price_cents": 100000}],
    }
    base.update(overrides)
    return base


# ------------------------------------------------------------- Anlegen

def test_anlegen_vergibt_fortlaufende_nummer(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    a = client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf).json()
    b = client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf).json()

    year = local_today().year
    assert a["number"] == f"AN-{year}-0001"
    assert b["number"] == f"AN-{year}-0002"
    assert a["status"] == "draft"
    assert a["subtotal_cents"] == 200000
    assert a["total_cents"] == 200000


def test_anlegen_braucht_csrf_token(client, anna, produkt):
    client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    antwort = client.post("/api/v1/offers", json=_payload(anna, produkt))
    assert antwort.status_code == 403


def test_ohne_produkte_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/offers", json={"customer_id": anna["customer"], "items": []}, headers=kopf)
    assert antwort.status_code == 400


def test_mitarbeiter_darf_keinen_rabatt_gewaehren(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    antwort = client.post(
        "/api/v1/offers", json=_payload(anna, produkt, discount_percent=10), headers=kopf,
    )
    assert antwort.status_code == 403


def test_teamleiter_darf_rabatt_gewaehren(client, anna, chefin, produkt):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post(
        "/api/v1/offers",
        json=_payload(anna, produkt, employee_id=anna["employee"], discount_percent=10),
        headers=kopf,
    )
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["discount_cents"] == 20000
    assert daten["total_cents"] == 180000


# --------------------------------------------------------- Sichtbarkeit

def test_mitarbeiter_sieht_fremdes_angebot_nicht(client, anna, bodo, produkt):
    kopf_bodo = _login(client, "bodo@example.com")
    fremd = client.post("/api/v1/offers", json=_payload(bodo, produkt), headers=kopf_bodo).json()

    kopf_anna = _login(client, "anna@example.com")
    liste = client.get("/api/v1/offers", headers=kopf_anna).json()
    assert liste == []
    assert client.get(f"/api/v1/offers/{fremd['id']}", headers=kopf_anna).status_code == 403


def test_teamleiter_sieht_alle_angebote(client, anna, bodo, chefin, produkt):
    kopf_anna = _login(client, "anna@example.com")
    client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf_anna)
    kopf_bodo = _login(client, "bodo@example.com")
    client.post("/api/v1/offers", json=_payload(bodo, produkt), headers=kopf_bodo)

    kopf_chefin = _login(client, "chefin@example.com")
    liste = client.get("/api/v1/offers", headers=kopf_chefin).json()
    assert len(liste) == 2


# ------------------------------------------------------- Statuswechsel

def test_status_workflow_senden_annehmen(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    offer = client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf).json()

    gesendet = client.post(f"/api/v1/offers/{offer['id']}/send", headers=kopf).json()
    assert gesendet["status"] == "sent"

    angenommen = client.post(f"/api/v1/offers/{offer['id']}/accept", headers=kopf).json()
    assert angenommen["status"] == "accepted"

    # Ein angenommenes Angebot laesst sich nicht mehr ablehnen.
    antwort = client.post(f"/api/v1/offers/{offer['id']}/reject", json={}, headers=kopf)
    assert antwort.status_code == 409


def test_abgelaufenes_angebot_wird_beim_lesen_erkannt(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    offer = client.post(
        "/api/v1/offers",
        json=_payload(anna, produkt, valid_until=str(local_today() - timedelta(days=1))),
        headers=kopf,
    ).json()
    client.post(f"/api/v1/offers/{offer['id']}/send", headers=kopf)

    gelesen = client.get(f"/api/v1/offers/{offer['id']}", headers=kopf).json()
    assert gelesen["status"] == "expired"
    assert gelesen["status_label"] == "Abgelaufen"
    # Der gespeicherte Status bleibt "sent" - abgeleitet, nicht geschrieben.
    assert gelesen["stored_status"] == "sent"
    assert gelesen["can_accept"] is False


def test_nur_entwurf_laesst_sich_loeschen(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    offer = client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf).json()
    client.post(f"/api/v1/offers/{offer['id']}/send", headers=kopf)

    antwort = client.delete(f"/api/v1/offers/{offer['id']}", headers=kopf)
    assert antwort.status_code == 409


def test_entwurf_laesst_sich_loeschen(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    offer = client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf).json()

    antwort = client.delete(f"/api/v1/offers/{offer['id']}", headers=kopf)
    assert antwort.status_code == 200

    db = SessionLocal()
    try:
        assert db.get(Offer, offer["id"]) is None
    finally:
        db.close()


# --------------------------------------------------- Umwandlung in Verkauf

def test_umwandlung_uebernimmt_produkte_mengen_und_preise(client, anna, chefin, produkt):
    kopf_chefin = _login(client, "chefin@example.com")
    offer = client.post(
        "/api/v1/offers",
        json=_payload(anna, produkt, employee_id=anna["employee"], discount_percent=10),
        headers=kopf_chefin,
    ).json()

    antwort = client.post(f"/api/v1/offers/{offer['id']}/convert-to-sale", json={}, headers=kopf_chefin)
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()

    assert daten["offer"]["status"] == "converted"
    assert daten["offer"]["converted_sale_id"] == daten["sale"]["id"]

    verkauf = daten["sale"]
    assert len(verkauf["items"]) == 1
    assert verkauf["items"][0]["quantity"] == 2
    # 1.000,00 EUR minus 10% Rabatt je Position uebernommen.
    assert verkauf["items"][0]["unit_price_cents"] == 90000
    assert verkauf["total_cents"] == 180000

    # Ein umgewandeltes Angebot laesst sich nicht ein zweites Mal umwandeln.
    zweite = client.post(f"/api/v1/offers/{offer['id']}/convert-to-sale", json={}, headers=kopf_chefin)
    assert zweite.status_code == 409


def test_umwandlung_ohne_positionen_scheitert_nicht_mit_serverfehler(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    offer = client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf).json()

    db = SessionLocal()
    try:
        from app.models import OfferItem
        for item in db.query(OfferItem).filter(OfferItem.offer_id == offer["id"]).all():
            db.delete(item)
        db.commit()
    finally:
        db.close()

    antwort = client.post(f"/api/v1/offers/{offer['id']}/convert-to-sale", json={}, headers=kopf)
    assert antwort.status_code == 400


# ------------------------------------------------------------------- PDF

def test_pdf_export(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    offer = client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf).json()

    antwort = client.get(f"/api/v1/offers/{offer['id']}/pdf", headers=kopf)
    assert antwort.status_code == 200
    assert antwort.headers["content-type"] == "application/pdf"
    assert antwort.content[:4] == b"%PDF"


# --------------------------------------------------------------- Trichter

def test_funnel_stage_zeigt_angebot(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/offers", json=_payload(anna, produkt), headers=kopf)

    db = SessionLocal()
    try:
        assert funnel_stage(db, anna["customer"]) == FunnelStage.OFFER
    finally:
        db.close()
