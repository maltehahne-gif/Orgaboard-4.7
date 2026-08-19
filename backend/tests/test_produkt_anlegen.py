"""Tests fuer den Dialog "Neues Produkt" (POST /products/import).

Hintergrund: in der Produktion brach "Produkt speichern" mit einem 422 ab,
weil das Frontend source_url nur beim Preis mitschickte, nicht beim Produkt
selbst. Der Vertrag zwischen beiden Seiten wird hier festgenagelt - samt der
Faelle, in denen der Server bewusst ablehnt, damit die Meldung im Dialog
nachvollziehbar bleibt.
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
from app.core.timeutils import local_today  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Employee, Product, ProductPrice, Role, User  # noqa: E402

PASSWORD = "PasswortPasswort1"

# Genau das, was der Dialog "Neues Produkt" fuer einen von Hand angelegten
# Eintrag verwendet - siehe QUELLE_MANUELL in frontend/src/pages/ProductsPage.tsx.
QUELLE_MANUELL = "manual-entry"


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
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=role, must_change_password=False)
        db.add(user)
        db.flush()
        db.add(Employee(user_id=user.id, display_name=name))
        db.commit()
        return user.id
    finally:
        db.close()


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _dialog_payload(**overrides):
    """Genau der Rumpf, den der Dialog "Neues Produkt" schickt."""
    payload = {
        "name": "Kobold VK7 Akku-Staubsauger",
        "category": "Akku-Staubsauger",
        "description": "Kabelloser Staubsauger mit Wechselakku.",
        "functions": [],
        "variants": [],
        "accessories": [],
        "source_url": QUELLE_MANUELL,
        "source_kind": "manual_verified",
        "verified": True,
        "price": {
            "amount_cents": 94900,
            "currency": "EUR",
            "source_url": QUELLE_MANUELL,
            "verified": True,
        },
    }
    payload.update(overrides)
    return payload


def _preise(produkt_id):
    db = SessionLocal()
    try:
        return db.query(ProductPrice).filter(ProductPrice.product_id == produkt_id).all()
    finally:
        db.close()


# ------------------------------------------------------------ Anlegen

def test_dialog_payload_legt_produkt_mit_preis_an(client, chefin):
    """Der Fall aus dem Fehlerbericht: speichern muss einfach gehen."""
    kopf = _login(client, "chefin@example.com")
    antwort = client.post("/api/v1/products/import", json=_dialog_payload(), headers=kopf)

    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["name"] == "Kobold VK7 Akku-Staubsauger"
    assert daten["verified"] is True
    assert daten["price"]["amount_cents"] == 94900


def test_produkt_erscheint_nach_dem_speichern_in_der_liste(client, chefin):
    """"Nach Reload noch da" - ohne das zaehlt Speichern nicht."""
    kopf = _login(client, "chefin@example.com")
    client.post("/api/v1/products/import", json=_dialog_payload(), headers=kopf)

    liste = client.get("/api/v1/products", headers=kopf).json()
    namen = [p["name"] for p in liste]
    assert "Kobold VK7 Akku-Staubsauger" in namen


def test_fehlendes_source_url_meldet_das_feld_statt_still_zu_scheitern(client, chefin):
    """Der urspruengliche Fehler - der Server muss sagen, welches Feld fehlt."""
    kopf = _login(client, "chefin@example.com")
    ohne_quelle = _dialog_payload()
    ohne_quelle.pop("source_url")

    antwort = client.post("/api/v1/products/import", json=ohne_quelle, headers=kopf)
    assert antwort.status_code == 422

    detail = antwort.json()["detail"]
    assert isinstance(detail, list)
    # Genau diese Struktur normalisiert das Frontend zu "source_url: Field required".
    assert any("source_url" in eintrag["loc"] for eintrag in detail)


def test_leeres_source_url_bei_verifiziertem_produkt_wird_abgelehnt(client, chefin):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post("/api/v1/products/import", json=_dialog_payload(source_url="   "), headers=kopf)
    assert antwort.status_code == 400
    assert "Quelle" in antwort.json()["detail"]


def test_leerer_name_wird_abgelehnt(client, chefin):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post("/api/v1/products/import", json=_dialog_payload(name="   "), headers=kopf)
    assert antwort.status_code == 400
    assert antwort.json()["detail"] == "Ein Produkt braucht einen Namen"


def test_negativer_preis_wird_abgelehnt(client, chefin):
    kopf = _login(client, "chefin@example.com")
    payload = _dialog_payload()
    payload["price"]["amount_cents"] = -1
    antwort = client.post("/api/v1/products/import", json=payload, headers=kopf)
    assert antwort.status_code == 422


def test_absurd_hoher_preis_wird_abgelehnt(client, chefin):
    kopf = _login(client, "chefin@example.com")
    payload = _dialog_payload()
    payload["price"]["amount_cents"] = 99_999_999_999
    antwort = client.post("/api/v1/products/import", json=payload, headers=kopf)
    assert antwort.status_code == 422


def test_produkt_ohne_preis_ist_erlaubt(client, chefin):
    """Ein Preis darf spaeter kommen - das Produkt selbst zaehlt trotzdem."""
    kopf = _login(client, "chefin@example.com")
    ohne_preis = _dialog_payload()
    ohne_preis.pop("price")
    antwort = client.post("/api/v1/products/import", json=ohne_preis, headers=kopf)
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["price"] is None


# --------------------------------------------------- Zweimal speichern

def test_zweites_speichern_erzeugt_kein_zweites_produkt(client, chefin):
    """Doppelklick oder Nachbessern darf keine Dublette erzeugen."""
    kopf = _login(client, "chefin@example.com")
    erste = client.post("/api/v1/products/import", json=_dialog_payload(), headers=kopf)
    zweite = client.post("/api/v1/products/import", json=_dialog_payload(), headers=kopf)

    assert erste.status_code == 200
    assert zweite.status_code == 200
    assert erste.json()["id"] == zweite.json()["id"]

    db = SessionLocal()
    try:
        assert db.query(Product).filter(Product.name == "Kobold VK7 Akku-Staubsauger").count() == 1
    finally:
        db.close()


def test_geaenderter_preis_laesst_keine_zwei_gueltigen_preise_stehen(client, chefin):
    """Der stille Fehler: zwei offene Preise am selben Tag.

    Frueher legte der Import den Preis an der Preiszeitachse vorbei an. Nach
    dem zweiten Speichern galten zwei Preise gleichzeitig, und welcher
    angezeigt wurde, entschied die Sortierung.
    """
    kopf = _login(client, "chefin@example.com")
    erst = client.post("/api/v1/products/import", json=_dialog_payload(), headers=kopf).json()

    geaendert = _dialog_payload()
    geaendert["price"]["amount_cents"] = 99900
    zweit = client.post("/api/v1/products/import", json=geaendert, headers=kopf).json()

    assert zweit["price"]["amount_cents"] == 99900

    gueltige = [
        p for p in _preise(erst["id"])
        if p.verified and (p.valid_to is None or p.valid_to >= local_today())
    ]
    assert len(gueltige) == 1
    assert gueltige[0].amount_cents == 99900


def test_preis_bekommt_ein_gueltig_ab_statt_offener_zeitachse(client, chefin):
    kopf = _login(client, "chefin@example.com")
    daten = client.post("/api/v1/products/import", json=_dialog_payload(), headers=kopf).json()
    preise = _preise(daten["id"])
    assert len(preise) == 1
    assert preise[0].valid_from == local_today()


# --------------------------------------------------------- Berechtigung

def test_mitarbeiterin_darf_kein_produkt_anlegen(client, anna):
    """Sichtbar oder nutzbar - der Dialog steht Mitarbeitern gar nicht offen."""
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/products/import", json=_dialog_payload(), headers=kopf)
    assert antwort.status_code == 403


def test_ohne_csrf_token_abgelehnt(client, chefin):
    _login(client, "chefin@example.com")
    antwort = client.post("/api/v1/products/import", json=_dialog_payload())
    assert antwort.status_code == 403


def test_ohne_anmeldung_abgelehnt(client):
    antwort = client.post("/api/v1/products/import", json=_dialog_payload())
    assert antwort.status_code in (401, 403)
