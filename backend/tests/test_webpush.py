"""Prueft den tatsaechlichen Push-Versand gegen einen lokalen Push-Dienst.

Warum mit echtem HTTP-Server statt mit einer Attrappe: ob die
Verschluesselung nach RFC 8291 stimmt, zeigt sich erst am fertigen Paket.
Eine Attrappe wuerde jeden Fehler darin verschlucken - und ein falsch
verschluesseltes Paket faellt im Betrieb nicht auf, es kommt einfach nie an.
"""
import base64
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import Notification, PushSubscription, User  # noqa: E402
from app.services import webpush  # noqa: E402

# Ein Wegwerf-Schluesselpaar allein fuer diesen Test.
TEST_PUBLIC = "BMr8fn25yy5EVQAqUwO2OSIRdlhEezDzPhSOvO7qsWRIHsYgC1_B8cho_PJ5z9hDHhu3O1vM8shJlxBq0666A2w"
TEST_PRIVATE = "ZP2azESXPiaJGjEswvUo9i8od6m4Km_rlQLAjk1KCAI"


class _PushDienst(BaseHTTPRequestHandler):
    """Nimmt Push-Pakete entgegen und merkt sie sich."""

    empfangen: list = []
    antwort_status = 201

    def do_POST(self):  # noqa: N802 - von BaseHTTPRequestHandler vorgegeben
        laenge = int(self.headers.get("Content-Length", 0))
        _PushDienst.empfangen.append({
            "pfad": self.path,
            "body": self.rfile.read(laenge),
            "headers": {k.lower(): v for k, v in self.headers.items()},
        })
        self.send_response(_PushDienst.antwort_status)
        self.end_headers()

    def log_message(self, *args):  # Testlauf nicht zumuellen
        pass


@pytest.fixture
def push_dienst():
    _PushDienst.empfangen = []
    _PushDienst.antwort_status = 201
    server = HTTPServer(("127.0.0.1", 0), _PushDienst)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server, _PushDienst
    server.shutdown()


@pytest.fixture
def vapid(monkeypatch):
    monkeypatch.setenv("VAPID_PUBLIC_KEY", TEST_PUBLIC)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", TEST_PRIVATE)
    monkeypatch.setenv("VAPID_CONTACT_EMAIL", "betrieb@example.com")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def _empfaenger_schluessel() -> tuple[str, str]:
    """Ein Schluesselpaar, wie es ein Browser beim Anmelden liefert."""
    schluessel = ec.generate_private_key(ec.SECP256R1())
    p256dh = base64.urlsafe_b64encode(
        schluessel.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    ).decode().rstrip("=")
    auth = base64.urlsafe_b64encode(os.urandom(16)).decode().rstrip("=")
    return p256dh, auth


def _benutzer_mit_geraet(db, server, anzahl_geraete=1):
    user = User(email="anna@example.com", full_name="Anna", password_hash=hash_password("x"),
                must_change_password=False)
    db.add(user)
    db.flush()
    port = server.server_address[1]
    for i in range(anzahl_geraete):
        p256dh, auth = _empfaenger_schluessel()
        db.add(PushSubscription(
            user_id=user.id, endpoint=f"http://127.0.0.1:{port}/push/geraet{i}",
            p256dh=p256dh, auth=auth,
        ))
    meldung = Notification(user_id=user.id, kind="appointment_soon", title="Termin um 14:00",
                           body="Max Muster", link="/termine", dedupe_key="appointment_soon:1")
    db.add(meldung)
    db.commit()
    return user, meldung


def test_ohne_schluessel_ist_push_abgeschaltet(db):
    get_settings.cache_clear()
    assert webpush.push_verfuegbar() is False
    assert webpush.senden(db, []) == 0


def test_paket_ist_nach_standard_verschluesselt(db, push_dienst, vapid):
    server, dienst = push_dienst
    _, meldung = _benutzer_mit_geraet(db, server)

    assert webpush.senden(db, [meldung]) == 1
    assert len(dienst.empfangen) == 1

    paket = dienst.empfangen[0]
    assert paket["headers"]["content-encoding"] == "aes128gcm"
    assert "vapid" in paket["headers"]["authorization"].lower()
    assert paket["headers"].get("ttl") is not None
    # Der Inhalt darf unterwegs nicht lesbar sein.
    assert b"Termin um 14:00" not in paket["body"]
    assert b"Max Muster" not in paket["body"]


def test_jedes_geraet_des_benutzers_bekommt_die_meldung(db, push_dienst, vapid):
    server, dienst = push_dienst
    _, meldung = _benutzer_mit_geraet(db, server, anzahl_geraete=3)

    assert webpush.senden(db, [meldung]) == 3
    assert len(dienst.empfangen) == 3


def test_abgemeldetes_geraet_wird_entfernt(db, push_dienst, vapid):
    """Antwortet der Dienst mit 410, gibt es das Geraet nicht mehr."""
    server, dienst = push_dienst
    dienst.antwort_status = 410
    user, meldung = _benutzer_mit_geraet(db, server)

    assert webpush.senden(db, [meldung]) == 0
    verbleibend = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).count()
    assert verbleibend == 0, "Ein abgemeldetes Gerät muss verschwinden, sonst wird es ewig erneut versucht"


def test_serverfehler_entfernt_das_geraet_nicht(db, push_dienst, vapid):
    """Ein voruebergehender Fehler darf die Anmeldung nicht wegwerfen."""
    server, dienst = push_dienst
    dienst.antwort_status = 500
    user, meldung = _benutzer_mit_geraet(db, server)

    assert webpush.senden(db, [meldung]) == 0
    verbleibend = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).count()
    assert verbleibend == 1


def test_nicht_erreichbarer_dienst_wirft_nicht(db, push_dienst, vapid):
    """Der Aufrufer wollte sein Postfach lesen - ein totes Geraet darf das nicht stoeren."""
    server, _ = push_dienst
    user, meldung = _benutzer_mit_geraet(db, server)
    # Endpunkt auf einen Port umbiegen, auf dem nichts lauscht.
    anmeldung = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).one()
    anmeldung.endpoint = "http://127.0.0.1:1/push/tot"
    db.commit()

    assert webpush.senden(db, [meldung]) == 0


# ------------------------------------------------------- An- und Abmelden
# Der Browser-Teil dieses Ablaufs laesst sich hier nicht fahren (Chrome
# sperrt die Push-API im Inkognito-Modus, und ein echtes Profil braucht eine
# Verbindung zum Push-Dienst des Herstellers). Geprueft wird deshalb die
# Serverseite mit genau der Nutzlast, die der Browser liefert.

@pytest.fixture
def client(vapid):
    from fastapi.testclient import TestClient

    from app.main import app

    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


def _angemeldet(client):
    from app.core.ratelimit import login_limiter

    login_limiter.clear()
    db = SessionLocal()
    try:
        db.add(User(email="anna@example.com", full_name="Anna",
                    password_hash=hash_password("PasswortPasswort1"),
                    must_change_password=False))
        db.commit()
    finally:
        db.close()
    antwort = client.post("/api/v1/auth/login",
                          json={"email": "anna@example.com", "password": "PasswortPasswort1"})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _anmeldung_json(endpoint="https://fcm.example.com/abc123"):
    p256dh, auth = _empfaenger_schluessel()
    return {"endpoint": endpoint, "p256dh": p256dh, "auth": auth, "user_agent": "Mozilla/5.0 Test"}


def test_geraet_anmelden_und_wieder_abmelden(client):
    kopf = _angemeldet(client)
    nutzlast = _anmeldung_json()

    assert client.post("/api/v1/notifications/push/subscribe", json=nutzlast, headers=kopf).status_code == 200

    geraete = client.get("/api/v1/notifications/push/devices", headers=kopf).json()
    assert len(geraete) == 1
    assert geraete[0]["user_agent"] == "Mozilla/5.0 Test"

    assert client.post("/api/v1/notifications/push/unsubscribe",
                       json={"endpoint": nutzlast["endpoint"]}, headers=kopf).status_code == 200
    assert client.get("/api/v1/notifications/push/devices", headers=kopf).json() == []


def test_dasselbe_geraet_meldet_sich_nicht_doppelt_an(client):
    """Nach einem Browserneustart kommt derselbe Endpunkt erneut - er darf
    keinen zweiten Eintrag erzeugen, sonst bekaeme das Geraet alles doppelt."""
    kopf = _angemeldet(client)
    nutzlast = _anmeldung_json()

    client.post("/api/v1/notifications/push/subscribe", json=nutzlast, headers=kopf)
    client.post("/api/v1/notifications/push/subscribe", json=nutzlast, headers=kopf)

    assert len(client.get("/api/v1/notifications/push/devices", headers=kopf).json()) == 1


def test_fremdes_geraet_laesst_sich_nicht_abmelden(client):
    """Der Endpunkt allein darf nicht genuegen, um jemanden abzumelden."""
    kopf = _angemeldet(client)
    nutzlast = _anmeldung_json()
    client.post("/api/v1/notifications/push/subscribe", json=nutzlast, headers=kopf)

    # Ein zweiter Benutzer versucht, den fremden Endpunkt abzumelden.
    from app.core.ratelimit import login_limiter

    login_limiter.clear()
    db = SessionLocal()
    try:
        db.add(User(email="bodo@example.com", full_name="Bodo",
                    password_hash=hash_password("PasswortPasswort1"),
                    must_change_password=False))
        db.commit()
    finally:
        db.close()
    client.post("/api/v1/auth/login", json={"email": "bodo@example.com", "password": "PasswortPasswort1"})
    fremd_kopf = {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}
    client.post("/api/v1/notifications/push/unsubscribe",
                json={"endpoint": nutzlast["endpoint"]}, headers=fremd_kopf)

    db = SessionLocal()
    try:
        assert db.query(PushSubscription).count() == 1, "Fremdes Gerät wurde abgemeldet"
    finally:
        db.close()


def test_anmeldung_braucht_csrf_token(client):
    _angemeldet(client)
    antwort = client.post("/api/v1/notifications/push/subscribe", json=_anmeldung_json())
    assert antwort.status_code == 403
