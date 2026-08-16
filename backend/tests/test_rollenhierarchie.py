"""Rollenhierarchie, Sichtbarkeit und Schutz vor Rechteausweitung.

Die Fragen, die hier beantwortet werden, sind die aus der Abnahmeliste - und
zwar jede einzeln, damit ein spaeterer Umbau nicht stillschweigend eine
davon umdreht:

* Sieht ein Teamleiter das Systemadministrator-Konto? Nirgends.
* Kommt er ueber die ID daran? Nein - und die Antwort ist 404, nicht 403.
* Kann er jemanden zum Teamleiter machen? Nein, auch nicht per Hand
  zusammengebautem Aufruf.
* Kann er sich selbst hochstufen? Nein.
* Kann er einen Mitarbeiter in sein Team holen? Ja - genau das ist seine
  Aufgabe.
* Kann die Organisationsleitung Teamleiter ernennen? Ja.

Geprueft wird ueber HTTP, nicht ueber die Hilfsfunktionen. Eine
Berechtigungspruefung, die nur in der Bibliothek richtig ist und im Endpunkt
nicht aufgerufen wird, ist keine.
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
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    District,
    Employee,
    Region,
    Role,
    Team,
    User,
)

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


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


@pytest.fixture
def inhaber():
    return _person("inhaber@example.com", "Ida Inhaberin", Role.SYSTEM_ADMIN)


@pytest.fixture
def leitung():
    return _person("leitung@example.com", "Olga Leitung", Role.REGIONAL_LEAD)


@pytest.fixture
def chef():
    return _person("chef@example.com", "Carl Chef", Role.TEAM_LEADER)


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


def _team_mit_leitung(leiter_user_id: str, name: str = "Team Nord") -> str:
    """Region, Bezirk und Team - mit dieser Person als Teamleitung."""
    db = SessionLocal()
    try:
        r = Region(name=f"Region {name}")
        db.add(r)
        db.flush()
        d = District(region_id=r.id, name=f"Bezirk {name}")
        db.add(d)
        db.flush()
        t = Team(district_id=d.id, name=name, lead_user_id=leiter_user_id)
        db.add(t)
        db.commit()
        return t.id
    finally:
        db.close()


def _ins_team(employee_id: str, team_id: str | None) -> None:
    db = SessionLocal()
    try:
        db.get(Employee, employee_id).team_id = team_id
        db.commit()
    finally:
        db.close()


# =============================== Der Systemadministrator ist unsichtbar

def test_teamleiter_sieht_den_systemadministrator_in_keiner_benutzerliste(
    client, inhaber, chef, anna
):
    kopf = _login(client, "chef@example.com")
    liste = client.get("/api/v1/admin/users", headers=kopf).json()
    assert inhaber["user"] not in [b["id"] for b in liste]
    assert "Ida Inhaberin" not in [b["full_name"] for b in liste]


def test_teamleiter_sieht_den_systemadministrator_nicht_in_der_mitarbeiterliste(
    client, inhaber, chef, anna
):
    kopf = _login(client, "chef@example.com")
    liste = client.get("/api/v1/team/employees", headers=kopf).json()
    assert inhaber["employee"] not in [e["id"] for e in liste]


def test_teamleiter_findet_den_systemadministrator_nicht_in_der_empfaengerauswahl(
    client, inhaber, chef
):
    """Die Empfaengerliste ist die naheliegendste Stelle, an der ein
    verstecktes Konto doch wieder auftaucht."""
    kopf = _login(client, "chef@example.com")
    liste = client.get("/api/v1/directory/users", headers=kopf).json()
    assert inhaber["user"] not in [b["id"] for b in liste]


def test_teamleiter_kommt_nicht_ueber_die_id_an_das_konto(client, inhaber, chef):
    """Der wichtigste Fall: die ID ist bekannt, der Aufruf trotzdem leer.

    404 statt 403 - ein 403 waere die Bestaetigung, dass es das Konto gibt.
    """
    kopf = _login(client, "chef@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{inhaber['user']}",
                           json={"full_name": "Übernommen"}, headers=kopf)
    assert antwort.status_code == 404
    assert "Ida" not in antwort.text


def test_teamleiter_kann_dem_systemadministrator_kein_passwort_setzen(
    client, inhaber, chef
):
    kopf = _login(client, "chef@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{inhaber['user']}/password",
                           json={}, headers=kopf)
    assert antwort.status_code == 404


def test_teamleiter_kann_das_profil_des_systemadministrators_nicht_bearbeiten(
    client, inhaber, chef
):
    """Der Umweg ueber die Profil-ID darf nicht offen stehen, wenn die
    Benutzer-ID verschlossen ist."""
    kopf = _login(client, "chef@example.com")
    antwort = client.patch(f"/api/v1/admin/employees/{inhaber['employee']}",
                           json={"position": "Übernommen"}, headers=kopf)
    assert antwort.status_code == 404


def test_teamleiter_kann_dem_systemadministrator_nicht_schreiben(client, inhaber, chef):
    kopf = _login(client, "chef@example.com")
    antwort = client.post("/api/v1/messages", headers=kopf, json={
        "body": "Hallo", "recipient_user_id": inhaber["user"]})
    assert antwort.status_code == 404


def test_teamleiter_sieht_den_systemadministrator_nicht_im_vergleich(
    client, inhaber, chef, anna
):
    """Eine Kennzahlenliste mit Namen ist eine Benutzerliste."""
    kopf = _login(client, "chef@example.com")
    daten = client.get("/api/v1/team/comparison?level=employee", headers=kopf).json()
    assert inhaber["employee"] not in [z["id"] for z in daten["rows"]]


def test_teamleiter_sieht_den_systemadministrator_nicht_in_der_teamuebersicht(
    client, inhaber, chef, anna
):
    kopf = _login(client, "chef@example.com")
    daten = client.get("/api/v1/dashboard/team-overview", headers=kopf).json()
    assert inhaber["employee"] not in [z["employee_id"] for z in daten["employees"]]


def test_der_systemadministrator_sieht_sich_selbst(client, inhaber, chef):
    """Gegenprobe: die Sperre gilt nach unten, nicht nach oben."""
    kopf = _login(client, "inhaber@example.com")
    liste = client.get("/api/v1/sysadmin/users", headers=kopf).json()
    assert inhaber["user"] in [b["id"] for b in liste]


# ================================ Ein Teamleiter vergibt keine Fuehrungsrolle

def test_teamleiter_macht_keinen_zweiten_teamleiter(client, chef, anna):
    kopf = _login(client, "chef@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{anna['user']}",
                           json={"role": "TEAM_LEADER"}, headers=kopf)
    assert antwort.status_code == 403

    db = SessionLocal()
    try:
        assert db.get(User, anna["user"]).role == Role.EMPLOYEE
    finally:
        db.close()


@pytest.mark.parametrize("rolle", ["TEAM_LEADER", "REGIONAL_LEAD", "SYSTEM_ADMIN"])
def test_teamleiter_legt_niemanden_mit_hoeherer_rolle_an(client, chef, rolle):
    """Der von Hand zusammengebaute Aufruf, den die Oberflaeche nie schickt."""
    kopf = _login(client, "chef@example.com")
    antwort = client.post("/api/v1/admin/users", headers=kopf, json={
        "email": f"neu-{rolle.lower()}@example.com",
        "full_name": "Neu Person",
        "role": rolle,
    })
    assert antwort.status_code == 403

    db = SessionLocal()
    try:
        assert db.query(User).filter(
            User.email == f"neu-{rolle.lower()}@example.com").count() == 0
    finally:
        db.close()


def test_teamleiter_stuft_sich_nicht_selbst_hoch(client, chef):
    kopf = _login(client, "chef@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{chef['user']}",
                           json={"role": "SYSTEM_ADMIN"}, headers=kopf)
    assert antwort.status_code == 400

    db = SessionLocal()
    try:
        assert db.get(User, chef["user"]).role == Role.TEAM_LEADER
    finally:
        db.close()


def test_teamleiter_bearbeitet_keinen_anderen_teamleiter(client, chef):
    zweiter = _person("zweiter@example.com", "Zweiter Chef", Role.TEAM_LEADER)
    kopf = _login(client, "chef@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{zweiter['user']}",
                           json={"is_active": False}, headers=kopf)
    assert antwort.status_code == 403


def test_teamleiter_legt_mitarbeiter_an(client, chef):
    """Was er darf, muss er auch koennen - sonst ist die Sperre zu grob."""
    kopf = _login(client, "chef@example.com")
    antwort = client.post("/api/v1/admin/users", headers=kopf, json={
        "email": "neue@example.com", "full_name": "Neue Person"})
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["role"] == "EMPLOYEE"


def test_teamleiter_bekommt_nur_die_mitarbeiterrolle_zur_auswahl(client, chef):
    kopf = _login(client, "chef@example.com")
    rollen = client.get("/api/v1/admin/assignable-roles", headers=kopf).json()
    assert [r["value"] for r in rollen] == ["EMPLOYEE"]


def test_organisationsleitung_darf_teamleiter_ernennen(client, leitung, anna):
    kopf = _login(client, "leitung@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{anna['user']}",
                           json={"role": "TEAM_LEADER"}, headers=kopf)
    assert antwort.status_code == 200
    assert antwort.json()["role"] == "TEAM_LEADER"


def test_organisationsleitung_ernennt_keinen_systemadministrator(client, leitung, anna):
    """Nach oben endet auch die Leitung."""
    kopf = _login(client, "leitung@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{anna['user']}",
                           json={"role": "SYSTEM_ADMIN"}, headers=kopf)
    assert antwort.status_code == 403


def test_mitarbeiter_hat_gar_keine_verwaltung(client, chef, anna):
    kopf = _login(client, "anna@example.com")
    assert client.get("/api/v1/admin/users", headers=kopf).status_code == 403
    assert client.get("/api/v1/admin/teams", headers=kopf).status_code == 403
    assert client.post("/api/v1/admin/users", headers=kopf, json={
        "email": "x@example.com", "full_name": "X"}).status_code == 403


# ==================================================== Nur das eigene Team

def test_teamleiter_sieht_fremde_teams_nicht(client, chef, anna):
    fremd = _person("fremd@example.com", "Fremde Person")
    anderes_team = _team_mit_leitung(leiter_user_id=None, name="Team Süd")
    _ins_team(fremd["employee"], anderes_team)

    kopf = _login(client, "chef@example.com")
    liste = client.get("/api/v1/admin/users", headers=kopf).json()
    assert fremd["user"] not in [b["id"] for b in liste]


def test_teamleiter_bearbeitet_keinen_mitarbeiter_eines_fremden_teams(client, chef):
    fremd = _person("fremd@example.com", "Fremde Person")
    anderes_team = _team_mit_leitung(leiter_user_id=None, name="Team Süd")
    _ins_team(fremd["employee"], anderes_team)

    kopf = _login(client, "chef@example.com")
    antwort = client.patch(f"/api/v1/admin/users/{fremd['user']}",
                           json={"is_active": False}, headers=kopf)
    assert antwort.status_code == 403


def test_teamleiter_nimmt_mitarbeiter_ins_eigene_team_auf(client, chef, anna):
    eigenes = _team_mit_leitung(chef["user"])
    kopf = _login(client, "chef@example.com")

    antwort = client.post(f"/api/v1/admin/teams/{eigenes}/members", headers=kopf,
                          json={"employee_id": anna["employee"]})
    assert antwort.status_code == 200, antwort.text

    db = SessionLocal()
    try:
        assert db.get(Employee, anna["employee"]).team_id == eigenes
    finally:
        db.close()


def test_teamleiter_besetzt_kein_fremdes_team(client, chef, anna):
    fremdes = _team_mit_leitung(leiter_user_id=None, name="Team Süd")
    kopf = _login(client, "chef@example.com")

    antwort = client.post(f"/api/v1/admin/teams/{fremdes}/members", headers=kopf,
                          json={"employee_id": anna["employee"]})
    assert antwort.status_code == 403


def test_teamleiter_nimmt_mitarbeiter_wieder_aus_dem_team(client, chef, anna):
    eigenes = _team_mit_leitung(chef["user"])
    _ins_team(anna["employee"], eigenes)
    kopf = _login(client, "chef@example.com")

    antwort = client.delete(
        f"/api/v1/admin/teams/{eigenes}/members/{anna['employee']}", headers=kopf)
    assert antwort.status_code == 200

    db = SessionLocal()
    try:
        profil = db.get(Employee, anna["employee"])
        assert profil.team_id is None
        # Das Konto bleibt bestehen - aus dem Team nehmen ist kein Loeschen.
        assert db.get(User, anna["user"]).is_active is True
    finally:
        db.close()


def test_teamleiter_sieht_nur_die_eigenen_teams(client, chef):
    eigenes = _team_mit_leitung(chef["user"])
    _team_mit_leitung(leiter_user_id=None, name="Team Süd")

    kopf = _login(client, "chef@example.com")
    teams = client.get("/api/v1/admin/teams", headers=kopf).json()
    assert [t["id"] for t in teams] == [eigenes]
