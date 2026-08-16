"""Tests fuer Benachrichtigungen und Push.

Schwerpunkte, die im Auftrag ausdruecklich stehen:
- keine unnoetigen Benachrichtigungen (derselbe Anlass nur einmal),
- der Benutzer kann je Anlass entscheiden,
- ein Ausfall beim Push darf das Postfach nicht beschaedigen.
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
    Customer,
    Employee,
    FollowUp,
    FollowUpReason,
    Message,
    Notification,
    NotificationCategory,
    Product,
    Rental,
    RentalStatus,
    Role,
    User,
)
from app.services.notify import benachrichtigungen_auffrischen  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)


def _person(email="anna@example.com", name="Anna Mitarbeiterin"):
    db = SessionLocal()
    try:
        user = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                    role=Role.EMPLOYEE, must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name)
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Max", last_name="Muster")
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


def _login(client, email="anna@example.com"):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _auffrischen(user_id):
    db = SessionLocal()
    try:
        return benachrichtigungen_auffrischen(db, db.get(User, user_id))
    finally:
        db.close()


# --------------------------------------------------------------- Ableitung

def test_termin_in_kuerze_erzeugt_meldung(client):
    p = _person()
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=p["customer"], employee_id=p["employee"],
            start_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            status=AppointmentStatus.CONFIRMED,
        ))
        db.commit()
    finally:
        db.close()

    neu = _auffrischen(p["user"])
    arten = {n.kind for n in neu}
    assert NotificationCategory.APPOINTMENT_SOON.value in arten
    assert NotificationCategory.APPOINTMENT_TODAY.value in arten


def test_derselbe_anlass_entsteht_nur_einmal(client):
    """Der Kern von "keine unnoetigen Benachrichtigungen"."""
    p = _person()
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=p["customer"], employee_id=p["employee"],
            start_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            status=AppointmentStatus.CONFIRMED,
        ))
        db.commit()
    finally:
        db.close()

    erste = _auffrischen(p["user"])
    zweite = _auffrischen(p["user"])
    dritte = _auffrischen(p["user"])

    assert len(erste) >= 1
    assert zweite == []
    assert dritte == []

    db = SessionLocal()
    try:
        gesamt = db.query(Notification).filter(Notification.user_id == p["user"]).count()
        assert gesamt == len(erste)
    finally:
        db.close()


def test_viele_termine_ergeben_eine_tagesmeldung(client):
    """Der Tagesueberblick fasst zusammen, statt je Termin zu melden."""
    p = _person()
    db = SessionLocal()
    try:
        # Weit genug weg, damit sie nicht zusaetzlich als "bald" zaehlen.
        for stunde in (6, 7, 8):
            db.add(Appointment(
                customer_id=p["customer"], employee_id=p["employee"],
                start_at=datetime.now(timezone.utc) + timedelta(hours=stunde),
                status=AppointmentStatus.PLANNED,
            ))
        db.commit()
    finally:
        db.close()

    neu = _auffrischen(p["user"])
    tagesmeldungen = [n for n in neu if n.kind == NotificationCategory.APPOINTMENT_TODAY.value]
    assert len(tagesmeldungen) == 1
    assert "3 Termine" in tagesmeldungen[0].title


def test_wiedervorlagen_getrennt_nach_heute_und_ueberfaellig(client):
    p = _person()
    heute = local_today()
    db = SessionLocal()
    try:
        db.add(FollowUp(customer_id=p["customer"], employee_id=p["employee"],
                        due_on=heute, reason=FollowUpReason.MANUAL))
        db.add(FollowUp(customer_id=p["customer"], employee_id=p["employee"],
                        due_on=heute - timedelta(days=4), reason=FollowUpReason.NO_RESULT))
        db.commit()
    finally:
        db.close()

    arten = {n.kind for n in _auffrischen(p["user"])}
    assert NotificationCategory.FOLLOWUP_TODAY.value in arten
    assert NotificationCategory.FOLLOWUP_OVERDUE.value in arten


def test_verleih_faellig_und_ueberfaellig(client):
    p = _person()
    db = SessionLocal()
    try:
        produkt = Product(name="VK7", verified=True, active=True)
        db.add(produkt)
        db.flush()
        db.add(Rental(product_id=produkt.id, customer_id=p["customer"], employee_id=p["employee"],
                      issued_at=datetime.now(timezone.utc) - timedelta(days=10),
                      due_at=datetime.now(timezone.utc) + timedelta(days=1),
                      status=RentalStatus.RENTED))
        db.add(Rental(product_id=produkt.id, customer_id=p["customer"], employee_id=p["employee"],
                      issued_at=datetime.now(timezone.utc) - timedelta(days=30),
                      due_at=datetime.now(timezone.utc) - timedelta(days=5),
                      status=RentalStatus.RENTED))
        db.commit()
    finally:
        db.close()

    arten = {n.kind for n in _auffrischen(p["user"])}
    assert NotificationCategory.RENTAL_DUE.value in arten
    assert NotificationCategory.RENTAL_OVERDUE.value in arten


def test_zurueckgegebenes_geraet_meldet_nichts(client):
    p = _person()
    db = SessionLocal()
    try:
        produkt = Product(name="VK7", verified=True, active=True)
        db.add(produkt)
        db.flush()
        db.add(Rental(product_id=produkt.id, customer_id=p["customer"], employee_id=p["employee"],
                      issued_at=datetime.now(timezone.utc) - timedelta(days=30),
                      due_at=datetime.now(timezone.utc) - timedelta(days=5),
                      returned_at=datetime.now(timezone.utc),
                      status=RentalStatus.RETURNED))
        db.commit()
    finally:
        db.close()

    arten = {n.kind for n in _auffrischen(p["user"])}
    assert NotificationCategory.RENTAL_OVERDUE.value not in arten


def test_private_nachricht_meldet_teamnachricht_nicht(client):
    """Eine Teamnachricht ist an alle - sie soll niemanden persoenlich anpiepen."""
    a = _person("anna@example.com", "Anna Mitarbeiterin")
    b = _person("bodo@example.com", "Bodo Kollege")

    db = SessionLocal()
    try:
        db.add(Message(sender_user_id=b["user"], recipient_user_id=a["user"], body="Ruf mal an"))
        db.add(Message(sender_user_id=b["user"], recipient_user_id=None, body="An alle"))
        db.commit()
    finally:
        db.close()

    neu = _auffrischen(a["user"])
    nachrichten = [n for n in neu if n.kind == NotificationCategory.MESSAGE_NEW.value]
    assert len(nachrichten) == 1
    assert "Bodo Kollege" in nachrichten[0].title


def test_ohne_anlass_entsteht_nichts(client):
    p = _person()
    assert _auffrischen(p["user"]) == []


# ------------------------------------------------------------ Einstellungen

def test_abgeschaltete_art_erzeugt_keine_meldung(client):
    p = _person()
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=p["customer"], employee_id=p["employee"],
            start_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            status=AppointmentStatus.CONFIRMED,
        ))
        db.commit()
    finally:
        db.close()

    kopf = _login(client)
    antwort = client.put(
        f"/api/v1/notifications/settings/{NotificationCategory.APPOINTMENT_SOON.value}",
        json={"in_app": False, "push": False}, headers=kopf,
    )
    assert antwort.status_code == 200

    arten = {n.kind for n in _auffrischen(p["user"])}
    assert NotificationCategory.APPOINTMENT_SOON.value not in arten
    # Der Tagesueberblick bleibt davon unberuehrt.
    assert NotificationCategory.APPOINTMENT_TODAY.value in arten


def test_unbekannte_art_wird_abgelehnt(client):
    _person()
    kopf = _login(client)
    antwort = client.put("/api/v1/notifications/settings/gibtsnicht",
                         json={"in_app": True, "push": True}, headers=kopf)
    assert antwort.status_code == 404


def test_einstellungen_zeigen_alle_arten_mit_standard(client):
    _person()
    kopf = _login(client)
    daten = client.get("/api/v1/notifications/settings", headers=kopf).json()

    assert len(daten["categories"]) == len(NotificationCategory)
    # Ohne konfigurierte Schluessel ist Push in dieser Installation nicht da.
    assert daten["push_available"] is False

    tagesueberblick = next(
        c for c in daten["categories"]
        if c["category"] == NotificationCategory.APPOINTMENT_TODAY.value
    )
    # Im Postfach ja, als Push per Voreinstellung nicht.
    assert tagesueberblick["in_app"] is True
    assert tagesueberblick["push"] is False


# ------------------------------------------------------------------ Abruf

def test_abruf_erzeugt_und_liefert(client):
    p = _person()
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=p["customer"], employee_id=p["employee"],
            start_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            status=AppointmentStatus.CONFIRMED,
        ))
        db.commit()
    finally:
        db.close()

    kopf = _login(client)
    erste = client.get("/api/v1/notifications", headers=kopf).json()
    assert len(erste) >= 1
    assert erste[0]["link"]

    # Ein zweiter Abruf darf die Liste nicht verdoppeln.
    zweite = client.get("/api/v1/notifications", headers=kopf).json()
    assert len(zweite) == len(erste)


def test_alle_als_gelesen_markieren(client):
    p = _person()
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=p["customer"], employee_id=p["employee"],
            start_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            status=AppointmentStatus.CONFIRMED,
        ))
        db.commit()
    finally:
        db.close()

    kopf = _login(client)
    client.get("/api/v1/notifications", headers=kopf)
    antwort = client.post("/api/v1/notifications/read-all", headers=kopf)
    assert antwort.status_code == 200
    assert antwort.json()["count"] >= 1

    danach = client.get("/api/v1/notifications", headers=kopf).json()
    assert all(n["read_at"] for n in danach)


# -------------------------------------------------------------------- Push

def test_anmeldung_ohne_konfigurierten_schluessel_wird_abgelehnt(client):
    _person()
    kopf = _login(client)
    antwort = client.post("/api/v1/notifications/push/subscribe", json={
        "endpoint": "https://push.example.com/abc", "p256dh": "key", "auth": "auth",
    }, headers=kopf)
    # Ohne VAPID-Schluessel gibt es keinen Push - das sagt der Server klar.
    assert antwort.status_code == 503


def test_public_key_meldet_nicht_verfuegbar(client):
    _person()
    kopf = _login(client)
    daten = client.get("/api/v1/notifications/push/public-key", headers=kopf).json()
    assert daten["available"] is False
    assert daten["public_key"] is None


def test_push_versand_ohne_schluessel_bleibt_folgenlos(client):
    """Ohne Push-Einrichtung darf der Versand nichts tun und nichts werfen."""
    from app.services import webpush

    p = _person()
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=p["customer"], employee_id=p["employee"],
            start_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            status=AppointmentStatus.CONFIRMED,
        ))
        db.commit()
    finally:
        db.close()

    neu = _auffrischen(p["user"])
    db = SessionLocal()
    try:
        assert webpush.senden(db, neu) == 0
    finally:
        db.close()
