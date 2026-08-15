"""Tests fuer die Zielvorgaben im Profil.

Die Betraege liegen ueberall im System als Cent vor - in der Datenbank, in
der API und in jeder Auswertung. Nur das Formular rechnet auf Euro um.
Diese Tests nageln die Serverseite fest: was gespeichert wird, muss
unveraendert wieder herauskommen und in der Buntewoche als Tagessoll
auftauchen. Laufen die beiden auseinander, faellt das sonst niemandem auf -
es sieht dann nach einem falschen Ziel aus, nicht nach einem Fehler.
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
from app.models import Employee, Role, User  # noqa: E402

PASSWORD = "PasswortPasswort1"

# 10.000 € - der Betrag aus der Fehlermeldung.
ZEHNTAUSEND_EURO_IN_CENT = 1000000


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
def anna():
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
        db.commit()
        return {"user": user.id, "employee": employee.id}
    finally:
        db.close()


def _login(client, email="anna@example.com"):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _ziele(**rest):
    daten = {
        "monthly_units_target": 20,
        "weekly_revenue_target_cents": None,
        "daily_area_target_cents": None,
        "daily_total_target_cents": None,
    }
    daten.update(rest)
    return daten


def test_gespeicherter_betrag_kommt_unveraendert_zurueck(client, anna):
    kopf = _login(client)
    client.put("/api/v1/profile",
               json=_ziele(weekly_revenue_target_cents=ZEHNTAUSEND_EURO_IN_CENT),
               headers=kopf)

    profil = client.get("/api/v1/profile", headers=kopf).json()
    assert profil["weekly_revenue_target_cents"] == ZEHNTAUSEND_EURO_IN_CENT


def test_alle_drei_ziele_werden_getrennt_gespeichert(client, anna):
    kopf = _login(client)
    client.put("/api/v1/profile", json=_ziele(
        weekly_revenue_target_cents=1000000,
        daily_area_target_cents=250000,
        daily_total_target_cents=400000,
    ), headers=kopf)

    profil = client.get("/api/v1/profile", headers=kopf).json()
    assert profil["weekly_revenue_target_cents"] == 1000000
    assert profil["daily_area_target_cents"] == 250000
    assert profil["daily_total_target_cents"] == 400000


def test_kein_ziel_bleibt_kein_ziel(client, anna):
    """None ist etwas anderes als 0 - kein Ziel gesetzt statt Ziel von 0 €."""
    kopf = _login(client)
    client.put("/api/v1/profile", json=_ziele(weekly_revenue_target_cents=None), headers=kopf)

    profil = client.get("/api/v1/profile", headers=kopf).json()
    assert profil["weekly_revenue_target_cents"] is None


def test_null_euro_bleibt_null_und_wird_nicht_zu_kein_ziel(client, anna):
    kopf = _login(client)
    client.put("/api/v1/profile", json=_ziele(weekly_revenue_target_cents=0), headers=kopf)

    profil = client.get("/api/v1/profile", headers=kopf).json()
    assert profil["weekly_revenue_target_cents"] == 0


def test_negatives_ziel_wird_abgelehnt(client, anna):
    kopf = _login(client)
    antwort = client.put("/api/v1/profile",
                         json=_ziele(weekly_revenue_target_cents=-100),
                         headers=kopf)
    assert antwort.status_code == 422


def test_gebrochene_cent_werden_abgelehnt(client, anna):
    """Cent sind ganzzahlig. Ein halber Cent waere ein Umrechnungsfehler."""
    kopf = _login(client)
    antwort = client.put("/api/v1/profile",
                         json=_ziele(weekly_revenue_target_cents=1000000.5),
                         headers=kopf)
    assert antwort.status_code == 422


def test_tagessoll_erscheint_unveraendert_in_der_buntewoche(client, anna):
    """Frontend -> API -> Datenbank -> Auswertung, eine Kette ohne Bruch."""
    kopf = _login(client)
    client.put("/api/v1/profile", json=_ziele(
        daily_area_target_cents=250000,
        daily_total_target_cents=400000,
    ), headers=kopf)

    montag = local_today() - timedelta(days=local_today().weekday())
    woche = client.get("/api/v1/buntewoche", params={
        "week_start": montag.isoformat(),
        "employee_id": anna["employee"],
    }, headers=kopf).json()

    assert woche["days"], "Die Woche muss Tage enthalten"
    for tag in woche["days"]:
        assert tag["area_target_cents"] == 250000
        assert tag["total_target_cents"] == 400000


def test_monatsziel_bleibt_eine_stueckzahl(client, anna):
    """Einheiten sind kein Geldbetrag - hier darf nichts umgerechnet werden."""
    kopf = _login(client)
    client.put("/api/v1/profile", json=_ziele(monthly_units_target=35), headers=kopf)

    profil = client.get("/api/v1/profile", headers=kopf).json()
    assert profil["monthly_units_target"] == 35


def test_ziele_aendern_braucht_csrf_token(client, anna):
    client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    antwort = client.put("/api/v1/profile", json=_ziele(weekly_revenue_target_cents=1000000))
    assert antwort.status_code == 403


def test_ziele_aendern_braucht_anmeldung(client, anna):
    # 403, weil die CSRF-Pruefung vor der Anmeldepruefung greift. Beides
    # weist die Anfrage ab; entscheidend ist, dass nichts durchkommt.
    antwort = client.put("/api/v1/profile", json=_ziele(weekly_revenue_target_cents=999900))
    assert antwort.status_code in (401, 403)

    db = SessionLocal()
    try:
        assert db.get(Employee, anna["employee"]).weekly_revenue_target_cents is None
    finally:
        db.close()
