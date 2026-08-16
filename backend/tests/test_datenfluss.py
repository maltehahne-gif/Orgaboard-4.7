"""Durchstich: ein Vorgang muss in allen Bereichen gleich ankommen.

Die einzelnen Bereiche sind je fuer sich getestet. Was bisher fehlte, ist
der Nachweis, dass sie dieselbe Wirklichkeit zeigen: ein Verkauf, der in
der Verkaufsliste steht, aber nicht im Dashboard, ist schlimmer als gar
keiner - man merkt es nicht, und die Zahlen widersprechen sich still.

Geprueft wird deshalb entlang der Kette

    Kunde -> Termin -> Vorfuehrung -> Verkauf -> Dashboard -> Bericht

und zwar mit *einem* Vorgang, dessen Betrag in jedem Bereich derselbe sein
muss. Dazu die Gegenprobe: ein Storno muss ueberall gleichzeitig
verschwinden.
"""
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
from app.core.timeutils import local_today, week_bounds  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Customer,
    Employee,
    Product,
    ProductPrice,
    Role,
    User,
)

PASSWORD = "PasswortPasswort1"

# Ein Betrag, der sich in keiner Zwischenrechnung glatt kuerzen laesst -
# ein Rundungsfehler faellt damit auf, statt sich zu verstecken.
PREIS_CENT = 129999


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


@pytest.fixture
def welt():
    """Mitarbeiterin, Teamleiterin, ein Kunde und ein Produkt mit Preis."""
    db = SessionLocal()
    try:
        anna = User(email="anna@example.com", full_name="Anna Mitarbeiterin",
                    password_hash=hash_password(PASSWORD), role=Role.EMPLOYEE,
                    must_change_password=False)
        chefin = User(email="chefin@example.com", full_name="Clara Chefin",
                      password_hash=hash_password(PASSWORD), role=Role.TEAM_LEADER,
                      must_change_password=False)
        db.add_all([anna, chefin])
        db.flush()

        e_anna = Employee(user_id=anna.id, display_name="Anna Mitarbeiterin",
                          monthly_units_target=20)
        e_chefin = Employee(user_id=chefin.id, display_name="Clara Chefin")
        db.add_all([e_anna, e_chefin])
        db.flush()

        kunde = Customer(employee_id=e_anna.id, first_name="Karl", last_name="Kunde",
                         street="Bergweg", house_number="12",
                         postal_code="30161", city="Hannover", phone="0511 123456")
        db.add(kunde)

        produkt = Product(name="Kobold VK7", category="Staubsauger",
                          verified=True, active=True)
        db.add(produkt)
        db.flush()
        db.add(ProductPrice(product_id=produkt.id, amount_cents=PREIS_CENT,
                            source_url="Preisliste", verified=True,
                            valid_from=local_today() - timedelta(days=30)))
        db.commit()

        return {"anna": anna.id, "e_anna": e_anna.id, "chefin": chefin.id,
                "kunde": kunde.id, "produkt": produkt.id}
    finally:
        db.close()


def _login(client, email="anna@example.com"):
    a = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert a.status_code == 200, a.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _zeitpunkt_diese_woche() -> str:
    """Ein Zeitpunkt, der in allen Auswertungen mitzaehlt.

    Zwei Bedingungen muessen gleichzeitig gelten, und die frueheren feste
    Mittagszeit erfuellte nur eine davon:

    * Nicht in der Zukunft. Auswertungen, die von heute rueckwaerts rechnen -
      etwa die Produktanalyse ueber die letzten 90 Tage - enden bei "jetzt".
      Ein Verkauf um 12 Uhr taucht dort vormittags nicht auf, nachmittags
      schon. Der Test schlug damit nur vor der Mittagszeit fehl.
    * Nicht vor dem Wochenbeginn, sonst faellt der Verkauf aus der Woche.
    """
    start, _ = week_bounds()
    jetzt = datetime.now(timezone.utc)
    return min(max(start + timedelta(minutes=1), jetzt - timedelta(hours=1)), jetzt).isoformat()


def _verkauf_anlegen(client, kopf, welt, cent=PREIS_CENT, menge=1):
    antwort = client.post("/api/v1/sales", json={
        "customer_id": welt["kunde"],
        "sold_at": _zeitpunkt_diese_woche(),
        "channel": "field",
        "items": [{"product_id": welt["produkt"], "quantity": menge,
                   "unit_price_cents": cent}],
    }, headers=kopf)
    assert antwort.status_code in (200, 201), antwort.text
    return antwort.json()


# ================================================ Der Verkauf kommt ueberall an

def test_ein_verkauf_erscheint_in_allen_bereichen(client, welt):
    kopf = _login(client)
    _verkauf_anlegen(client, kopf, welt)

    # 1. Verkaufsliste
    verkaeufe = client.get("/api/v1/sales", headers=kopf).json()
    assert len(verkaeufe) == 1
    assert verkaeufe[0]["total_cents"] == PREIS_CENT

    # 2. Kundenakte
    zeitleiste = client.get(f"/api/v1/customers/{welt['kunde']}/timeline", headers=kopf).json()
    assert any(e["kind"] == "sale" for e in zeitleiste["events"])

    # 3. Trichterstufe des Kunden wandert auf "Verkauf"
    assert zeitleiste["funnel_stage"] == "sale"

    # 4. Dashboard
    dash = client.get("/api/v1/dashboard", headers=kopf).json()
    assert dash["revenue_month_cents"] == PREIS_CENT
    assert dash["revenue_week_cents"] == PREIS_CENT

    # 5. Bericht der laufenden Woche
    bericht = client.get("/api/v1/reports/week", headers=kopf).json()
    assert bericht["metrics"]["revenue_cents"] == PREIS_CENT
    assert bericht["metrics"]["sales"] == 1

    # 6. Produktanalyse des Assistenten
    produkte = client.get("/api/v1/assistant/insights/products", headers=kopf).json()
    assert produkte["products"][0]["revenue_cents"] == PREIS_CENT

    # 7. Trichter des Assistenten
    trichter = client.get("/api/v1/assistant/insights/funnel", headers=kopf).json()
    nach_stufe = {z["stage"]: z["count"] for z in trichter["stages"]}
    assert nach_stufe["sale"] == 1

    # 8. Zielprognose zaehlt die Einheit mit
    ziel = client.get("/api/v1/assistant/insights/goal", headers=kopf).json()
    assert ziel["units_month"] >= 1


def test_alle_bereiche_nennen_denselben_betrag(client, welt):
    """Der Kern: kein Bereich darf einen anderen Betrag zeigen."""
    kopf = _login(client)
    _verkauf_anlegen(client, kopf, welt, menge=3)
    erwartet = PREIS_CENT * 3

    betraege = {
        "Verkaufsliste": client.get("/api/v1/sales", headers=kopf).json()[0]["total_cents"],
        "Dashboard Monat": client.get("/api/v1/dashboard", headers=kopf).json()["revenue_month_cents"],
        "Wochenbericht": client.get("/api/v1/reports/week", headers=kopf).json()["metrics"]["revenue_cents"],
        "Monatsbericht": client.get("/api/v1/reports/month", headers=kopf).json()["metrics"]["revenue_cents"],
        "Produktanalyse": client.get("/api/v1/assistant/insights/products", headers=kopf).json()["products"][0]["revenue_cents"],
    }

    abweichend = {k: v for k, v in betraege.items() if v != erwartet}
    assert not abweichend, f"Diese Bereiche zeigen einen anderen Betrag: {abweichend}"


def test_storno_verschwindet_ueberall_gleichzeitig(client, welt):
    """Ein Storno darf nirgends stehen bleiben - auch nicht in einer Auswertung."""
    kopf = _login(client)
    verkauf = _verkauf_anlegen(client, kopf, welt)

    kopf_chefin = _login(client, "chefin@example.com")
    storno = client.post(f"/api/v1/sales/{verkauf['id']}/cancel",
                         json={"reason": "Kunde ist zurückgetreten"}, headers=kopf_chefin)
    assert storno.status_code == 200, storno.text

    kopf = _login(client)
    assert client.get("/api/v1/dashboard", headers=kopf).json()["revenue_month_cents"] == 0
    assert client.get("/api/v1/reports/week", headers=kopf).json()["metrics"]["revenue_cents"] == 0
    assert client.get("/api/v1/reports/week", headers=kopf).json()["metrics"]["sales"] == 0
    assert client.get("/api/v1/assistant/insights/products", headers=kopf).json()["products"] == []

    # Der Verkauf selbst bleibt erhalten - nur eben als storniert.
    verkaeufe = client.get("/api/v1/sales", headers=kopf).json()
    assert len(verkaeufe) == 1
    assert verkaeufe[0]["cancelled"] is True


# ============================================ Termin -> Nachfassen -> Kunde

def test_termin_ohne_abschluss_erzeugt_nachfassbedarf(client, welt):
    """Die Kette Termin -> kein Abschluss -> Wiedervorlage -> Kundenakte."""
    kopf = _login(client)

    termin = client.post("/api/v1/appointments", json={
        "customer_id": welt["kunde"],
        "start_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        "appointment_type": "customer",
    }, headers=kopf)
    assert termin.status_code in (200, 201), termin.text
    termin_id = termin.json()["id"]

    # Wiedervorlage anlegen, wie es die Oberflaeche nach dem Termin anbietet
    nachfass = client.post("/api/v1/followups", json={
        "customer_id": welt["kunde"],
        "due_on": local_today().isoformat(),
        "note": "Nach Termin ohne Abschluss",
        "appointment_id": termin_id,
    }, headers=kopf)
    assert nachfass.status_code in (200, 201), nachfass.text

    # 1. Kundenakte zeigt sie als naechste Wiedervorlage
    akte = client.get(f"/api/v1/customers/{welt['kunde']}/timeline", headers=kopf).json()
    assert akte["next_follow_up"] is not None
    assert akte["next_follow_up"]["is_today"] is True

    # 2. Nachfassliste kennt sie
    offen = client.get("/api/v1/followups", headers=kopf).json()
    assert len(offen) == 1

    # 3. Der Assistent nimmt sie in die Prioritaeten auf
    prio = client.get("/api/v1/assistant/insights/priorities", headers=kopf).json()
    assert any(e["kind"] == "follow_up_today" for e in prio["items"])

    # 4. Das Tagesbriefing ebenfalls
    briefing = client.get("/api/v1/assistant/briefing", headers=kopf).json()
    assert briefing["tasks"], "Das Briefing muss die faellige Wiedervorlage kennen"


def test_erledigte_wiedervorlage_verschwindet_aus_allen_listen(client, welt):
    kopf = _login(client)
    angelegt = client.post("/api/v1/followups", json={
        "customer_id": welt["kunde"],
        "due_on": local_today().isoformat(),
        "note": "Test",
    }, headers=kopf).json()

    erledigt = client.post(f"/api/v1/followups/{angelegt['id']}/complete",
                           json={"completed_note": None}, headers=kopf)
    assert erledigt.status_code == 200, erledigt.text

    akte = client.get(f"/api/v1/customers/{welt['kunde']}/timeline", headers=kopf).json()
    assert akte["next_follow_up"] is None

    prio = client.get("/api/v1/assistant/insights/priorities", headers=kopf).json()
    assert not [e for e in prio["items"] if e["kind"].startswith("follow_up")]


# ================================================== Produktpreis -> Verkauf

def test_gepflegter_preis_erscheint_am_produkt(client, welt):
    """Preisverwaltung und Produktliste muessen denselben Preis zeigen."""
    kopf = _login(client, "chefin@example.com")

    uebersicht = client.get("/api/v1/products/prices/overview", headers=kopf).json()
    zeile = [p for p in uebersicht["products"] if p["product_id"] == welt["produkt"]][0]
    assert zeile["price"]["amount_cents"] == PREIS_CENT

    produkt = client.get(f"/api/v1/products/{welt['produkt']}", headers=kopf).json()
    assert produkt["price"]["amount_cents"] == PREIS_CENT


# ============================================== Verleih -> Kunde -> Prioritaet

def test_verleih_taucht_beim_kunden_und_in_prioritaeten_auf(client, welt):
    kopf = _login(client)

    verleih = client.post("/api/v1/rentals", json={
        "product_id": welt["produkt"],
        "customer_id": welt["kunde"],
        "serial_number": "VK7-4711",
        "issued_at": (datetime.now(timezone.utc) - timedelta(days=20)).isoformat(),
        "due_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
        "status": "rented",
    }, headers=kopf)
    assert verleih.status_code in (200, 201), verleih.text

    # 1. Verleihliste meldet ihn als ueberfaellig
    liste = client.get("/api/v1/rentals", headers=kopf).json()
    assert liste[0]["is_overdue"] is True

    # 2. Zaehler stimmt mit der Liste ueberein
    summe = client.get("/api/v1/rentals/summary", headers=kopf).json()
    assert summe["overdue"] == 1

    # 3. Geraetehistorie kennt das Geraet
    geraete = client.get("/api/v1/rentals/devices", headers=kopf).json()
    assert geraete[0]["serial_number"] == "VK7-4711"

    # 4. Der Assistent nimmt es in die Prioritaeten auf
    prio = client.get("/api/v1/assistant/insights/priorities", headers=kopf).json()
    assert any(e["kind"] == "rental_due" for e in prio["items"])

    # 5. Dashboard zeigt es unter den Ausleihen
    dash = client.get("/api/v1/dashboard", headers=kopf).json()
    assert len(dash["rentals"]) == 1


# ============================================ Teamleitung sieht dieselbe Summe

def test_teamleitung_sieht_dieselben_zahlen_wie_der_mitarbeiter(client, welt):
    """Die Teamsumme muss die Summe der Einzelnen sein, nicht eine eigene Rechnung."""
    kopf_anna = _login(client)
    _verkauf_anlegen(client, kopf_anna, welt)
    eigener = client.get("/api/v1/reports/week", headers=kopf_anna).json()["metrics"]["revenue_cents"]

    kopf_chefin = _login(client, "chefin@example.com")
    team = client.get("/api/v1/reports/week", headers=kopf_chefin).json()
    assert team["metrics"]["revenue_cents"] == eigener

    # Und eingegrenzt auf Anna dieselbe Zahl
    einzeln = client.get("/api/v1/reports/week",
                         params={"employee_id": welt["e_anna"]}, headers=kopf_chefin).json()
    assert einzeln["metrics"]["revenue_cents"] == eigener


def test_teamtabelle_summiert_sich_zur_gesamtsumme(client, welt):
    kopf_anna = _login(client)
    _verkauf_anlegen(client, kopf_anna, welt)

    kopf_chefin = _login(client, "chefin@example.com")
    bericht = client.get("/api/v1/reports/week", headers=kopf_chefin).json()

    summe_team = sum(z["revenue_cents"] for z in bericht["team"])
    assert summe_team == bericht["metrics"]["revenue_cents"]
