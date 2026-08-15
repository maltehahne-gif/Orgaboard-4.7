"""Tests fuer den Betreiberbereich.

Zwei Schwerpunkte:

1. Abschottung. Jeder Endpunkt muss fuer alle unterhalb des
   Systemadministrators dicht sein - auch fuer den Teamleiter, der im
   uebrigen System weitreichende Rechte hat. Die Pruefung sitzt im Backend;
   dass die Oberflaeche den Menuepunkt versteckt, zaehlt nicht.

2. Sackgassen. Der Betreiber darf sich nicht selbst herabstufen oder
   abschalten, und das Loeschen einer Struktur darf keine Mitarbeiter still
   aus ihren Auswertungen entfernen.
"""
import os
import tempfile
from datetime import date

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Employee, Role, User, UserPermission  # noqa: E402

PASSWORD = "PasswortPasswort1"


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


def _person(email, name, role=Role.EMPLOYEE):
    db = SessionLocal()
    try:
        u = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                 role=role, must_change_password=False)
        db.add(u)
        db.flush()
        e = Employee(user_id=u.id, display_name=name)
        db.add(e)
        db.commit()
        return {"user": u.id, "employee": e.id}
    finally:
        db.close()


@pytest.fixture
def inhaber():
    return _person("inhaber@example.com", "Malte Inhaber", Role.SYSTEM_ADMIN)


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


def _login(client, email):
    a = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert a.status_code == 200, a.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _struktur(client, kopf):
    """Region, Bezirk und Team in einem Zug - Grundlage fuer viele Tests."""
    r = client.post("/api/v1/sysadmin/regions", json={"name": "Nord"}, headers=kopf).json()
    d = client.post("/api/v1/sysadmin/districts",
                    json={"region_id": r["id"], "name": "Hannover"}, headers=kopf).json()
    t = client.post("/api/v1/sysadmin/teams",
                    json={"district_id": d["id"], "name": "Team 1"}, headers=kopf).json()
    return r, d, t


# ============================================================ Abschottung

ENDPUNKTE = [
    ("get", "/api/v1/sysadmin/overview"),
    ("get", "/api/v1/sysadmin/org"),
    ("get", "/api/v1/sysadmin/users"),
    ("get", "/api/v1/sysadmin/roles"),
    ("get", "/api/v1/sysadmin/settings"),
]


@pytest.mark.parametrize("methode,pfad", ENDPUNKTE)
def test_teamleiter_kommt_nicht_in_den_betreiberbereich(client, chefin, methode, pfad):
    kopf = _login(client, "chefin@example.com")
    assert getattr(client, methode)(pfad, headers=kopf).status_code == 403


@pytest.mark.parametrize("methode,pfad", ENDPUNKTE)
def test_mitarbeiter_kommt_nicht_in_den_betreiberbereich(client, anna, methode, pfad):
    kopf = _login(client, "anna@example.com")
    assert getattr(client, methode)(pfad, headers=kopf).status_code == 403


@pytest.mark.parametrize("methode,pfad", ENDPUNKTE)
def test_ohne_anmeldung_gar_nichts(client, methode, pfad):
    assert getattr(client, methode)(pfad).status_code == 401


def test_teamleiter_kann_keine_region_anlegen(client, chefin):
    kopf = _login(client, "chefin@example.com")
    antwort = client.post("/api/v1/sysadmin/regions", json={"name": "Nord"}, headers=kopf)
    assert antwort.status_code == 403


def test_aenderung_braucht_csrf_token(client, inhaber):
    client.post("/api/v1/auth/login", json={"email": "inhaber@example.com", "password": PASSWORD})
    assert client.post("/api/v1/sysadmin/regions", json={"name": "Nord"}).status_code == 403


# =========================================================== Organisation

def test_struktur_anlegen_und_als_baum_lesen(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    _struktur(client, kopf)

    baum = client.get("/api/v1/sysadmin/org", headers=kopf).json()
    assert len(baum["regions"]) == 1
    region = baum["regions"][0]
    assert region["name"] == "Nord"
    assert region["districts"][0]["name"] == "Hannover"
    assert region["districts"][0]["teams"][0]["name"] == "Team 1"


def test_region_darf_nicht_doppelt_heissen(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    client.post("/api/v1/sysadmin/regions", json={"name": "Nord"}, headers=kopf)
    zweite = client.post("/api/v1/sysadmin/regions", json={"name": "Nord"}, headers=kopf)
    assert zweite.status_code == 400


def test_bezirk_braucht_eine_vorhandene_region(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.post("/api/v1/sysadmin/districts",
                          json={"region_id": "gibtesnicht", "name": "X"}, headers=kopf)
    assert antwort.status_code == 400


def test_region_mit_bezirken_laesst_sich_nicht_loeschen(client, inhaber):
    """Sonst raeumt ein Klick die halbe Struktur ab."""
    kopf = _login(client, "inhaber@example.com")
    r, _, _ = _struktur(client, kopf)

    antwort = client.delete(f"/api/v1/sysadmin/regions/{r['id']}", headers=kopf)
    assert antwort.status_code == 400
    assert "Bezirk" in antwort.json()["detail"]


def test_leere_region_laesst_sich_loeschen(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    r = client.post("/api/v1/sysadmin/regions", json={"name": "Leer"}, headers=kopf).json()

    assert client.delete(f"/api/v1/sysadmin/regions/{r['id']}", headers=kopf).status_code == 200
    assert client.get("/api/v1/sysadmin/org", headers=kopf).json()["regions"] == []


def test_team_mit_mitarbeitern_laesst_sich_nicht_loeschen(client, inhaber, anna):
    """Sie wuerden sonst still aus jeder Teamauswertung verschwinden."""
    kopf = _login(client, "inhaber@example.com")
    _, _, t = _struktur(client, kopf)
    client.put(f"/api/v1/sysadmin/users/{anna['user']}",
               json={"team_id": t["id"]}, headers=kopf)

    antwort = client.delete(f"/api/v1/sysadmin/teams/{t['id']}", headers=kopf)
    assert antwort.status_code == 400
    assert "Mitarbeiter" in antwort.json()["detail"]


def test_mitarbeiter_ohne_team_werden_gezaehlt(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    baum = client.get("/api/v1/sysadmin/org", headers=kopf).json()
    assert baum["employees_without_team"] == 2  # Inhaber und Anna


# ======================================================= Benutzerverwaltung

def test_benutzer_anlegen_mit_stammdaten(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    _, _, t = _struktur(client, kopf)

    antwort = client.post("/api/v1/sysadmin/users", json={
        "first_name": "Jessica", "last_name": "Wunder",
        "email": "jessica@example.com", "role": "EMPLOYEE",
        "phone": "0511 123456", "position": "Vertriebspartnerin",
        "employee_number": "VP-0815", "hired_on": "2026-03-01",
        "location": "Hannover", "team_id": t["id"], "monthly_units_target": 25,
    }, headers=kopf)

    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["full_name"] == "Jessica Wunder"
    assert daten["employee"]["employee_number"] == "VP-0815"
    assert daten["employee"]["team"] == "Team 1"
    # Region und Bezirk sind abgeleitet, nicht gespeichert.
    assert daten["employee"]["district"] == "Hannover"
    assert daten["employee"]["region"] == "Nord"
    assert len(daten["start_password"]) >= 12
    assert daten["must_change_password"] is True


def test_startpasswort_steht_nicht_im_protokoll(client, inhaber):
    from app.models import AuditLog

    kopf = _login(client, "inhaber@example.com")
    daten = client.post("/api/v1/sysadmin/users", json={
        "first_name": "Test", "last_name": "Person", "email": "t@example.com",
    }, headers=kopf).json()

    db = SessionLocal()
    try:
        for eintrag in db.query(AuditLog).all():
            inhalt = f"{eintrag.before_json}{eintrag.after_json}"
            assert daten["start_password"] not in inhalt
    finally:
        db.close()


def test_doppelte_email_wird_abgelehnt(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.post("/api/v1/sysadmin/users", json={
        "first_name": "Zweite", "last_name": "Anna", "email": "anna@example.com",
    }, headers=kopf)
    assert antwort.status_code == 400


def test_rolle_aendern(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{anna['user']}",
                         json={"role": "REGIONAL_LEAD"}, headers=kopf)

    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["role"] == "REGIONAL_LEAD"
    assert antwort.json()["role_label"] == "Regionalleiter"


def test_betreiber_kann_sich_nicht_selbst_herabstufen(client, inhaber):
    """Sonst steht die Anlage ohne Systemadministrator da."""
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{inhaber['user']}",
                         json={"role": "EMPLOYEE"}, headers=kopf)
    assert antwort.status_code == 400


def test_betreiber_kann_sich_nicht_selbst_deaktivieren(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{inhaber['user']}",
                         json={"is_active": False}, headers=kopf)
    assert antwort.status_code == 400


def test_name_wird_aus_vor_und_nachname_zusammengesetzt(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{anna['user']}",
                         json={"first_name": "Anna", "last_name": "Neumann"}, headers=kopf)

    assert antwort.json()["full_name"] == "Anna Neumann"
    assert antwort.json()["employee"]["display_name"] == "Anna Neumann"


def test_passwort_zuruecksetzen_gibt_es_genau_einmal(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.post(f"/api/v1/sysadmin/users/{anna['user']}/password", headers=kopf)

    assert antwort.status_code == 200
    assert len(antwort.json()["start_password"]) >= 12

    # Beim erneuten Lesen des Benutzers taucht es nicht wieder auf.
    daten = client.get(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf).json()
    assert "start_password" not in daten


def test_unbekanntes_team_wird_abgelehnt(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{anna['user']}",
                         json={"team_id": "gibtesnicht"}, headers=kopf)
    assert antwort.status_code == 400


# ============================================================ Einzelrechte

def test_recht_gewaehren_und_wieder_auf_rolle_zuruecksetzen(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    pfad = f"/api/v1/sysadmin/users/{anna['user']}/permissions"

    gewaehrt = client.put(pfad, json={"permission": "export.run", "allowed": True},
                          headers=kopf).json()
    zeile = [z for z in gewaehrt if z["permission"] == "export.run"][0]
    assert zeile["effective"] is True
    assert zeile["from_role"] is False

    zurueck = client.put(pfad, json={"permission": "export.run", "allowed": None},
                         headers=kopf).json()
    zeile = [z for z in zurueck if z["permission"] == "export.run"][0]
    assert zeile["override"] is None
    assert zeile["effective"] is False

    db = SessionLocal()
    try:
        assert db.query(UserPermission).count() == 0
    finally:
        db.close()


def test_recht_entziehen(client, inhaber, chefin):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{chefin['user']}/permissions",
                         json={"permission": "export.run", "allowed": False}, headers=kopf)

    zeile = [z for z in antwort.json() if z["permission"] == "export.run"][0]
    assert zeile["from_role"] is True
    assert zeile["effective"] is False


def test_dem_systemadmin_laesst_sich_kein_recht_nehmen(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{inhaber['user']}/permissions",
                         json={"permission": "export.run", "allowed": False}, headers=kopf)
    assert antwort.status_code == 400


def test_rollenliste_ist_nach_rang_sortiert(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    rollen = client.get("/api/v1/sysadmin/roles", headers=kopf).json()

    assert [r["value"] for r in rollen] == [
        "EMPLOYEE", "TEAM_LEADER", "REGIONAL_LEAD", "SYSTEM_ADMIN"
    ]
    assert rollen[-1]["label"] == "Systemadministrator"


# ======================================================= Systemeinstellungen

def test_einstellung_setzen_und_lesen(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    client.put("/api/v1/sysadmin/settings/company.name",
               json={"value": "Vorwerk Team Nord"}, headers=kopf)

    liste = client.get("/api/v1/sysadmin/settings", headers=kopf).json()
    eintrag = [e for e in liste if e["key"] == "company.name"][0]
    assert eintrag["value"]["v"] == "Vorwerk Team Nord"
    assert eintrag["label"] == "Firmenname"


def test_unbekannte_einstellung_wird_abgelehnt(client, inhaber):
    """Ein Tippfehler soll keine Einstellung erzeugen, die niemand liest."""
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put("/api/v1/sysadmin/settings/firmenname.falsch",
                         json={"value": "x"}, headers=kopf)
    assert antwort.status_code == 404


# =========================================================== Uebersicht

def test_uebersicht_zaehlt_die_ganze_plattform(client, inhaber, chefin, anna):
    kopf = _login(client, "inhaber@example.com")
    daten = client.get("/api/v1/sysadmin/overview", headers=kopf).json()

    assert daten["users"]["total"] == 3
    assert daten["users"]["active"] == 3
    assert daten["users"]["by_role"]["SYSTEM_ADMIN"] == 1
    assert daten["users"]["by_role"]["TEAM_LEADER"] == 1
    assert daten["system"]["system_admins"] == 1
    assert daten["org"]["regions"] == 0


def test_uebersicht_zaehlt_deaktivierte_getrennt(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    client.put(f"/api/v1/sysadmin/users/{anna['user']}",
               json={"is_active": False}, headers=kopf)

    daten = client.get("/api/v1/sysadmin/overview", headers=kopf).json()
    assert daten["users"]["inactive"] == 1
    assert daten["users"]["active"] == 1


# ============================================================== Protokoll

def test_jede_aenderung_landet_im_protokoll(client, inhaber, anna):
    from app.models import AuditLog

    kopf = _login(client, "inhaber@example.com")
    client.post("/api/v1/sysadmin/regions", json={"name": "Nord"}, headers=kopf)
    client.put(f"/api/v1/sysadmin/users/{anna['user']}", json={"role": "TEAM_LEADER"}, headers=kopf)

    db = SessionLocal()
    try:
        aktionen = {a.action for a in db.query(AuditLog).all()}
        assert "region.created" in aktionen
        assert "sysadmin.user_updated" in aktionen
        # Und es steht dran, wer es war.
        eintrag = db.query(AuditLog).filter(AuditLog.action == "region.created").one()
        assert eintrag.user_id == inhaber["user"]
        assert eintrag.created_at is not None
    finally:
        db.close()
