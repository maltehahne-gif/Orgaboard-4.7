"""Tests fuer das Festlegen des Betreiberkontos beim Start.

Die Rolle SYSTEM_ADMIN entsteht ausschliesslich hier. Deshalb muss diese
Stelle drei Dinge zusichern: sie hebt genau das konfigurierte Konto, sie
legt niemals ein Konto an, und sie laesst sich gefahrlos wiederholen - der
Aufruf passiert bei jedem Start.
"""
import os
import tempfile

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from app.core import config  # noqa: E402
from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.services.bootstrap import betreiber_festlegen  # noqa: E402


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    config.get_settings.cache_clear()


def _setze_adresse(adresse: str | None, passwort: str | None = None):
    """Die Einstellung ist gecacht - fuer den Test frisch laden."""
    if adresse is None:
        os.environ.pop("SYSTEM_ADMIN_EMAIL", None)
    else:
        os.environ["SYSTEM_ADMIN_EMAIL"] = adresse

    if passwort is None:
        os.environ.pop("SYSTEM_ADMIN_PASSWORD", None)
    else:
        os.environ["SYSTEM_ADMIN_PASSWORD"] = passwort
    config.get_settings.cache_clear()


def _user(email: str, rolle=Role.EMPLOYEE, aktiv=True) -> str:
    db = SessionLocal()
    try:
        u = User(email=email, full_name="Test", password_hash=hash_password("x" * 12),
                 role=rolle, is_active=aktiv, must_change_password=False)
        db.add(u)
        db.commit()
        return u.id
    finally:
        db.close()


def _rolle(user_id: str) -> Role:
    db = SessionLocal()
    try:
        return db.get(User, user_id).role
    finally:
        db.close()


def test_konfiguriertes_konto_wird_systemadmin():
    kennung = _user("inhaber@example.com")
    _setze_adresse("inhaber@example.com")

    db = SessionLocal()
    try:
        assert betreiber_festlegen(db) == kennung
    finally:
        db.close()

    assert _rolle(kennung) == Role.SYSTEM_ADMIN


def test_grossschreibung_der_adresse_spielt_keine_rolle():
    kennung = _user("inhaber@example.com")
    _setze_adresse("Inhaber@Example.COM")

    db = SessionLocal()
    try:
        betreiber_festlegen(db)
    finally:
        db.close()

    assert _rolle(kennung) == Role.SYSTEM_ADMIN


def test_ohne_einstellung_passiert_nichts():
    kennung = _user("jemand@example.com")
    _setze_adresse(None)

    db = SessionLocal()
    try:
        assert betreiber_festlegen(db) is None
    finally:
        db.close()

    assert _rolle(kennung) == Role.EMPLOYEE


def test_unbekannte_adresse_ohne_passwort_legt_kein_konto_an():
    """Ein Tippfehler darf kein zweites Betreiberkonto erzeugen."""
    _setze_adresse("vertippt@example.com")

    db = SessionLocal()
    try:
        assert betreiber_festlegen(db) is None
        assert db.query(User).count() == 0
    finally:
        db.close()


def test_mit_passwort_wird_das_konto_angelegt():
    """Sonst gaebe es bei einer frischen Anlage keinen Weg zum ersten Admin."""
    _setze_adresse("inhaber@example.com", "EinLangesPasswort1")

    db = SessionLocal()
    try:
        kennung = betreiber_festlegen(db)
    finally:
        db.close()

    assert kennung is not None
    assert _rolle(kennung) == Role.SYSTEM_ADMIN


def test_angelegtes_konto_bekommt_ein_mitarbeiterprofil():
    """Ohne Profil laufen Dashboard und Kundenliste in einen Fehler."""
    from app.models import Employee

    _setze_adresse("inhaber@example.com", "EinLangesPasswort1")
    db = SessionLocal()
    try:
        kennung = betreiber_festlegen(db)
        assert db.query(Employee).filter(Employee.user_id == kennung).one() is not None
    finally:
        db.close()


def test_mit_dem_gesetzten_passwort_laesst_sich_anmelden():
    from app.core.security import verify_password

    _setze_adresse("inhaber@example.com", "EinLangesPasswort1")
    db = SessionLocal()
    try:
        kennung = betreiber_festlegen(db)
        u = db.get(User, kennung)
        assert verify_password("EinLangesPasswort1", u.password_hash)
        # Kein erzwungener Wechsel: das Passwort kommt von der Person selbst.
        assert u.must_change_password is False
    finally:
        db.close()


def test_zu_kurzes_passwort_legt_kein_konto_an():
    """Sonst entstuende ein Konto, dessen Passwort sich nicht aendern liesse."""
    _setze_adresse("inhaber@example.com", "kurz")

    db = SessionLocal()
    try:
        assert betreiber_festlegen(db) is None
        assert db.query(User).count() == 0
    finally:
        db.close()


def test_vorhandenes_konto_behaelt_sein_passwort():
    """Ein gesetztes SYSTEM_ADMIN_PASSWORD darf ein Passwort nicht ueberschreiben."""
    from app.core.security import verify_password

    kennung = _user("inhaber@example.com")
    _setze_adresse("inhaber@example.com", "EinAnderesPasswort1")

    db = SessionLocal()
    try:
        betreiber_festlegen(db)
        assert verify_password("x" * 12, db.get(User, kennung).password_hash)
    finally:
        db.close()


def test_wiederholter_aufruf_ist_gefahrlos():
    kennung = _user("inhaber@example.com")
    _setze_adresse("inhaber@example.com")

    for _ in range(3):
        db = SessionLocal()
        try:
            betreiber_festlegen(db)
        finally:
            db.close()

    assert _rolle(kennung) == Role.SYSTEM_ADMIN


def test_deaktiviertes_betreiberkonto_wird_reaktiviert():
    """Ein abgeschaltetes Betreiberkonto waere eine Sackgasse."""
    kennung = _user("inhaber@example.com", rolle=Role.SYSTEM_ADMIN, aktiv=False)
    _setze_adresse("inhaber@example.com")

    db = SessionLocal()
    try:
        betreiber_festlegen(db)
    finally:
        db.close()

    db = SessionLocal()
    try:
        assert db.get(User, kennung).is_active is True
    finally:
        db.close()


def test_andere_konten_bleiben_unberuehrt():
    inhaber = _user("inhaber@example.com")
    andere = _user("chefin@example.com", rolle=Role.TEAM_LEADER)
    _setze_adresse("inhaber@example.com")

    db = SessionLocal()
    try:
        betreiber_festlegen(db)
    finally:
        db.close()

    assert _rolle(inhaber) == Role.SYSTEM_ADMIN
    assert _rolle(andere) == Role.TEAM_LEADER
