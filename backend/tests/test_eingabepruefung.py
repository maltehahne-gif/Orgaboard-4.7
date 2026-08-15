"""Tests fuer die Eingabepruefung an den schreibenden Endpunkten.

Alle Faelle hier sind Eingaben, die das System vorher angenommen hat. Sie
sind keine Angriffe, sondern das, was bei taeglicher Arbeit passiert: eine
verrutschte Null im Preisfeld, eine vertippte Jahreszahl, ein leeres
Namensfeld, ein Rueckgabedatum vor der Ausgabe. Jeder dieser Faelle hat die
Daten still verfaelscht - der Verkauf zaehlte mit 20 Milliarden Euro, das
Geraet war im Moment der Ausgabe ueberfaellig, der Kunde stand als leere
Zeile in jeder Liste.
"""
import os
import tempfile

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from datetime import date, timedelta  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.timeutils import local_today  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, Employee, Product, ProductPrice, Role, User  # noqa: E402

PASSWORT = "PasswortPasswort1"
QUELLE = "https://beispiel.example/preisliste"


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


@pytest.fixture
def welt():
    """Eine Mitarbeiterin, ein verkaufsfaehiges Produkt, ein Kunde."""
    db = SessionLocal()
    try:
        u = User(email="anna@example.com", full_name="Anna Mitarbeiterin",
                 password_hash=hash_password(PASSWORT), role=Role.EMPLOYEE,
                 must_change_password=False)
        db.add(u)
        db.flush()
        e = Employee(user_id=u.id, display_name="Anna Mitarbeiterin")
        db.add(e)
        p = Product(name="Staubsauger VK7", category="Reinigung", active=True, verified=True)
        db.add(p)
        db.flush()
        db.add(ProductPrice(product_id=p.id, amount_cents=129999,
                            valid_from=date(2020, 1, 1), source_url=QUELLE))
        k = Customer(employee_id=e.id, first_name="Erika", last_name="Musterfrau")
        db.add(k)
        db.commit()
        return {"produkt": p.id, "kunde": k.id, "mitarbeiter": e.id}
    finally:
        db.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def kopf(client, welt):
    antwort = client.post("/api/v1/auth/login",
                          json={"email": "anna@example.com", "password": PASSWORT})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _abgewiesen(antwort):
    assert antwort.status_code in (400, 422), (
        f"unerwartet angenommen: {antwort.status_code} {antwort.text[:200]}"
    )


# --- Kundenstammdaten -----------------------------------------------------

def test_kunde_ohne_namen_wird_abgewiesen(client, kopf):
    _abgewiesen(client.post("/api/v1/customers",
                            json={"first_name": "", "last_name": ""}, headers=kopf))


def test_kunde_aus_leerzeichen_wird_abgewiesen(client, kopf):
    """Sonst steht in jeder Liste eine leere Zeile, die niemand zuordnen kann."""
    _abgewiesen(client.post("/api/v1/customers",
                            json={"first_name": "   ", "last_name": "  "}, headers=kopf))


def test_zu_langer_name_wird_abgewiesen(client, kopf):
    """Die Spalte fasst 120 Zeichen.

    Ohne diese Pruefung kaeme der Text erst in PostgreSQL an und schluege
    dort als Serverfehler auf - im Test mit SQLite faellt das nicht auf,
    weil SQLite Laengenangaben ignoriert.
    """
    _abgewiesen(client.post("/api/v1/customers",
                            json={"first_name": "A" * 500, "last_name": "B"}, headers=kopf))


def test_randleerzeichen_werden_entfernt(client, kopf):
    antwort = client.post("/api/v1/customers",
                          json={"first_name": "  Erika ", "last_name": " Musterfrau  ",
                                "city": " Hamburg "},
                          headers=kopf)
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["first_name"] == "Erika"
    assert daten["last_name"] == "Musterfrau"
    assert daten["city"] == "Hamburg"


# --- Verkauf --------------------------------------------------------------

def test_unplausibel_hoher_stueckpreis_wird_abgewiesen(client, kopf, welt):
    """20 Millionen Euro pro Geraet - eine Null zu viel im Preisfeld."""
    _abgewiesen(client.post("/api/v1/sales", headers=kopf, json={
        "customer_id": welt["kunde"], "sold_at": "2026-08-20T09:00:00Z",
        "items": [{"product_id": welt["produkt"], "quantity": 1,
                   "unit_price_cents": 2_000_000_000}]}))


def test_verkauf_im_jahr_2099_wird_abgewiesen(client, kopf, welt):
    """Ein Verkauf ausserhalb des Zeitfensters zaehlt nirgends mit."""
    _abgewiesen(client.post("/api/v1/sales", headers=kopf, json={
        "customer_id": welt["kunde"], "sold_at": "2099-08-20T09:00:00Z",
        "items": [{"product_id": welt["produkt"], "quantity": 1,
                   "unit_price_cents": 129999}]}))


def test_normaler_verkauf_geht_weiterhin_durch(client, kopf, welt):
    """Die Grenzen duerfen den Alltag nicht behindern."""
    heute = local_today()
    antwort = client.post("/api/v1/sales", headers=kopf, json={
        "customer_id": welt["kunde"], "sold_at": f"{heute.isoformat()}T09:00:00Z",
        "items": [{"product_id": welt["produkt"], "quantity": 2,
                   "unit_price_cents": 129999}]})
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["total_cents"] == 259998


# --- Verleih --------------------------------------------------------------

def test_rueckgabefrist_vor_ausgabe_wird_abgewiesen(client, kopf, welt):
    """Sonst ist das Geraet in dem Moment ueberfaellig, in dem es rausgeht."""
    _abgewiesen(client.post("/api/v1/rentals", headers=kopf, json={
        "product_id": welt["produkt"], "customer_id": welt["kunde"],
        "issued_at": "2026-08-20T10:00:00Z", "due_at": "2026-08-10T10:00:00Z"}))


def test_rueckgabe_vor_ausgabe_wird_abgewiesen(client, kopf, welt):
    """Ergaebe in der Geraetehistorie eine negative Leihdauer."""
    _abgewiesen(client.post("/api/v1/rentals", headers=kopf, json={
        "product_id": welt["produkt"], "customer_id": welt["kunde"],
        "issued_at": "2026-08-20T10:00:00Z", "returned_at": "2026-08-01T10:00:00Z",
        "status": "returned"}))


def test_normaler_verleih_geht_weiterhin_durch(client, kopf, welt):
    antwort = client.post("/api/v1/rentals", headers=kopf, json={
        "product_id": welt["produkt"], "customer_id": welt["kunde"],
        "issued_at": "2026-08-20T10:00:00Z", "due_at": "2026-08-27T10:00:00Z"})
    assert antwort.status_code == 200, antwort.text


# --- Wiedervorlagen -------------------------------------------------------

def test_wiedervorlage_aus_1990_wird_abgewiesen(client, kopf, welt):
    """Waere ab dem ersten Tag ueberfaellig und stuende dauerhaft ganz oben."""
    _abgewiesen(client.post("/api/v1/followups", headers=kopf, json={
        "customer_id": welt["kunde"], "due_on": "1990-01-01", "note": "alt"}))


def test_wiedervorlage_im_jahr_9999_wird_abgewiesen(client, kopf, welt):
    _abgewiesen(client.post("/api/v1/followups", headers=kopf, json={
        "customer_id": welt["kunde"], "due_on": "9999-01-01", "note": "fern"}))


def test_wiedervorlage_naechste_woche_geht_durch(client, kopf, welt):
    faellig = local_today() + timedelta(days=7)
    antwort = client.post("/api/v1/followups", headers=kopf, json={
        "customer_id": welt["kunde"], "due_on": faellig.isoformat(), "note": "nachfassen"})
    assert antwort.status_code == 200, antwort.text


def test_verschieben_auf_ein_unsinniges_datum_wird_abgewiesen(client, kopf, welt):
    faellig = local_today() + timedelta(days=3)
    angelegt = client.post("/api/v1/followups", headers=kopf, json={
        "customer_id": welt["kunde"], "due_on": faellig.isoformat()})
    assert angelegt.status_code == 200, angelegt.text
    _abgewiesen(client.put(f"/api/v1/followups/{angelegt.json()['id']}",
                           headers=kopf, json={"due_on": "1990-01-01"}))


# --- Termine --------------------------------------------------------------

def test_termin_im_jahr_2206_wird_abgewiesen(client, kopf, welt):
    """Ein Tippfehler in der Jahreszahl darf keinen unsichtbaren Termin anlegen."""
    _abgewiesen(client.post("/api/v1/appointments", headers=kopf, json={
        "customer_id": welt["kunde"],
        "start_at": "2206-08-20T09:00:00Z", "end_at": "2206-08-20T10:00:00Z"}))


def test_termin_naechste_woche_geht_durch(client, kopf, welt):
    tag = (local_today() + timedelta(days=7)).isoformat()
    antwort = client.post("/api/v1/appointments", headers=kopf, json={
        "customer_id": welt["kunde"],
        "start_at": f"{tag}T09:00:00Z", "end_at": f"{tag}T10:30:00Z"})
    assert antwort.status_code == 200, antwort.text


# --- Nachrichten ----------------------------------------------------------

def test_endlose_nachricht_wird_abgewiesen(client, kopf):
    """Ein ganzes Textdokument im Chat laedt danach jeder Client bei jedem Aufruf mit."""
    _abgewiesen(client.post("/api/v1/messages", headers=kopf, json={"body": "A" * 200_000}))


def test_normale_nachricht_geht_weiterhin_durch(client, kopf):
    antwort = client.post("/api/v1/messages", headers=kopf,
                          json={"body": "Kurze Rückmeldung zum Termin heute."})
    assert antwort.status_code == 200, antwort.text
