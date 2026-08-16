"""Tests fuer die operative CRM-Pipeline.

Die Pipeline baut auf vorhandenen Bausteinen auf (Trichterstufe, Wieder-
vorlage, Angebot) - Schwerpunkt hier ist deshalb die Zusammenfuehrung: der
richtige moegliche Umsatz je Stufe, die Eingrenzung nach Mitarbeiter, Team,
Bezirk und Region, und dass ein Mitarbeiter weiterhin nur eigene Kunden sieht.
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
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentStatus,
    Customer,
    District,
    Employee,
    Product,
    Region,
    Role,
    Team,
    User,
)

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


def _person(email, name, role=Role.EMPLOYEE, team_id=None):
    db = SessionLocal()
    try:
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=role, must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name, team_id=team_id)
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Kunde", last_name=name.split()[0], city="Musterstadt")
        db.add(kunde)
        db.commit()
        return {"user": user.id, "employee": employee.id, "customer": kunde.id}
    finally:
        db.close()


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


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


def _org_baum():
    db = SessionLocal()
    try:
        region = Region(name="Region Nord")
        db.add(region)
        db.flush()
        district = District(region_id=region.id, name="Bezirk Nord-Ost")
        db.add(district)
        db.flush()
        team = Team(district_id=district.id, name="Team Falken")
        db.add(team)
        db.commit()
        return {"region": region.id, "district": district.id, "team": team.id}
    finally:
        db.close()


# ------------------------------------------------------------- Grundfall

def test_kontakt_ohne_ereignisse(client, anna):
    kopf = _login(client, "anna@example.com")
    daten = client.get("/api/v1/pipeline", headers=kopf).json()

    assert len(daten["customers"]) == 1
    karte = daten["customers"][0]
    assert karte["stage"] == "contact"
    assert karte["stage_label"] == "Kontakt"
    assert karte["next_action"] == "Termin vereinbaren"
    assert karte["potential_revenue_cents"] is None
    assert daten["counts"]["contact"] == 1


def test_naechster_termin_wird_angezeigt(client, anna):
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=anna["customer"], employee_id=anna["employee"],
            start_at=datetime.now(timezone.utc) + timedelta(days=2),
            status=AppointmentStatus.CONFIRMED,
        ))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "anna@example.com")
    karte = client.get("/api/v1/pipeline", headers=kopf).json()["customers"][0]
    assert karte["stage"] == "appointment_set"
    assert karte["next_appointment"] is not None
    assert karte["next_action"] == "Termin wahrnehmen"


# ------------------------------------------------------- Angebot als Umsatz

def test_offenes_angebot_zaehlt_als_moeglicher_umsatz(client, anna, produkt):
    kopf = _login(client, "anna@example.com")
    offer = client.post("/api/v1/offers", json={
        "customer_id": anna["customer"],
        "items": [{"product_id": produkt, "quantity": 1, "unit_price_cents": 150000}],
    }, headers=kopf).json()

    karte = client.get("/api/v1/pipeline", headers=kopf).json()["customers"][0]
    assert karte["stage"] == "offer"
    assert karte["open_offer"]["id"] == offer["id"]
    assert karte["potential_revenue_cents"] == 150000

    # Ein umgewandeltes Angebot zaehlt nicht mehr als offen - der Verkauf uebernimmt.
    client.post(f"/api/v1/offers/{offer['id']}/convert-to-sale", json={}, headers=kopf)
    karte2 = client.get("/api/v1/pipeline", headers=kopf).json()["customers"][0]
    assert karte2["stage"] == "sale"
    assert karte2["open_offer"] is None
    assert karte2["last_sale"] is not None
    assert karte2["potential_revenue_cents"] == 150000


# --------------------------------------------------------- Sichtbarkeit

def test_mitarbeiter_sieht_nur_eigene_kunden(client, anna, chefin):
    kopf = _login(client, "anna@example.com")
    daten = client.get("/api/v1/pipeline", headers=kopf).json()
    namen = [c["customer_name"] for c in daten["customers"]]
    assert namen == ["Kunde Anna"]


def test_teamleiter_sieht_alle_ohne_filter(client, anna, chefin):
    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/pipeline", headers=kopf).json()
    assert len(daten["customers"]) == 2


# ------------------------------------------------------- Team/Bezirk/Region

def test_filter_nach_team_bezirk_region(client, chefin):
    org = _org_baum()
    mitglied = _person("teammitglied@example.com", "Tom Teammitglied", team_id=org["team"])
    fremd = _person("fremd@example.com", "Fritz Fremd")

    kopf = _login(client, "chefin@example.com")

    nach_team = client.get(f"/api/v1/pipeline?team_id={org['team']}", headers=kopf).json()
    assert [c["customer_id"] for c in nach_team["customers"]] == [mitglied["customer"]]

    nach_bezirk = client.get(f"/api/v1/pipeline?district_id={org['district']}", headers=kopf).json()
    assert [c["customer_id"] for c in nach_bezirk["customers"]] == [mitglied["customer"]]

    nach_region = client.get(f"/api/v1/pipeline?region_id={org['region']}", headers=kopf).json()
    assert [c["customer_id"] for c in nach_region["customers"]] == [mitglied["customer"]]

    karte = nach_team["customers"][0]
    assert karte["team_name"] == "Team Falken"
    assert karte["district_name"] == "Bezirk Nord-Ost"
    assert karte["region_name"] == "Region Nord"

    # Ohne Filter sind alle drei Kunden sichtbar (Chefin, Teammitglied, Fremder).
    alle = client.get("/api/v1/pipeline", headers=kopf).json()
    assert len(alle["customers"]) == 3


def test_leeres_team_liefert_leere_liste_statt_alle(client, chefin):
    org = _org_baum()
    kopf = _login(client, "chefin@example.com")
    daten = client.get(f"/api/v1/pipeline?team_id={org['team']}", headers=kopf).json()
    assert daten["customers"] == []
    assert daten["counts"]["contact"] == 0


# --------------------------------------------------------------- Filter

def test_suche_filtert_nach_name(client, anna, chefin):
    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/pipeline?q=Anna", headers=kopf).json()
    assert len(daten["customers"]) == 1
    assert daten["customers"][0]["employee_name"] == "Anna Mitarbeiterin"


# ------------------------------------------------------- Org-Lookup

def test_org_lookup_fuer_teamleiter(client, chefin):
    org = _org_baum()
    kopf = _login(client, "chefin@example.com")
    daten = client.get("/api/v1/team/org-lookup", headers=kopf).json()
    assert {r["id"] for r in daten["regions"]} == {org["region"]}
    assert {d["id"] for d in daten["districts"]} == {org["district"]}
    assert {t["id"] for t in daten["teams"]} == {org["team"]}


def test_org_lookup_verweigert_mitarbeiter(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.get("/api/v1/team/org-lookup", headers=kopf)
    assert antwort.status_code == 403
