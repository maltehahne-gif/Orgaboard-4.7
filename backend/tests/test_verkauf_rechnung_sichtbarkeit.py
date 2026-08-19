"""Wer welche Verkäufe und Rechnungen sieht.

Ein Mitarbeiter sieht ausschließlich seine eigenen, der Systemadministrator
sieht alles. Geprüft wird über die HTTP-Schnittstelle und in beide
Richtungen: dass nichts Fremdes durchkommt, und dass der Betreiber nicht
versehentlich ausgesperrt ist. Zu wenig zu sehen sieht aus wie ein leerer
Datenbestand, zu viel zu sehen fällt gar nicht auf.
"""
import os
import tempfile
from datetime import datetime, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentType,
    Customer,
    Employee,
    Product,
    Role,
    User,
)

PASSWORT = "Testpasswort-2026!"


@pytest.fixture
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def person(email, name, rolle=Role.EMPLOYEE):
    db = SessionLocal()
    try:
        user = User(
            email=email, full_name=name, password_hash=hash_password(PASSWORT),
            role=rolle, must_change_password=False,
        )
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name)
        db.add(employee)
        db.flush()
        customer = Customer(employee_id=employee.id, first_name="Kunde", last_name=name)
        db.add(customer)
        db.flush()
        db.commit()
        return {"user": user.id, "employee": employee.id, "customer": customer.id, "email": email}
    finally:
        db.close()


def produkt():
    db = SessionLocal()
    try:
        p = Product(name="Kobold VK7", category="Kobold", verified=True, active=True)
        db.add(p)
        db.commit()
        return p.id
    finally:
        db.close()


def anmelden(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORT})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def abmelden(client):
    client.post("/api/v1/auth/logout")
    client.cookies.clear()


def verkaufen(client, kopf, customer_id, product_id):
    antwort = client.post(
        "/api/v1/sales",
        headers=kopf,
        json={
            "customer_id": customer_id,
            "sold_at": datetime.now(timezone.utc).isoformat(),
            "channel": "field",
            "items": [{"product_id": product_id, "quantity": 1, "unit_price_cents": 250000}],
        },
    )
    assert antwort.status_code == 200, antwort.text
    return antwort.json()


@pytest.fixture
def welt(client):
    """Zwei Mitarbeiter mit je einem Verkauf, dazu ein Systemadministrator."""
    anna = person("anna@example.com", "Anna Mitarbeiterin")
    bodo = person("bodo@example.com", "Bodo Mitarbeiter")
    admin = person("admin@example.com", "Alex Betreiber", Role.SYSTEM_ADMIN)
    pid = produkt()

    kopf = anmelden(client, anna["email"])
    anna["sale"] = verkaufen(client, kopf, anna["customer"], pid)
    abmelden(client)

    kopf = anmelden(client, bodo["email"])
    bodo["sale"] = verkaufen(client, kopf, bodo["customer"], pid)
    abmelden(client)

    return {"anna": anna, "bodo": bodo, "admin": admin, "produkt": pid}


# ------------------------------------------------------------- Verkäufe

def test_mitarbeiter_sieht_nur_eigene_verkaeufe(client, welt):
    anmelden(client, welt["anna"]["email"])
    ids = {v["id"] for v in client.get("/api/v1/sales").json()}
    assert ids == {welt["anna"]["sale"]["id"]}


def test_systemadmin_sieht_alle_verkaeufe(client, welt):
    anmelden(client, welt["admin"]["email"])
    ids = {v["id"] for v in client.get("/api/v1/sales").json()}
    assert ids == {welt["anna"]["sale"]["id"], welt["bodo"]["sale"]["id"]}


def test_mitarbeiter_kann_den_ausschnitt_nicht_umstellen(client, welt):
    anmelden(client, welt["anna"]["email"])
    antwort = client.get(f"/api/v1/sales?employee_id={welt['bodo']['employee']}")
    assert antwort.status_code == 403


def test_mitarbeiter_kann_fremden_verkauf_nicht_stornieren(client, welt):
    kopf = anmelden(client, welt["anna"]["email"])
    antwort = client.post(
        f"/api/v1/sales/{welt['bodo']['sale']['id']}/cancel", headers=kopf, json={},
    )
    assert antwort.status_code == 403


def test_export_enthaelt_keine_fremden_verkaeufe(client, welt):
    """Auch mit ausdrücklich genannten fremden IDs.

    Der Export nimmt eine Liste von IDs entgegen - ohne den Ausschnitt wäre
    er der bequemste Weg an fremde Umsätze.
    """
    anmelden(client, welt["anna"]["email"])
    antwort = client.get(f"/api/v1/sales/export.xlsx?ids={welt['bodo']['sale']['id']}")
    assert antwort.status_code == 200
    # Der Nachname des fremden Kunden darf in der Datei nicht vorkommen.
    assert b"Bodo Mitarbeiter" not in antwort.content


def test_wochentabelle_zeigt_einem_mitarbeiter_nur_die_eigene_woche(client, welt):
    anmelden(client, welt["anna"]["email"])
    antwort = client.get(f"/api/v1/sales/wochentabelle?employee_id={welt['bodo']['employee']}")
    assert antwort.status_code == 403


def test_verkauf_laesst_sich_nicht_an_einen_fremden_termin_haengen(client, welt):
    """Sonst stünden Terminart und Vorführungen eines fremden Termins in
    der eigenen Verkaufstabelle."""
    db = SessionLocal()
    try:
        termin = Appointment(
            customer_id=welt["bodo"]["customer"],
            employee_id=welt["bodo"]["employee"],
            start_at=datetime.now(timezone.utc),
            appointment_type=AppointmentType.PROMOTION,
        )
        db.add(termin)
        db.commit()
        termin_id = termin.id
    finally:
        db.close()

    kopf = anmelden(client, welt["anna"]["email"])
    antwort = client.post(
        "/api/v1/sales",
        headers=kopf,
        json={
            "customer_id": welt["anna"]["customer"],
            "appointment_id": termin_id,
            "sold_at": datetime.now(timezone.utc).isoformat(),
            "channel": "field",
            "items": [{"product_id": welt["produkt"], "quantity": 1, "unit_price_cents": 250000}],
        },
    )
    assert antwort.status_code == 403


# ------------------------------------------------------------ Rechnungen

def test_mitarbeiter_sieht_nur_eigene_rechnungen(client, welt):
    anmelden(client, welt["anna"]["email"])
    rechnungen = client.get("/api/v1/invoices").json()
    assert len(rechnungen) == 1
    assert rechnungen[0]["sale_id"] == welt["anna"]["sale"]["id"]


def test_systemadmin_sieht_alle_rechnungen(client, welt):
    anmelden(client, welt["admin"]["email"])
    sale_ids = {r["sale_id"] for r in client.get("/api/v1/invoices").json()}
    assert sale_ids == {welt["anna"]["sale"]["id"], welt["bodo"]["sale"]["id"]}


def test_fremde_rechnung_laesst_sich_nicht_oeffnen(client, welt):
    anmelden(client, welt["admin"]["email"])
    fremde = next(
        r for r in client.get("/api/v1/invoices").json()
        if r["sale_id"] == welt["bodo"]["sale"]["id"]
    )
    abmelden(client)

    anmelden(client, welt["anna"]["email"])
    assert client.get(f"/api/v1/invoices/{fremde['id']}").status_code == 404


def test_fremde_rechnung_laesst_sich_nicht_als_pdf_laden(client, welt):
    anmelden(client, welt["admin"]["email"])
    fremde = next(
        r for r in client.get("/api/v1/invoices").json()
        if r["sale_id"] == welt["bodo"]["sale"]["id"]
    )
    abmelden(client)

    anmelden(client, welt["anna"]["email"])
    assert client.get(f"/api/v1/invoices/{fremde['id']}/pdf").status_code == 404


def test_fremde_rechnung_laesst_sich_nicht_aendern(client, welt):
    anmelden(client, welt["admin"]["email"])
    fremde = next(
        r for r in client.get("/api/v1/invoices").json()
        if r["sale_id"] == welt["bodo"]["sale"]["id"]
    )
    abmelden(client)

    kopf = anmelden(client, welt["anna"]["email"])
    antwort = client.patch(
        f"/api/v1/invoices/{fremde['id']}", headers=kopf, json={"payment_method": "cash"},
    )
    assert antwort.status_code == 404


def test_zu_fremdem_verkauf_laesst_sich_keine_rechnung_erzeugen(client, welt):
    kopf = anmelden(client, welt["anna"]["email"])
    antwort = client.post(
        f"/api/v1/invoices/aus-verkauf/{welt['bodo']['sale']['id']}", headers=kopf,
    )
    assert antwort.status_code == 403


def test_systemadmin_darf_jede_rechnung_oeffnen(client, welt):
    anmelden(client, welt["admin"]["email"])
    for rechnung in client.get("/api/v1/invoices").json():
        assert client.get(f"/api/v1/invoices/{rechnung['id']}").status_code == 200
