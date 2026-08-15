"""Tests fuer den CSV-Import von Kunden.

Der Import legt ausschliesslich an und aendert nie einen bestehenden
Datensatz - diese Zusicherung wird hier festgehalten, weil ein
versehentliches Ueberschreiben echter Kundendaten nicht rueckholbar waere.
"""
import os
import tempfile

import pytest

# Muss vor dem Import der App gesetzt sein - get_settings() ist gecacht.
os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, Employee, Role, User  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def employee_user():
    db = SessionLocal()
    try:
        user = User(
            email="importer@example.com",
            full_name="Import Mitarbeiter",
            password_hash=hash_password(PASSWORD),
            role=Role.EMPLOYEE,
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name="Import Mitarbeiter")
        db.add(employee)
        db.flush()
        db.commit()
        return user.id, employee.id
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def _angemeldet(client):
    antwort = client.post(
        "/api/v1/auth/login",
        json={"email": "importer@example.com", "password": PASSWORD},
    )
    assert antwort.status_code == 200
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _importiere(client, csv_text):
    kopfzeilen = _angemeldet(client)
    return client.post("/api/v1/customers/import", json={"csv": csv_text}, headers=kopfzeilen)


def test_import_legt_kunden_aus_semikolon_datei_an(client, employee_user):
    """Deutsche Excel-Exporte nutzen das Semikolon - das muss ohne Zutun gehen."""
    antwort = _importiere(
        client,
        "Vorname;Nachname;Straße;Hausnummer;PLZ;Ort;Telefon;E-Mail\n"
        "Anna;Lindner;Lindenstr.;4;30159;Hannover;0511 1234;anna@example.com\n"
        "Jan;Meyer;Bergweg;12;30161;Hannover;;\n",
    )

    assert antwort.status_code == 200
    assert antwort.json()["created"] == 2

    db = SessionLocal()
    try:
        kunden = {c.last_name: c for c in db.query(Customer).all()}
        assert set(kunden) == {"Lindner", "Meyer"}
        assert kunden["Lindner"].email == "anna@example.com"
        assert kunden["Lindner"].postal_code == "30159"
        # Leere Felder werden zu None statt zu einem leeren String.
        assert kunden["Meyer"].email is None
    finally:
        db.close()


def test_import_versteht_auch_kommagetrennte_dateien(client, employee_user):
    antwort = _importiere(client, "first_name,last_name,city\nJan,Meyer,Hannover\n")

    assert antwort.status_code == 200
    assert antwort.json()["created"] == 1


def test_import_ueberspringt_zeilen_ohne_nachnamen(client, employee_user):
    antwort = _importiere(
        client,
        "Vorname;Nachname;Ort\nAnna;Lindner;Hannover\nOhneNachname;;Hannover\n",
    )

    daten = antwort.json()
    assert daten["created"] == 1
    assert daten["skipped"] == 1
    assert daten["notes"], "Uebersprungene Zeilen muessen benannt werden"


def test_import_legt_bestehende_kunden_nicht_doppelt_an(client, employee_user):
    """Ein zweiter Lauf derselben Datei darf nichts verdoppeln - so bleibt ein
    abgebrochener Import gefahrlos wiederholbar."""
    csv_text = "Vorname;Nachname;Ort\nAnna;Lindner;Hannover\n"

    assert _importiere(client, csv_text).json()["created"] == 1

    zweiter = _importiere(client, csv_text).json()
    assert zweiter["created"] == 0
    assert zweiter["skipped"] == 1

    db = SessionLocal()
    try:
        assert db.query(Customer).count() == 1
    finally:
        db.close()


def test_import_ohne_nachnamenspalte_wird_abgelehnt(client, employee_user):
    """Lieber die ganze Datei ablehnen als lauter namenlose Kunden anlegen."""
    antwort = _importiere(client, "Vorname;Ort\nAnna;Hannover\n")

    assert antwort.status_code == 400
    assert "Nachnamen" in antwort.json()["detail"]

    db = SessionLocal()
    try:
        assert db.query(Customer).count() == 0
    finally:
        db.close()


def test_import_braucht_ein_csrf_token(client, employee_user):
    """Ohne Token darf der Import nicht durchlaufen - sonst genuegt ein
    fremder Formular-Post, um die Kundenliste zu fluten."""
    client.post(
        "/api/v1/auth/login",
        json={"email": "importer@example.com", "password": PASSWORD},
    )

    antwort = client.post(
        "/api/v1/customers/import",
        json={"csv": "Vorname;Nachname\nAnna;Lindner\n"},
    )

    assert antwort.status_code == 403

    db = SessionLocal()
    try:
        assert db.query(Customer).count() == 0
    finally:
        db.close()
