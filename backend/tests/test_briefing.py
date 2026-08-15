"""Tests fuer das Tagesbriefing des KI-Assistenten.

Das Briefing rechnet ohne Sprachmodell. Genau deshalb muss die Rechnung
stimmen: es gibt keine zweite Instanz, die einen Fehler auffangen wuerde.
Geprueft werden vor allem die Zahlen, an denen die Empfehlungen haengen -
Arbeitstage, Restbedarf und die Begruendung der Wochenentwicklung.
"""
import os
import tempfile
from datetime import date, datetime, timedelta, timezone

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
    Appointment,
    AppointmentStatus,
    AppointmentType,
    Customer,
    Employee,
    FollowUp,
    FollowUpReason,
    FollowUpStatus,
    Product,
    Rental,
    RentalStatus,
    Role,
    User,
)
from app.services.briefing import _arbeitstage, briefing_als_text, day_briefing  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture(autouse=True)
def _schema():
    """Tabellen fuer jeden Test frisch - auch fuer die ohne HTTP-Client."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def welt():
    """Ein Mitarbeiter mit Kunde - Basis fuer alle Faelle."""
    db = SessionLocal()
    try:
        user = User(
            email="anna@example.com",
            full_name="Anna Mitarbeiterin",
            password_hash=hash_password(PASSWORD),
            role=Role.EMPLOYEE,
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name="Anna Mitarbeiterin", monthly_units_target=20)
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Karl", last_name="Kunde")
        db.add(kunde)
        db.commit()
        return {"user": user.id, "employee": employee.id, "customer": kunde.id}
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def _briefing(welt):
    db = SessionLocal()
    try:
        return day_briefing(db, db.get(User, welt["user"]), welt["employee"])
    finally:
        db.close()


def _wiedervorlage(welt, faellig_am, status=FollowUpStatus.OPEN):
    db = SessionLocal()
    try:
        db.add(FollowUp(
            customer_id=welt["customer"],
            employee_id=welt["employee"],
            due_on=faellig_am,
            reason=FollowUpReason.MANUAL,
            status=status,
        ))
        db.commit()
    finally:
        db.close()


def _termin(welt, wann, adresse="Musterweg 1, 30159 Hannover"):
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=welt["customer"],
            employee_id=welt["employee"],
            start_at=wann,
            appointment_type=AppointmentType.CUSTOMER,
            status=AppointmentStatus.PLANNED,
            address_snapshot=adresse,
        ))
        db.commit()
    finally:
        db.close()


# ------------------------------------------------------------ Arbeitstage

def test_arbeitstage_zaehlen_nur_montag_bis_freitag():
    """Ein Monatsziel auf Kalendertage umzulegen ergaebe eine Tagesvorgabe,
    die an Wochenenden niemand erreicht."""
    # Mo 4.5.2026 bis So 10.5.2026 -> 5 Werktage
    assert _arbeitstage(date(2026, 5, 4), date(2026, 5, 10)) == 5
    # Nur das Wochenende
    assert _arbeitstage(date(2026, 5, 9), date(2026, 5, 10)) == 0
    # Ein einzelner Werktag
    assert _arbeitstage(date(2026, 5, 6), date(2026, 5, 6)) == 1
    # Rueckwaerts ergibt keine negative Zahl
    assert _arbeitstage(date(2026, 5, 10), date(2026, 5, 4)) == 0


# --------------------------------------------------------------- Aufgaben

def test_ueberfaellige_wiedervorlage_steht_ganz_oben(welt):
    heute = local_today()
    _wiedervorlage(welt, heute - timedelta(days=5))
    _wiedervorlage(welt, heute)

    briefing = _briefing(welt)
    arten = [a["kind"] for a in briefing["tasks"]]

    assert arten[0] == "followup_overdue", "Überfälliges muss vor allem anderen stehen"
    assert "followup_today" in arten


def test_erledigte_wiedervorlage_taucht_nicht_auf(welt):
    _wiedervorlage(welt, local_today() - timedelta(days=3), status=FollowUpStatus.DONE)
    briefing = _briefing(welt)
    assert [a for a in briefing["tasks"] if a["kind"].startswith("followup")] == []


def test_ueberfaelliges_verleihgeraet_wird_gemeldet(welt):
    db = SessionLocal()
    try:
        produkt = Product(name="Kobold VK7", verified=True)
        db.add(produkt)
        db.flush()
        db.add(Rental(
            product_id=produkt.id,
            customer_id=welt["customer"],
            employee_id=welt["employee"],
            issued_at=datetime.now(timezone.utc) - timedelta(days=20),
            due_at=datetime.now(timezone.utc) - timedelta(days=4),
            status=RentalStatus.RENTED,
        ))
        db.commit()
    finally:
        db.close()

    briefing = _briefing(welt)
    assert any(a["kind"] == "rental_overdue" for a in briefing["tasks"])
    assert any("zurückholen" in satz for satz in briefing["recommendations"])


def test_leerer_tag_meldet_nichts_erfundenes(welt):
    briefing = _briefing(welt)
    assert briefing["tasks"] == []
    assert "keine Termine" in briefing_als_text(briefing)


# ------------------------------------------------------------------ Route

def test_termine_ohne_adresse_werden_getrennt_gezaehlt(welt):
    """Ein Termin ohne Adresse faellt in der Routenplanung hinten runter -
    das muss das Briefing sagen, statt ihn stillschweigend mitzuzaehlen."""
    morgen_frueh = datetime.combine(local_today(), datetime.min.time()).replace(
        hour=9, tzinfo=timezone.utc)
    _termin(welt, morgen_frueh)
    _termin(welt, morgen_frueh + timedelta(hours=2), adresse="")

    briefing = _briefing(welt)
    assert briefing["route"]["stops"] == 1
    assert briefing["route"]["without_address"] == 1
    assert any("ohne Adresse" in satz for satz in briefing["recommendations"])


# ------------------------------------------------------------- Monatsziel

def test_monatsziel_rechnet_restbedarf_auf_arbeitstage(welt):
    briefing = _briefing(welt)
    ziel = briefing["goal"]

    assert ziel["units_target"] == 20
    assert ziel["units_missing"] == 20, "ohne Verkaeufe fehlt das ganze Ziel"

    if ziel["working_days_left"]:
        erwartet = round(ziel["units_missing"] / ziel["working_days_left"], 1)
        assert ziel["needed_per_working_day"] == erwartet
    else:
        assert ziel["needed_per_working_day"] == 0


def test_ohne_verkaeufe_ist_man_hinter_dem_soll(welt):
    briefing = _briefing(welt)
    ziel = briefing["goal"]
    # Am ersten Werktag des Monats ist das Soll noch klein - dann kann man
    # auch mit 0 Einheiten im Plan sein. Sonst muss es hinterherhinken.
    if ziel["expected_by_today"] > 0:
        assert ziel["on_track"] is False
        assert any("Monatsziel" in satz for satz in briefing["recommendations"])


# --------------------------------------------------------- Entwicklung

def test_entwicklung_nennt_einen_grund(welt):
    briefing = _briefing(welt)
    assert briefing["development"]["reasons"], "Eine Begründung muss immer dastehen"
    # Ohne Bewegung darf nichts Dramatisches behauptet werden.
    assert "Vorwochenniveau" in briefing["development"]["reasons"][0]


# ------------------------------------------------------------- Endpunkt

def test_endpunkt_liefert_briefing(client, welt):
    antwort = client.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD})
    assert antwort.status_code == 200

    daten = client.get("/api/v1/assistant/briefing").json()
    assert daten["for_name"] == "Anna Mitarbeiterin"
    assert "tasks" in daten and "goal" in daten and "development" in daten
    # Ein Mitarbeiter bekommt keinen Teamblock.
    assert "team" not in daten


def test_endpunkt_braucht_anmeldung(client, welt):
    assert client.get("/api/v1/assistant/briefing").status_code == 401


def test_teamleiter_bekommt_teamblock(client, welt):
    db = SessionLocal()
    try:
        chef = User(
            email="chef@example.com",
            full_name="Clara Chefin",
            password_hash=hash_password(PASSWORD),
            role=Role.TEAM_LEADER,
            must_change_password=False,
        )
        db.add(chef)
        db.flush()
        db.add(Employee(user_id=chef.id, display_name="Clara Chefin"))
        db.commit()
    finally:
        db.close()

    client.post("/api/v1/auth/login", json={"email": "chef@example.com", "password": PASSWORD})
    daten = client.get("/api/v1/assistant/briefing").json()

    assert daten["scope"] == "team"
    assert "team" in daten
    assert "alerts" in daten["team"]


def test_lokale_antwort_ohne_ki_schluessel(client, welt):
    """Ohne konfigurierten Anbieter muss die Frage trotzdem beantwortet werden."""
    antwort = client.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD})
    kopf = {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}

    _wiedervorlage(welt, local_today() - timedelta(days=2))

    antwort = client.post("/api/v1/assistant/chat", json={
        "message": "Was muss ich heute erledigen?"}, headers=kopf)

    assert antwort.status_code == 200
    text = antwort.json()["reply"] if "reply" in antwort.json() else str(antwort.json())
    assert "Wiedervorlage" in text
