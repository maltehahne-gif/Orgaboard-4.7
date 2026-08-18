"""Tests fuer die Feedback-Funktion (POST /feedback).

Deckt die im Auftrag verlangten Faelle A-O ab. Der Mailversand wird in jedem
Test durch app.routers.feedback.send_email ersetzt - automatisierte Tests
duerfen keine echten E-Mails verschicken.
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
from app.models import Employee, Feedback, Role, User  # noqa: E402

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
def _mail_versand_faelscht(monkeypatch):
    """Standardmaessig 'erfolgreich', ohne jemals wirklich zu verschicken."""
    import app.routers.feedback as feedback_module
    calls: list[dict] = []

    def fake_send_email(to, subject, text_body, html_body=None, attachment=None):
        calls.append({"to": to, "subject": subject, "text_body": text_body, "html_body": html_body})

    monkeypatch.setattr(feedback_module, "send_email", fake_send_email)
    return calls


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


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin", Role.EMPLOYEE)


@pytest.fixture
def chef():
    return _person("chef@example.com", "Carl Chef", Role.TEAM_LEADER)


@pytest.fixture
def leitung():
    return _person("leitung@example.com", "Olga Leitung", Role.REGIONAL_LEAD)


@pytest.fixture
def inhaber():
    return _person("inhaber@example.com", "Ida Inhaberin", Role.SYSTEM_ADMIN)


# TEST A-D: jede Rolle kann gültiges Feedback senden, Empfänger ist die
# konfigurierte Adresse (produktiv: orgaboard@gmail.com).
@pytest.mark.parametrize("rolle_fixture", ["anna", "chef", "leitung", "inhaber"])
def test_jede_rolle_kann_feedback_senden(client, rolle_fixture, request, _mail_versand_faelscht):
    request.getfixturevalue(rolle_fixture)
    email = {"anna": "anna@example.com", "chef": "chef@example.com",
             "leitung": "leitung@example.com", "inhaber": "inhaber@example.com"}[rolle_fixture]
    kopf = _login(client, email)

    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert antwort.status_code == 200, antwort.text
    daten = antwort.json()
    assert daten["ok"] is True
    assert daten["email_sent"] is True
    assert daten["reference"].startswith("FDB-")

    assert len(_mail_versand_faelscht) == 1
    assert _mail_versand_faelscht[0]["to"] == "orgaboard@gmail.com"
    assert "Fehler / Bug" in _mail_versand_faelscht[0]["subject"]


# TEST E: nicht authentifiziert -> 401
def test_ohne_anmeldung_401(client):
    antwort = client.post("/api/v1/feedback", json=_payload())
    assert antwort.status_code == 401


# TEST F: Betreff leer
def test_leerer_betreff_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(subject=""), headers=kopf)
    assert antwort.status_code == 422


def test_betreff_nur_leerzeichen_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(subject="    "), headers=kopf)
    assert antwort.status_code == 422


# TEST G: Nachricht leer
def test_leere_nachricht_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(message=""), headers=kopf)
    assert antwort.status_code == 422


def test_nachricht_nur_leerzeichen_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(message="       "), headers=kopf)
    assert antwort.status_code == 422


def test_zu_kurze_nachricht_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(message="zu kurz"), headers=kopf)
    assert antwort.status_code == 422


# TEST H: Nachricht zu lang
def test_zu_lange_nachricht_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(message="x" * 8001), headers=kopf)
    assert antwort.status_code == 422


def test_zu_langer_betreff_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(subject="x" * 201), headers=kopf)
    assert antwort.status_code == 422


# TEST I: ungültige Kategorie
def test_ungueltige_kategorie_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(category="voellig_frei_erfunden"), headers=kopf)
    assert antwort.status_code == 422


# TEST J: manipulierte user_id - wird ignoriert, Absender bleibt der echte Benutzer
def test_manipulierte_user_id_wird_ignoriert(client, anna):
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


# TEST K: Mailversand schlägt fehl -> kein falscher Erfolg
def test_fehlgeschlagener_mailversand_meldet_keinen_erfolg(client, anna, monkeypatch):
    import app.routers.feedback as feedback_module

    def kaputter_versand(*args, **kwargs):
        raise RuntimeError("Verbindung zum Mailserver fehlgeschlagen")

    monkeypatch.setattr(feedback_module, "send_email", kaputter_versand)

    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)

    assert antwort.status_code == 502
    assert "gespeichert" in antwort.json()["detail"]
    # Niemals Zugangsdaten oder Interna aus der Ausnahme an den Client.
    assert "Verbindung zum Mailserver fehlgeschlagen" not in antwort.text


# TEST L: Rate Limit
def test_rate_limit_greift_nach_zu_vielen_feedbacks(client, anna):
    kopf = _login(client, "anna@example.com")
    codes = [
        client.post("/api/v1/feedback", json=_payload(subject=f"Betreff {i}"), headers=kopf).status_code
        for i in range(6)
    ]
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


def test_rate_limit_gilt_je_benutzer_nicht_global(client, anna, chef):
    kopf_anna = _login(client, "anna@example.com")
    for i in range(5):
        assert client.post("/api/v1/feedback", json=_payload(subject=f"Betreff {i}"), headers=kopf_anna).status_code == 200
    assert client.post("/api/v1/feedback", json=_payload(), headers=kopf_anna).status_code == 429

    # Ein anderer Benutzer ist von Annas Sperre nicht betroffen.
    kopf_chef = _login(client, "chef@example.com")
    assert client.post("/api/v1/feedback", json=_payload(), headers=kopf_chef).status_code == 200


# TEST M: CRLF-/Header-Injection
def test_zeilenumbruch_im_betreff_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post(
        "/api/v1/feedback",
        json=_payload(subject="Normal\r\nBcc: angreifer@example.com"),
        headers=kopf,
    )
    assert antwort.status_code == 422


def test_zeilenumbruch_im_seitenpfad_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post(
        "/api/v1/feedback",
        json=_payload(page_path="/verkaeufe\r\nX-Injected: true"),
        headers=kopf,
    )
    assert antwort.status_code == 422


# TEST N: Datenbankeintrag bei erfolgreichem Mailversand
def test_datenbankeintrag_bei_erfolg_korrekt(client, anna):
    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert antwort.status_code == 200

    db = SessionLocal()
    try:
        eintrag = db.query(Feedback).filter(Feedback.reference == antwort.json()["reference"]).one()
        assert eintrag.email_sent is True
        assert eintrag.email_sent_at is not None
        assert eintrag.email_error is None
        assert eintrag.category.value == "bug"
        assert eintrag.subject == _payload()["subject"]
        assert eintrag.page_path == "/verkaeufe"
    finally:
        db.close()


# TEST O: Datenbankeintrag bei fehlgeschlagenem Mailversand korrekt markiert
def test_datenbankeintrag_bei_fehlschlag_korrekt_markiert(client, anna, monkeypatch):
    import app.routers.feedback as feedback_module

    monkeypatch.setattr(
        feedback_module, "send_email",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("SMTP down")),
    )

    kopf = _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload(), headers=kopf)
    assert antwort.status_code == 502

    db = SessionLocal()
    try:
        eintraege = db.query(Feedback).filter(Feedback.subject == _payload()["subject"]).all()
        assert len(eintraege) == 1
        eintrag = eintraege[0]
        assert eintrag.email_sent is False
        assert eintrag.email_sent_at is None
        assert eintrag.email_error is not None
        assert "SMTP down" in eintrag.email_error
    finally:
        db.close()


def test_referenz_ist_eindeutig_und_faengt_bei_eins_an(client, anna):
    kopf = _login(client, "anna@example.com")
    a = client.post("/api/v1/feedback", json=_payload(subject="Erstes"), headers=kopf).json()
    b = client.post("/api/v1/feedback", json=_payload(subject="Zweites"), headers=kopf).json()
    assert a["reference"] != b["reference"]
    assert a["reference"].endswith("000001")
    assert b["reference"].endswith("000002")


def test_ohne_csrf_token_abgelehnt(client, anna):
    _login(client, "anna@example.com")
    antwort = client.post("/api/v1/feedback", json=_payload())
    assert antwort.status_code == 403
