"""Tests fuer die Buntewoche - Wochenraster und PDF-Export.

Die eine Zusicherung, um die es hier geht: kein gueltiger Termin darf im
PDF still verschwinden. Frueher passierte das an zwei Stellen -
zwei Termine in derselben Stunde ueberschrieben sich gegenseitig, und ein
Termin ausserhalb der Standardzeiten fand ueberhaupt keine Zeile.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.timeutils import day_bounds  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentStatus,
    AppointmentType,
    Customer,
    Employee,
    Role,
    User,
)
from app.routers.buntewoche import (  # noqa: E402
    FRUEH_LABEL,
    SLOTS,
    SPAET_LABEL,
    _raster,
    build_pdf,
    make_payload,
    monday_of,
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
    yield
    login_limiter.clear()


@pytest.fixture
def anna():
    db = SessionLocal()
    try:
        user = User(email="anna@example.com", full_name="Anna Mitarbeiterin",
                    password_hash=hash_password(PASSWORD), role=Role.EMPLOYEE,
                    must_change_password=False)
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name="Anna Mitarbeiterin")
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Karla", last_name="Kundin",
                         city="Sörup")
        db.add(kunde)
        db.commit()
        return {"user": user.id, "employee": employee.id, "customer": kunde.id}
    finally:
        db.close()


def _termin(anna, montag, tag, stunde, minute=0, status=AppointmentStatus.PLANNED,
            art=AppointmentType.CUSTOMER):
    tag_start, _ = day_bounds(montag + timedelta(days=tag))
    db = SessionLocal()
    try:
        termin = Appointment(
            customer_id=anna["customer"],
            employee_id=anna["employee"],
            start_at=tag_start + timedelta(hours=stunde, minutes=minute),
            status=status,
            appointment_type=art,
        )
        db.add(termin)
        db.commit()
        return termin.id
    finally:
        db.close()


def _payload(anna, montag):
    db = SessionLocal()
    try:
        return make_payload(db, anna["employee"], montag)
    finally:
        db.close()


MONTAG = monday_of(datetime.now(timezone.utc).date())


# ------------------------------------------------------------- Das Raster

def test_zwei_termine_in_derselben_stunde_bleiben_beide_erhalten():
    """10:00 und 10:30 - frueher ueberschrieb der zweite den ersten."""
    termine = [
        {"day_index": 0, "hour": 10, "start_at": "2026-08-17T10:00:00", "label": "Erster",
         "appointment_type": "customer"},
        {"day_index": 0, "hour": 10, "start_at": "2026-08-17T10:30:00", "label": "Zweiter",
         "appointment_type": "promotion"},
    ]
    _, zellen = _raster(termine)
    beide = [t["label"] for liste in zellen.values() for t in liste]
    assert sorted(beide) == ["Erster", "Zweiter"]


def test_termine_einer_zelle_stehen_in_zeitlicher_reihenfolge():
    termine = [
        {"day_index": 0, "hour": 10, "start_at": "2026-08-17T10:45:00", "label": "Spaeter",
         "appointment_type": "customer"},
        {"day_index": 0, "hour": 10, "start_at": "2026-08-17T10:05:00", "label": "Frueher",
         "appointment_type": "customer"},
    ]
    _, zellen = _raster(termine)
    liste = next(iter(zellen.values()))
    assert [t["label"] for t in liste] == ["Frueher", "Spaeter"]


def test_termin_vor_den_standardzeiten_bekommt_eine_eigene_zeile():
    termine = [{"day_index": 0, "hour": 6, "start_at": "2026-08-17T06:30:00",
                "label": "Frühschicht", "appointment_type": "team"}]
    zeilen, zellen = _raster(termine)

    assert zeilen[0][0] == FRUEH_LABEL
    assert [t["label"] for liste in zellen.values() for t in liste] == ["Frühschicht"]


def test_termin_nach_den_standardzeiten_bekommt_eine_eigene_zeile():
    termine = [{"day_index": 4, "hour": 21, "start_at": "2026-08-21T21:00:00",
                "label": "Spätschicht", "appointment_type": "team"}]
    zeilen, zellen = _raster(termine)

    assert zeilen[-1][0] == SPAET_LABEL
    assert [t["label"] for liste in zellen.values() for t in liste] == ["Spätschicht"]


def test_ohne_randtermine_bleibt_das_raster_wie_die_vorlage():
    """Die Zusatzzeilen erscheinen nur, wenn sie gebraucht werden."""
    termine = [{"day_index": 0, "hour": 10, "start_at": "2026-08-17T10:00:00",
                "label": "Normal", "appointment_type": "customer"}]
    zeilen, _ = _raster(termine)

    assert [label for label, _ in zeilen] == [label for label, _ in SLOTS]
    assert FRUEH_LABEL not in [label for label, _ in zeilen]
    assert SPAET_LABEL not in [label for label, _ in zeilen]


def test_jeder_termin_findet_genau_eine_zelle():
    termine = [
        {"day_index": tag, "hour": stunde, "start_at": f"2026-08-17T{stunde:02d}:00:00",
         "label": f"T{tag}-{stunde}", "appointment_type": "customer"}
        for tag in range(7)
        for stunde in (5, 8, 10, 19, 22)
    ]
    _, zellen = _raster(termine)
    verteilt = [t["label"] for liste in zellen.values() for t in liste]
    assert sorted(verteilt) == sorted(t["label"] for t in termine)


# ----------------------------------------------------------- Ganzer Ablauf

def test_alle_termine_der_woche_stehen_im_payload(client, anna):
    _termin(anna, MONTAG, 0, 10, 0)
    _termin(anna, MONTAG, 0, 10, 30)
    _termin(anna, MONTAG, 1, 6)
    _termin(anna, MONTAG, 2, 21)

    payload = _payload(anna, MONTAG)
    assert len(payload["appointments"]) == 4


def test_pdf_wird_erzeugt_und_enthaelt_alle_termine(client, anna):
    _termin(anna, MONTAG, 0, 10, 0)
    _termin(anna, MONTAG, 0, 10, 30)
    _termin(anna, MONTAG, 1, 6)
    _termin(anna, MONTAG, 2, 21)

    payload = _payload(anna, MONTAG)
    zeilen, zellen = _raster(payload["appointments"])

    verteilt = sum(len(liste) for liste in zellen.values())
    assert verteilt == len(payload["appointments"]), "Ein Termin ist beim Rendern verlorengegangen"

    pdf = build_pdf(payload)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 1000


@pytest.mark.parametrize("status", [
    AppointmentStatus.PLANNED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CANCELLED,
])
def test_jeder_status_erscheint_im_raster(client, anna, status):
    """Auch ein abgesagter oder abgeschlossener Termin gehört in die Woche.

    Er hat stattgefunden bzw. war geplant - ihn wegzulassen hieße, die
    Woche im Nachhinein anders aussehen zu lassen, als sie war.
    """
    _termin(anna, MONTAG, 0, 11, status=status)

    payload = _payload(anna, MONTAG)
    assert len(payload["appointments"]) == 1
    assert payload["appointments"][0]["status"] == status.value

    _, zellen = _raster(payload["appointments"])
    assert sum(len(liste) for liste in zellen.values()) == 1


def test_pdf_endpunkt_liefert_eine_datei(client, anna):
    _termin(anna, MONTAG, 0, 10)

    antwort = client.post("/api/v1/auth/login",
                          json={"email": "anna@example.com", "password": PASSWORD})
    assert antwort.status_code == 200

    pdf = client.get("/api/v1/buntewoche/pdf", params={"week_start": MONTAG.isoformat()})
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert "attachment" in pdf.headers["content-disposition"]
    assert pdf.content.startswith(b"%PDF")


def test_pdf_endpunkt_auch_ohne_termine(client, anna):
    """Eine leere Woche ist kein Fehlerfall."""
    client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": PASSWORD})
    pdf = client.get("/api/v1/buntewoche/pdf", params={"week_start": MONTAG.isoformat()})
    assert pdf.status_code == 200, pdf.text
    assert pdf.content.startswith(b"%PDF")
