"""Tests fuer die Feedback-Funktion (POST /feedback).

Zwei Fragen stehen im Mittelpunkt:

1. Kommt das Feedback bei jedem aktiven Systemadministrator an - als private
   Nachricht im vorhandenen Nachrichtensystem, ohne jeden Mailversand?
2. Bekommt es sonst niemand zu sehen - kein Teamleiter, kein Regionalleiter,
   kein anderer Mitarbeiter?

Dazu kommen die Faelle, die frueher Dubletten erzeugt haben: ein Fehlschlag
mitten im Vorgang darf kein halb gespeichertes Feedback hinterlassen.
"""
import os
import tempfile

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import feedback_limiter, login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Employee,
    Feedback,
    Message,
    MessageHidden,
    Role,
    User,
)

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    feedback_limiter.clear()
    yield
    login_limiter.clear()
    feedback_limiter.clear()


@pytest.fixture(autouse=True)
def _smtp_ist_tabu(monkeypatch):
    """Jeder SMTP-Weg wird zur Falle.

    Die Feedback-Funktion darf keinen davon mehr betreten. Ein Aufruf laesst
    den Test sofort scheitern - deutlicher als jede nachtraegliche
    Zaehlpruefung, und es faellt auch auf, wenn der Versand ueber einen
    anderen Weg zurueckkommt.
    """
    import smtplib

    import app.routers.auth as auth_module
    import app.services.mail as mail_module

    def falle(*args, **kwargs):
        raise AssertionError("Beim Feedback darf kein SMTP-Code laufen")

    monkeypatch.setattr(smtplib, "SMTP", falle)
    monkeypatch.setattr(smtplib, "SMTP_SSL", falle, raising=False)
    monkeypatch.setattr(mail_module, "send_email", falle)
    monkeypatch.setattr(auth_module, "_send_password_reset_email", falle)


def _person(email, name, role=Role.EMPLOYEE, aktiv=True):
    db = SessionLocal()
    try:
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=role, must_change_password=False, is_active=aktiv)
        db.add(user)
        db.flush()
        db.add(Employee(user_id=user.id, display_name=name))
        db.commit()
        return user.id
    finally:
        db.close()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _payload(**overrides):
    payload = {
        "category": "bug",
        "subject": "Verkauf lässt sich nicht speichern",
        "message": "Beim Klick auf Speichern passiert nichts. Erwartet: Bestätigung. Reproduzierbar im Firefox.",
        "page_path": "/verkaeufe",
    }
    payload.update(overrides)
    return payload


def _nachrichten_an(user_id: str) -> list[Message]:
    """Was dieser Benutzer in seinem Postfach tatsaechlich sieht.

    Bewusst mit derselben Bedingung wie die Nachrichtenliste selbst
    (routers/messages.py: access_condition + visible_stmt) - inklusive der
    ausgeblendeten Nachrichten.
    """
    db = SessionLocal()
    try:
        versteckt = {
            h.message_id for h in db.query(MessageHidden).filter(MessageHidden.user_id == user_id).all()
        }
        alle = db.query(Message).all()
        return [
            m for m in alle
            if m.id not in versteckt
            and (
                m.recipient_user_id is None
                or m.recipient_user_id == user_id
                or m.sender_user_id == user_id
            )
        ]
    finally:
        db.close()


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin", Role.EMPLOYEE)


@pytest.fixture
def bernd():
    """Ein zweiter Mitarbeiter - er darf Annas Feedback nie sehen."""
    return _person("bernd@example.com", "Bernd Mitarbeiter", Role.EMPLOYEE)


@pytest.fixture
def chef():
    return _person("chef@example.com", "Carl Chef", Role.TEAM_LEADER)


@pytest.fixture
def leitung():
    return _person("leitung@example.com", "Olga Leitung", Role.REGIONAL_LEAD)


@pytest.fixture
def inhaber():
    return _person("inhaber@example.com", "Ida Inhaberin", Role.SYSTEM_ADMIN)


@pytest.fixture
def zweiter_inhaber():
    return _person("inhaber2@example.com", "Ingo Inhaber", Role.SYSTEM_ADMIN)


@pytest.fixture
def stiller_inhaber():
    """Deaktivierter Systemadministrator - bekommt nichts mehr."""
    return _person("alt@example.com", "Alter Inhaber", Role.SYSTEM_ADMIN, aktiv=False)


# ------------------------------------------------- Feedback wird gespeichert

def test_mitarbeiterin_sendet_feedback_erfolgreich(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["ok"] is True
    assert daten["reference"].startswith("FDB-")
    assert daten["recipients"] == 1


def test_feedback_datensatz_wird_gespeichert(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    db = SessionLocal()
    try:
        eintrag = db.query(Feedback).filter(Feedback.reference == antwort.json()["reference"]).one()
        assert eintrag.user_id == anna
        assert eintrag.category.value == "bug"
        assert eintrag.subject == _payload()["subject"]
        assert eintrag.message == _payload()["message"]
        assert eintrag.page_path == "/verkaeufe"
        assert eintrag.delivered_at is not None
        assert eintrag.admin_message_count == 1
    finally:
        db.close()


@pytest.mark.parametrize("rolle_fixture,email", [
    ("anna", "anna@example.com"),
    ("chef", "chef@example.com"),
    ("leitung", "leitung@example.com"),
])
def test_jede_rolle_kann_feedback_senden(client, rolle_fixture, email, inhaber, request):
    request.getfixturevalue(rolle_fixture)
    kopf = _login(client, email)
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert antwort.status_code == 200, antwort.text


# --------------------------------------- Systemadmin bekommt die Nachricht

def test_systemadmin_erhaelt_private_nachricht(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    nachrichten = _nachrichten_an(inhaber)
    assert len(nachrichten) == 1
    nachricht = nachrichten[0]
    # Privat, nicht Team: eine Teamnachricht (recipient_user_id is NULL)
    # saehe jeder Benutzer.
    assert nachricht.recipient_user_id == inhaber
    assert nachricht.sender_user_id == anna


def test_nachricht_enthaelt_kategorie_betreff_text_absender_und_seite(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    referenz = antwort.json()["reference"]

    text = _nachrichten_an(inhaber)[0].body

    assert "Fehler / Bug" in text                       # Kategorie
    assert _payload()["subject"] in text                # Betreff
    assert _payload()["message"] in text                # vollständiger Text
    assert "Anna Mitarbeiterin" in text                 # Absender
    assert "anna@example.com" in text                   # Benutzer-E-Mail
    assert "Mitarbeiter" in text                        # Rolle
    assert "/verkaeufe" in text                         # aktuelle Seite
    assert referenz in text                             # Feedback-Referenz
    assert text.startswith("Feedback: Fehler / Bug – ")  # Betreffzeile


def test_langer_feedbacktext_wird_nicht_abgeschnitten(client, anna, inhaber):
    """Der Systemadministrator soll lesen, was geschrieben wurde - alles."""
    langer_text = "Ausführliche Fehlerbeschreibung. " * 200
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(message=langer_text), headers=kopf)

    assert langer_text.strip() in _nachrichten_an(inhaber)[0].body


def test_mehrere_aktive_systemadmins_erhalten_je_eine_eigene_nachricht(
    client, anna, inhaber, zweiter_inhaber
):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert antwort.json()["recipients"] == 2

    for admin in (inhaber, zweiter_inhaber):
        eigene = _nachrichten_an(admin)
        assert len(eigene) == 1
        assert eigene[0].recipient_user_id == admin

    db = SessionLocal()
    try:
        # Zwei eigenstaendige Datensaetze, nicht eine Nachricht mit zwei
        # Empfaengern - sonst waere "gelesen" fuer beide dasselbe.
        assert db.query(Message).count() == 2
    finally:
        db.close()


def test_inaktiver_systemadmin_erhaelt_nichts(client, anna, inhaber, stiller_inhaber):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert antwort.json()["recipients"] == 1
    assert _nachrichten_an(stiller_inhaber) == []


def test_ohne_aktiven_systemadmin_wird_nichts_gespeichert(client, anna):
    """Ein Feedback, das niemand bekommt, ist kein gesendetes Feedback."""
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert antwort.status_code == 503
    assert "Systemadministrator" in antwort.json()["detail"]

    db = SessionLocal()
    try:
        assert db.query(Feedback).count() == 0
        assert db.query(Message).count() == 0
    finally:
        db.close()


def test_empfaenger_werden_ueber_die_rolle_gefunden_nicht_ueber_den_namen(client, anna):
    """Ein neu ernannter Systemadministrator bekommt Feedback ohne Pflege."""
    kopf = _login(client, "anna@example.com")
    assert client.post("/api/v1/feedback", json=_payload(), headers=kopf).status_code == 503

    spaeter = _person("spaeter@example.com", "Späte Systemadministration", Role.SYSTEM_ADMIN)
    antwort = client.post("/api/v1/feedback", json=_payload(subject="Zweiter Versuch"), headers=kopf)

    assert antwort.status_code == 200, antwort.text
    assert len(_nachrichten_an(spaeter)) == 1


# ------------------------------------------------------------- Vertraulich

def test_anderer_mitarbeiter_sieht_das_feedback_nicht(client, anna, bernd, inhaber):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert _nachrichten_an(bernd) == []

    kopf_bernd = _login(client, "bernd@example.com")
    liste = client.get("/api/v1/messages", headers=kopf_bernd).json()
    assert liste == []


def test_teamleiter_sieht_das_feedback_nicht(client, anna, chef, inhaber):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert _nachrichten_an(chef) == []

    kopf_chef = _login(client, "chef@example.com")
    assert client.get("/api/v1/messages", headers=kopf_chef).json() == []
    assert client.get("/api/v1/messages/unread", headers=kopf_chef).json()["total"] == 0


def test_regionalleiter_sieht_das_feedback_nicht(client, anna, leitung, inhaber):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert _nachrichten_an(leitung) == []

    kopf_leitung = _login(client, "leitung@example.com")
    assert client.get("/api/v1/messages", headers=kopf_leitung).json() == []


def test_absenderin_sieht_keine_kopie_die_das_admin_konto_verraet(client, anna, inhaber):
    """Für Mitarbeiter existiert ein Systemadministratorkonto nicht.

    Eine sichtbare Nachricht "an Ida Inhaberin" wäre genau die Auskunft,
    die core/benutzerscope.py bewusst zurückhält. Die Bestätigung bekommt
    die Absenderin über die Referenznummer.
    """
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert _nachrichten_an(anna) == []
    assert client.get("/api/v1/messages", headers=kopf).json() == []


@pytest.mark.parametrize("email", [
    "chef@example.com",      # Teamleiter
    "bernd@example.com",     # anderer Mitarbeiter
    "anna@example.com",      # die Absenderin selbst
])
def test_feedback_taucht_nicht_in_der_globalen_suche_auf(
    client, anna, bernd, chef, inhaber, email
):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(subject="Streusalzige Suchprobe"), headers=kopf)

    kopf_suche = _login(client, email)
    treffer = client.get("/api/v1/search?q=Streusalzige", headers=kopf_suche).json()
    assert "Streusalzige" not in str(treffer)


def test_systemadmin_bekommt_das_feedback_als_ungelesene_nachricht(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    kopf_admin = _login(client, "inhaber@example.com")
    ungelesen = client.get("/api/v1/messages/unread", headers=kopf_admin).json()
    assert ungelesen["total"] == 1
    assert ungelesen["by_user"].get(anna) == 1


def test_systemadmin_sieht_das_feedback_im_postfach(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    kopf_admin = _login(client, "inhaber@example.com")
    liste = client.get("/api/v1/messages", headers=kopf_admin).json()
    assert len(liste) == 1
    assert "Fehler / Bug" in liste[0]["body"]
    assert liste[0]["sender_name"] == "Anna Mitarbeiterin"


def test_systemadmin_bekommt_eine_benachrichtigung_in_der_glocke(client, anna, inhaber):
    """Kein zweiter Benachrichtigungsweg - das vorhandene System genügt."""
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    kopf_admin = _login(client, "inhaber@example.com")
    meldungen = client.get("/api/v1/notifications", headers=kopf_admin).json()
    arten = {m["kind"] for m in meldungen}
    assert "message_new" in arten


# ------------------------------------------------------------- Kein SMTP

def test_kein_smtp_aufruf_beim_feedback(client, anna, inhaber):
    """Die Fixture _smtp_ist_tabu laesst jeden SMTP-Weg scheitern."""
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert antwort.status_code == 200, antwort.text


def test_feedback_modul_importiert_nichts_aus_dem_mailweg():
    """Statische Gegenprobe ueber die Importe, nicht ueber den Fliesstext.

    Geprueft wird der Syntaxbaum: welche Module der Router einbindet und
    welche Namen er daraus zieht. Ein Kommentar, der den alten Mailweg nur
    beschreibt, darf hier nicht anschlagen - ein wieder eingefuehrter
    Import dagegen sofort.
    """
    import ast
    import inspect

    import app.routers.feedback as feedback_module

    baum = ast.parse(inspect.getsource(feedback_module))

    module: set[str] = set()
    namen: set[str] = set()
    for knoten in ast.walk(baum):
        if isinstance(knoten, ast.Import):
            module.update(alias.name for alias in knoten.names)
        elif isinstance(knoten, ast.ImportFrom):
            module.add(knoten.module or "")
            namen.update(alias.name for alias in knoten.names)

    verbotene_module = {"smtplib", "email.message", "app.services.mail"}
    assert not (module & verbotene_module), f"Feedback bindet wieder ein: {module & verbotene_module}"

    verbotene_namen = {"send_email", "EmailMessage", "SMTP", "mail_configured"}
    assert not (namen & verbotene_namen), f"Feedback holt wieder: {namen & verbotene_namen}"

    # Und keine Einstellung mit einer Feedback-Zieladresse mehr.
    assert "feedback_email_to" not in inspect.getsource(feedback_module)


def test_keine_meldung_ueber_fehlgeschlagenen_versand(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert "Versand" not in antwort.text
    assert "email_sent" not in antwort.json()


# ------------------------------------------------- Transaktion und Dubletten

def test_fehler_beim_zustellen_erzeugt_keine_feedback_dublette(client, anna, inhaber, monkeypatch):
    """Der Fall, der frueher zwei Feedbacks hinterliess.

    Frueher: Feedback speichern, Mail scheitert, Benutzer klickt erneut,
    zweites Feedback. Jetzt laeuft beides in einer Transaktion - scheitert
    das Zustellen, bleibt gar nichts stehen, und ein zweiter Anlauf ist der
    erste erfolgreiche.
    """
    import app.routers.feedback as feedback_module

    from sqlalchemy.exc import OperationalError

    def kaputt(*args, **kwargs):
        raise OperationalError("stmt", {}, Exception("Verbindung weg"))

    monkeypatch.setattr(feedback_module, "_nachrichten_anlegen", kaputt)

    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert antwort.status_code == 500
    assert antwort.json()["detail"] == (
        "Feedback konnte nicht gesendet werden. Bitte versuche es erneut."
    )
    # Keine Interna nach aussen.
    assert "Verbindung weg" not in antwort.text

    db = SessionLocal()
    try:
        assert db.query(Feedback).count() == 0
        assert db.query(Message).count() == 0
    finally:
        db.close()

    # Der zweite Anlauf ist der erste erfolgreiche - genau ein Feedback.
    monkeypatch.undo()
    zweite = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert zweite.status_code == 200, zweite.text

    db = SessionLocal()
    try:
        assert db.query(Feedback).count() == 1
    finally:
        db.close()


def test_nachricht_und_feedback_entstehen_gemeinsam(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    db = SessionLocal()
    try:
        assert db.query(Feedback).count() == 1
        assert db.query(Message).count() == 1
    finally:
        db.close()


def test_referenz_ist_eindeutig_und_faengt_bei_eins_an(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    a = client.post("/api/v1/feedback", json=_payload(subject="Erstes"), headers=kopf).json()
    b = client.post("/api/v1/feedback", json=_payload(subject="Zweites"), headers=kopf).json()
    assert a["reference"] != b["reference"]
    assert a["reference"].endswith("000001")
    assert b["reference"].endswith("000002")


# ------------------------------------------------------- Eingabepruefungen

def test_ohne_anmeldung_401(client):
    antwort = client.post("/api/v1/feedback", json=_payload())
    assert antwort.status_code == 401


def test_ohne_csrf_token_abgelehnt(client, anna, inhaber):
    _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload())
    assert antwort.status_code == 403


@pytest.mark.parametrize("feld,wert", [
    ("subject", ""),
    ("subject", "    "),
    ("subject", "x" * 201),
    ("subject", "Normal\r\nBcc: angreifer@example.com"),
    ("message", ""),
    ("message", "       "),
    ("message", "zu kurz"),
    ("message", "x" * 8001),
    ("page_path", "/verkaeufe\r\nX-Injected: true"),
    ("category", "voellig_frei_erfunden"),
])
def test_ungueltige_eingaben_werden_abgelehnt(client, anna, inhaber, feld, wert):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(**{feld: wert}), headers=kopf)
    assert antwort.status_code == 422

    db = SessionLocal()
    try:
        assert db.query(Feedback).count() == 0
        assert db.query(Message).count() == 0
    finally:
        db.close()


def test_manipulierte_user_id_wird_ignoriert(client, anna, inhaber):
    """Absender kommt aus der Sitzung, nie aus dem Request."""
    kopf = _login(client, "anna@example.com")
    fremde_id = "eine-fremde-benutzer-id"
    antwort = client.post(
        "/api/v1/feedback",
        json={**_payload(), "user_id": fremde_id, "role": "SYSTEM_ADMIN"},
        headers=kopf,
    )
    assert antwort.status_code == 200, antwort.text

    db = SessionLocal()
    try:
        eintrag = db.query(Feedback).filter(Feedback.reference == antwort.json()["reference"]).one()
        assert eintrag.user_id == anna
        assert eintrag.user_id != fremde_id
    finally:
        db.close()

    # Auch der Nachrichtentext nennt die echte Rolle, nicht die behauptete.
    assert "Mitarbeiter" in _nachrichten_an(inhaber)[0].body


# ------------------------------------------------------------- Rate Limit

def test_rate_limit_greift_nach_zu_vielen_feedbacks(client, anna, inhaber):
    kopf = _login(client, "anna@example.com")
    codes = [
        client.post("/api/v1/feedback", json=_payload(subject=f"Betreff {i}"), headers=kopf).status_code
        for i in range(6)
    ]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


def test_rate_limit_gilt_je_benutzer_nicht_global(client, anna, chef, inhaber):
    kopf_anna = _login(client, "anna@example.com")
    for i in range(5):
        assert client.post(
            "/api/v1/feedback", json=_payload(subject=f"Betreff {i}"), headers=kopf_anna
        ).status_code == 200
    assert client.post("/api/v1/feedback", json=_payload(), headers=kopf_anna).status_code == 429

    kopf_chef = _login(client, "chef@example.com")
    assert client.post("/api/v1/feedback", json=_payload(), headers=kopf_chef).status_code == 200
