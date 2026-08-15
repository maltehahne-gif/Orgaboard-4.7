"""Tests fuer die zentrale Preisverwaltung und den Preisimport.

Schwerpunkte:
- Ein neuer Preis schliesst den bisherigen ab. Zwei gleichzeitig offene
  Preise waeren ein stiller Fehler.
- Der Import liest deutsche und englische Zahlenschreibweise und legt
  niemals ein Produkt an, das es noch nicht gibt.
- Preise setzen ist Teamleitersache.
"""
import os
import tempfile
from datetime import date, timedelta

import pytest

# Muss vor dem Import der App gesetzt sein - get_settings() ist gecacht.
os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.timeutils import local_today  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Employee, Product, ProductPrice, Role, User  # noqa: E402

PASSWORD = "PasswortPasswort1"
QUELLE = "https://beispiel.example/preisliste"


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
        db.add(Employee(user_id=user.id, display_name=name))
        db.commit()
        return user.id
    finally:
        db.close()


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


@pytest.fixture
def produkte():
    db = SessionLocal()
    try:
        a = Product(name="Kobold VK7", category="Staubsauger", verified=True, active=True)
        b = Product(name="Thermomix TM6", category="Küche", verified=True, active=True)
        db.add_all([a, b])
        db.commit()
        return {"vk7": a.id, "tm6": b.id}
    finally:
        db.close()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _preise(produkt_id):
    db = SessionLocal()
    try:
        return db.query(ProductPrice).filter(ProductPrice.product_id == produkt_id).all()
    finally:
        db.close()


# ------------------------------------------------------- Preis setzen

def test_preis_setzen_und_abrufen(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 129900,
        "source_url": QUELLE,
        "valid_from": "2026-01-01",
    }, headers=kopf)

    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["amount_cents"] == 129900

    liste = client.get(f"/api/v1/products/{produkte['vk7']}/prices", headers=kopf).json()
    assert len(liste) == 1
    assert liste[0]["valid_from"] == "2026-01-01"


def test_neuer_preis_schliesst_den_alten_ab(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 129900, "source_url": QUELLE, "valid_from": "2026-01-01"}, headers=kopf)
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 139900, "source_url": QUELLE, "valid_from": "2026-06-01"}, headers=kopf)

    liste = client.get(f"/api/v1/products/{produkte['vk7']}/prices", headers=kopf).json()
    nach_beginn = {p["valid_from"]: p for p in liste}

    assert nach_beginn["2026-01-01"]["valid_to"] == "2026-05-31", (
        "Der alte Preis muss am Tag vor dem neuen enden"
    )
    assert nach_beginn["2026-06-01"]["valid_to"] is None


def test_nie_zwei_gleichzeitig_offene_preise(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    for betrag in (100000, 110000, 120000):
        client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
            "amount_cents": betrag, "source_url": QUELLE}, headers=kopf)

    offen = [p for p in _preise(produkte["vk7"]) if p.valid_to is None and p.verified]
    assert len(offen) == 1
    assert offen[0].amount_cents == 120000


def test_korrektur_am_selben_tag_ersetzt_den_eintrag(client, chefin, produkte):
    """Ein Preis, der nie einen Tag lang galt, gehoert nicht in den Verlauf."""
    kopf = _login(client, "chefin@example.com")
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 129900, "source_url": QUELLE, "valid_from": "2026-03-01"}, headers=kopf)
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 119900, "source_url": QUELLE, "valid_from": "2026-03-01"}, headers=kopf)

    liste = client.get(f"/api/v1/products/{produkte['vk7']}/prices", headers=kopf).json()
    assert len(liste) == 1
    assert liste[0]["amount_cents"] == 119900


def test_nachtraeglich_eingeschobener_preis_endet_beim_naechsten(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 139900, "source_url": QUELLE, "valid_from": "2026-06-01"}, headers=kopf)
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 129900, "source_url": QUELLE, "valid_from": "2026-01-01"}, headers=kopf)

    liste = client.get(f"/api/v1/products/{produkte['vk7']}/prices", headers=kopf).json()
    nach_beginn = {p["valid_from"]: p for p in liste}

    assert nach_beginn["2026-01-01"]["valid_to"] == "2026-05-31"
    assert nach_beginn["2026-06-01"]["valid_to"] is None


def test_ohne_startdatum_gilt_ab_heute(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 99900, "source_url": QUELLE}, headers=kopf)

    assert antwort.json()["valid_from"] == local_today().isoformat()


def test_negativer_preis_wird_abgelehnt(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": -100, "source_url": QUELLE}, headers=kopf)

    # 422 aus der Feldpruefung, 400 aus der Pruefung im Endpunkt - abgewiesen
    # ist abgewiesen. Entscheidend ist, dass kein Preis entsteht.
    assert antwort.status_code in (400, 422)
    preise = client.get(f"/api/v1/products/{produkte['vk7']}/prices", headers=kopf).json()
    assert all(p["amount_cents"] >= 0 for p in preise)


def test_unplausibel_hoher_preis_wird_abgelehnt(client, chefin, produkte):
    """Eine verrutschte Null darf nicht als Preis in die Auswertungen wandern."""
    kopf = _login(client, "chefin@example.com")
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 100_000_000_000, "source_url": QUELLE}, headers=kopf)

    assert antwort.status_code in (400, 422)


def test_preis_ohne_quelle_wird_abgelehnt(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 99900, "source_url": "   "}, headers=kopf)

    assert antwort.status_code == 400


def test_enddatum_vor_startdatum_wird_abgelehnt(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 99900, "source_url": QUELLE,
        "valid_from": "2026-06-01", "valid_to": "2026-05-01"}, headers=kopf)

    assert antwort.status_code == 400


def test_mitarbeiter_darf_keinen_preis_setzen(client, anna, produkte):
    kopf = _login(client, "anna@example.com")
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 99900, "source_url": QUELLE}, headers=kopf)

    assert antwort.status_code == 403


def test_preis_setzen_braucht_csrf_token(client, chefin, produkte):
    client.post("/api/v1/auth/login", json={"email": "chefin@example.com", "password": PASSWORD})
    antwort = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 99900, "source_url": QUELLE})

    assert antwort.status_code == 403


def test_preis_loeschen(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    preis = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 99900, "source_url": QUELLE}, headers=kopf).json()

    antwort = client.delete(
        f"/api/v1/products/{produkte['vk7']}/prices/{preis['id']}", headers=kopf)

    assert antwort.status_code == 200
    assert _preise(produkte["vk7"]) == []


def test_preis_eines_anderen_produkts_laesst_sich_nicht_loeschen(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    preis = client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 99900, "source_url": QUELLE}, headers=kopf).json()

    antwort = client.delete(
        f"/api/v1/products/{produkte['tm6']}/prices/{preis['id']}", headers=kopf)

    assert antwort.status_code == 404


# ---------------------------------------------------------- Uebersicht

def test_uebersicht_zeigt_produkte_ohne_preis(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 129900, "source_url": QUELLE}, headers=kopf)

    daten = client.get("/api/v1/products/prices/overview", headers=kopf).json()

    assert daten["without_price"] == 1
    ohne = [p for p in daten["products"] if p["price"] is None]
    assert [p["name"] for p in ohne] == ["Thermomix TM6"]


def test_uebersicht_zeigt_nur_den_gueltigen_preis(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    gestern = (local_today() - timedelta(days=1)).isoformat()
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 100000, "source_url": QUELLE, "valid_from": "2025-01-01"}, headers=kopf)
    client.post(f"/api/v1/products/{produkte['vk7']}/prices", json={
        "amount_cents": 129900, "source_url": QUELLE, "valid_from": gestern}, headers=kopf)

    daten = client.get("/api/v1/products/prices/overview", headers=kopf).json()
    vk7 = [p for p in daten["products"] if p["name"] == "Kobold VK7"][0]

    assert vk7["price"]["amount_cents"] == 129900
    assert vk7["history_count"] == 2


# --------------------------------------------------------------- Import

def _import(client, kopf, csv_text, **rest):
    return client.post("/api/v1/products/prices/import",
                       json={"csv": csv_text, **rest}, headers=kopf)


def test_import_setzt_preise(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = _import(client, kopf,
        "Produkt;Preis;Quelle\n"
        f"Kobold VK7;1.299,00;{QUELLE}\n"
        f"Thermomix TM6;1499,99;{QUELLE}\n")

    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["gesetzt"] == 2
    assert daten["uebersprungen"] == 0

    uebersicht = client.get("/api/v1/products/prices/overview", headers=kopf).json()
    betraege = {p["name"]: p["price"]["amount_cents"] for p in uebersicht["products"]}
    assert betraege == {"Kobold VK7": 129900, "Thermomix TM6": 149999}


def test_import_versteht_beide_zahlenschreibweisen(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    _import(client, kopf,
        "Produkt;Preis\n"
        "Kobold VK7;1.299,00\n"
        "Thermomix TM6;1299.00\n", source_url=QUELLE)

    uebersicht = client.get("/api/v1/products/prices/overview", headers=kopf).json()
    betraege = {p["price"]["amount_cents"] for p in uebersicht["products"]}
    assert betraege == {129900}


def test_import_versteht_eurozeichen(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    _import(client, kopf, "Produkt;Preis\nKobold VK7;1.299,00 €\n", source_url=QUELLE)

    uebersicht = client.get("/api/v1/products/prices/overview", headers=kopf).json()
    vk7 = [p for p in uebersicht["products"] if p["name"] == "Kobold VK7"][0]
    assert vk7["price"]["amount_cents"] == 129900


def test_import_legt_keine_neuen_produkte_an(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = _import(client, kopf,
        "Produkt;Preis\nKobold VK9000;999,00\n", source_url=QUELLE)

    daten = antwort.json()
    assert daten["gesetzt"] == 0
    assert daten["uebersprungen"] == 1
    assert "VK9000" in daten["hinweise"][0]

    db = SessionLocal()
    try:
        assert db.query(Product).count() == 2, "Ein Tippfehler darf kein Geisterprodukt erzeugen"
    finally:
        db.close()


def test_import_ueberspringt_unlesbare_preise(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    daten = _import(client, kopf,
        "Produkt;Preis\n"
        "Kobold VK7;auf Anfrage\n"
        "Thermomix TM6;1299,00\n", source_url=QUELLE).json()

    assert daten["gesetzt"] == 1
    assert daten["uebersprungen"] == 1


def test_import_ohne_quelle_setzt_nichts(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    daten = _import(client, kopf, "Produkt;Preis\nKobold VK7;1299,00\n").json()

    assert daten["gesetzt"] == 0
    assert "Quelle" in daten["hinweise"][0]


def test_import_akzeptiert_englische_spaltennamen(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    daten = _import(client, kopf,
        "name,price,source_url\n"
        f"Kobold VK7,1299.00,{QUELLE}\n").json()

    assert daten["gesetzt"] == 1


def test_import_braucht_die_preisspalte(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    antwort = _import(client, kopf, "Produkt;Bemerkung\nKobold VK7;egal\n", source_url=QUELLE)

    assert antwort.status_code == 400
    assert "Preis" in antwort.json()["detail"]


def test_import_ist_wiederholbar_und_haelt_einen_gueltigen_preis(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    _import(client, kopf, "Produkt;Preis\nKobold VK7;1299,00\n", source_url=QUELLE)
    _import(client, kopf, "Produkt;Preis\nKobold VK7;1399,00\n", source_url=QUELLE)

    offen = [p for p in _preise(produkte["vk7"]) if p.valid_to is None]
    assert len(offen) == 1
    assert offen[0].amount_cents == 139900


def test_import_liest_startdatum_aus_der_datei(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    _import(client, kopf,
        "Produkt;Preis;Gültig ab\nKobold VK7;1299,00;2026-03-01\n", source_url=QUELLE)

    liste = client.get(f"/api/v1/products/{produkte['vk7']}/prices", headers=kopf).json()
    assert liste[0]["valid_from"] == "2026-03-01"


def test_import_meldet_kaputtes_datum(client, chefin, produkte):
    kopf = _login(client, "chefin@example.com")
    daten = _import(client, kopf,
        "Produkt;Preis;Gültig ab\nKobold VK7;1299,00;01.03.2026\n", source_url=QUELLE).json()

    assert daten["gesetzt"] == 0
    assert "JJJJ-MM-TT" in daten["hinweise"][0]


def test_mitarbeiter_darf_keine_preise_importieren(client, anna, produkte):
    kopf = _login(client, "anna@example.com")
    antwort = _import(client, kopf, "Produkt;Preis\nKobold VK7;1299,00\n", source_url=QUELLE)

    assert antwort.status_code == 403


def test_import_setzt_kein_datum_in_die_zukunft_ohne_angabe(client, chefin, produkte):
    """Ohne Angabe gilt der Preis ab heute - nicht ab dem Dateidatum."""
    kopf = _login(client, "chefin@example.com")
    _import(client, kopf, "Produkt;Preis\nKobold VK7;1299,00\n", source_url=QUELLE)

    liste = client.get(f"/api/v1/products/{produkte['vk7']}/prices", headers=kopf).json()
    assert liste[0]["valid_from"] == local_today().isoformat()
    assert date.fromisoformat(liste[0]["valid_from"]) <= local_today()
