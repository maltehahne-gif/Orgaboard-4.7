"""Konto deaktivieren und Konto endgueltig loeschen.

Zwei Vorgaenge, die nicht dasselbe tun duerfen - genau das wird hier
geprueft:

* Deaktivieren laesst das Konto stehen und ist umkehrbar.
* Loeschen entfernt den Datensatz wirklich, samt Passwort-Hash und E-Mail.

Dazu die Sperren, die keinen Rueckweg haben: das eigene Konto, der letzte
Systemadministrator, und die Frage, ob nach dem Loeschen noch stimmt, was in
den Buechern steht.
"""
import os
import tempfile
from datetime import datetime, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    AuditLog,
    Customer,
    Employee,
    Notification,
    Product,
    PushSubscription,
    Role,
    Sale,
    SaleItem,
    User,
    UserPermission,
)
from app.services.kontoloeschung import GELOESCHT_ANZEIGENAME  # noqa: E402

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
def chef():
    return _person("chef@example.com", "Carl Chef", Role.TEAM_LEADER)


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


def _verkauf_anlegen(employee_id: str) -> dict:
    """Ein Kunde mit Verkauf - die Unternehmenshistorie, die bleiben muss."""
    db = SessionLocal()
    try:
        p = Product(name="Staubsauger VK7", category="Reinigung", verified=True, active=True)
        db.add(p)
        c = Customer(employee_id=employee_id, first_name="Klara", last_name="Kundin")
        db.add(c)
        db.flush()
        s = Sale(employee_id=employee_id, customer_id=c.id,
                 sold_at=datetime.now(timezone.utc))
        db.add(s)
        db.flush()
        db.add(SaleItem(sale_id=s.id, product_id=p.id, product_name_snapshot=p.name,
                        quantity=1, unit_price_cents=250000))
        db.commit()
        return {"customer": c.id, "sale": s.id}
    finally:
        db.close()


# ====================================================== Wer darf ueberhaupt

def test_teamleiter_kann_kein_konto_loeschen(client, inhaber, chef, anna):
    """Die Loeschung ist nicht nur unsichtbar, sie ist auch verschlossen."""
    kopf = _login(client, "chef@example.com")
    antwort = client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)
    assert antwort.status_code == 403

    db = SessionLocal()
    try:
        assert db.get(User, anna["user"]) is not None
    finally:
        db.close()


def test_mitarbeiter_kann_kein_konto_loeschen(client, inhaber, anna):
    zweite = _person("zweite@example.com", "Zweite Person")
    kopf = _login(client, "anna@example.com")
    assert client.delete(
        f"/api/v1/sysadmin/users/{zweite['user']}", headers=kopf).status_code == 403


def test_loeschen_ohne_anmeldung_geht_nicht(client, inhaber, anna):
    # Ohne Sitzung gibt es auch kein CSRF-Cookie; die Pruefung dort greift
    # zuerst und weist mit 403 ab. Entscheidend ist, dass nichts passiert.
    assert client.delete(f"/api/v1/sysadmin/users/{anna['user']}").status_code == 403

    db = SessionLocal()
    try:
        assert db.get(User, anna["user"]) is not None
    finally:
        db.close()


def test_loeschen_braucht_csrf_token(client, inhaber, anna):
    client.post("/api/v1/auth/login",
                json={"email": "inhaber@example.com", "password": PASSWORD})
    assert client.delete(f"/api/v1/sysadmin/users/{anna['user']}").status_code == 403


# ============================================ Deaktivieren ist kein Loeschen

def test_deaktivieren_laesst_das_konto_bestehen(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.put(f"/api/v1/sysadmin/users/{anna['user']}",
                         json={"is_active": False}, headers=kopf)
    assert antwort.status_code == 200

    db = SessionLocal()
    try:
        konto = db.get(User, anna["user"])
        assert konto is not None
        assert konto.is_active is False
        # Nichts wurde entfernt - Adresse, Name und Profil stehen noch.
        assert konto.email == "anna@example.com"
        assert db.get(Employee, anna["employee"]) is not None
    finally:
        db.close()


def test_deaktiviertes_konto_kommt_nicht_mehr_rein_und_laesst_sich_zurueckholen(
    client, inhaber, anna
):
    kopf = _login(client, "inhaber@example.com")
    client.put(f"/api/v1/sysadmin/users/{anna['user']}",
               json={"is_active": False}, headers=kopf)

    gesperrt = TestClient(app)
    assert gesperrt.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD}).status_code != 200

    client.put(f"/api/v1/sysadmin/users/{anna['user']}",
               json={"is_active": True}, headers=kopf)

    wieder = TestClient(app)
    assert wieder.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD}).status_code == 200


# ================================================== Loeschen loescht wirklich

def test_konto_ohne_daten_verschwindet_vollstaendig(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["employee_profile"] == "deleted"

    db = SessionLocal()
    try:
        assert db.get(User, anna["user"]) is None
        assert db.get(Employee, anna["employee"]) is None
        # Kein Rest, mit dem sich anmelden liesse.
        assert db.query(User).filter(User.email == "anna@example.com").count() == 0
    finally:
        db.close()


def test_geloeschtes_konto_kann_sich_nicht_mehr_anmelden(client, inhaber, anna):
    kopf = _login(client, "inhaber@example.com")
    client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)

    versuch = TestClient(app)
    assert versuch.post("/api/v1/auth/login", json={
        "email": "anna@example.com", "password": PASSWORD}).status_code != 200


def test_laufende_sitzung_des_geloeschten_kontos_ist_sofort_ungueltig(
    client, inhaber, anna
):
    """Das Konto wird bei jeder Anfrage frisch nachgeschlagen - eine noch
    offene Sitzung darf nicht weiterlaufen."""
    annas_sitzung = TestClient(app)
    _login(annas_sitzung, "anna@example.com")
    assert annas_sitzung.get("/api/v1/auth/me").status_code == 200

    kopf = _login(client, "inhaber@example.com")
    client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)

    assert annas_sitzung.get("/api/v1/auth/me").status_code == 401


def test_loeschen_ist_kein_deaktivieren(client, inhaber, anna):
    """Die Kernzusicherung: kein Haken, sondern ein entfernter Datensatz."""
    kopf = _login(client, "inhaber@example.com")
    client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)

    db = SessionLocal()
    try:
        assert db.query(User).filter(User.id == anna["user"]).count() == 0
    finally:
        db.close()


def test_anhaengende_einstellungen_verschwinden_mit(client, inhaber, anna):
    db = SessionLocal()
    try:
        from app.models import Permission
        db.add(UserPermission(user_id=anna["user"],
                              permission=Permission.EXPORT, allowed=False))
        db.add(PushSubscription(user_id=anna["user"], endpoint="https://push/1",
                                p256dh="x", auth="y"))
        db.add(Notification(user_id=anna["user"], kind="test", title="Hinweis"))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "inhaber@example.com")
    assert client.delete(
        f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf).status_code == 200

    db = SessionLocal()
    try:
        assert db.query(UserPermission).filter(
            UserPermission.user_id == anna["user"]).count() == 0
        assert db.query(PushSubscription).filter(
            PushSubscription.user_id == anna["user"]).count() == 0
        assert db.query(Notification).filter(
            Notification.user_id == anna["user"]).count() == 0
    finally:
        db.close()


# =============================================== Historie bleibt konsistent

def test_verkaufshistorie_ueberlebt_die_loeschung(client, inhaber, anna):
    """Der Punkt, an dem eine blinde Loeschung entweder scheitert oder die
    Umsaetze frueherer Monate mitnimmt."""
    daten = _verkauf_anlegen(anna["employee"])

    kopf = _login(client, "inhaber@example.com")
    antwort = client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["employee_profile"] == "anonymized"

    db = SessionLocal()
    try:
        # Konto fort, Zahlen da.
        assert db.get(User, anna["user"]) is None
        assert db.get(Sale, daten["sale"]) is not None
        assert db.get(Customer, daten["customer"]) is not None

        profil = db.get(Employee, anna["employee"])
        assert profil is not None
        # Entkoppelt und ohne persoenliche Angaben.
        assert profil.user_id is None
        assert profil.display_name == GELOESCHT_ANZEIGENAME
        assert profil.team_id is None
    finally:
        db.close()


def test_das_protokoll_bleibt_lesbar(client, inhaber, anna):
    """Die Audit-Eintraege sind der Nachweis, was frueher geschah - sie
    duerfen mit dem Konto nicht verschwinden."""
    db = SessionLocal()
    try:
        db.add(AuditLog(user_id=anna["user"], action="sale.created",
                        entity_type="sale", entity_id="egal"))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "inhaber@example.com")
    client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)

    db = SessionLocal()
    try:
        alt = db.query(AuditLog).filter(AuditLog.action == "sale.created").all()
        assert len(alt) == 1
        assert alt[0].user_id is None

        loeschung = db.query(AuditLog).filter(
            AuditLog.action == "sysadmin.user_deleted").all()
        assert len(loeschung) == 1
        # Wer, wann, welches Konto.
        assert loeschung[0].user_id == inhaber["user"]
        assert loeschung[0].before_json["email"] == "anna@example.com"
        assert loeschung[0].created_at is not None
    finally:
        db.close()


def test_geloeschter_mitarbeiter_bleibt_in_auswertungen_sichtbar(
    client, inhaber, chef, anna
):
    """Der namenlose Rest darf nicht aus den Listen fallen - sonst fehlten
    die Umsaetze frueherer Monate."""
    _verkauf_anlegen(anna["employee"])
    kopf = _login(client, "inhaber@example.com")
    client.delete(f"/api/v1/sysadmin/users/{anna['user']}", headers=kopf)

    leiterkopf = _login(client, "chef@example.com")
    liste = client.get("/api/v1/team/employees", headers=leiterkopf).json()
    assert anna["employee"] in [e["id"] for e in liste]


# ========================================================= Keine Sackgassen

def test_der_eigene_zugang_laesst_sich_nicht_loeschen(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    antwort = client.delete(f"/api/v1/sysadmin/users/{inhaber['user']}", headers=kopf)
    assert antwort.status_code == 400
    assert "eigene" in antwort.json()["detail"].lower()

    db = SessionLocal()
    try:
        assert db.get(User, inhaber["user"]) is not None
    finally:
        db.close()


def test_der_letzte_systemadministrator_bleibt(client, inhaber):
    """Zwei Betreiber: einer darf gehen. Der letzte nicht."""
    zweiter = _person("zweiter@example.com", "Zweiter Inhaber", Role.SYSTEM_ADMIN)
    kopf = _login(client, "inhaber@example.com")

    # Solange es zwei gibt, ist das erlaubt.
    assert client.delete(
        f"/api/v1/sysadmin/users/{zweiter['user']}", headers=kopf).status_code == 200

    # Danach ist "inhaber" der letzte - und sich selbst loeschen geht ohnehin
    # nicht. Auch das Herabstufen bleibt versperrt.
    dritter = _person("dritter@example.com", "Dritter Inhaber", Role.SYSTEM_ADMIN)
    dritterkopf = _login(client, "dritter@example.com")
    assert client.put(f"/api/v1/sysadmin/users/{inhaber['user']}",
                      json={"is_active": False}, headers=dritterkopf).status_code == 200
    # Jetzt ist "dritter" der einzige aktive Betreiber.
    antwort = client.delete(
        f"/api/v1/sysadmin/users/{dritter['user']}", headers=dritterkopf)
    assert antwort.status_code == 400


def test_letzter_aktiver_systemadministrator_wird_nicht_herabgestuft(client, inhaber):
    """Ein Herabstufen wuerde dieselbe Sackgasse erzeugen wie ein Loeschen."""
    zweiter = _person("zweiter@example.com", "Zweiter Inhaber", Role.SYSTEM_ADMIN)
    kopf = _login(client, "zweiter@example.com")

    # "inhaber" ist nach dieser Aenderung nicht mehr Betreiber - erlaubt,
    # weil "zweiter" noch da ist.
    assert client.put(f"/api/v1/sysadmin/users/{inhaber['user']}",
                      json={"role": "EMPLOYEE"}, headers=kopf).status_code == 200

    # "zweiter" ist jetzt der letzte und kann sich selbst nicht herabstufen.
    antwort = client.put(f"/api/v1/sysadmin/users/{zweiter['user']}",
                         json={"role": "EMPLOYEE"}, headers=kopf)
    assert antwort.status_code == 400


def test_unbekanntes_konto_ergibt_vierhundertvier(client, inhaber):
    kopf = _login(client, "inhaber@example.com")
    assert client.delete(
        "/api/v1/sysadmin/users/gibtesnicht", headers=kopf).status_code == 404
