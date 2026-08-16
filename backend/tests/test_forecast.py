"""Tests fuer den erweiterten Forecast: Ampelstatus, Umsatzprojektion und
Team-/Regionsaggregation. Alle Zahlen muessen deterministisch aus den
hinterlegten Zielen und tatsaechlichen Verkaeufen folgen - nichts wird
geschaetzt, was nicht konfiguriert ist.
"""
import os
import tempfile
from datetime import date, datetime, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.database import Base as CoreBase, SessionLocal, engine as core_engine  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, Employee, Product, Role, Sale, SaleItem, User  # noqa: E402
from app.services.forecast import forecast  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def db():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    Session = sessionmaker(bind=eng, expire_on_commit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()


def _employee(db, name="Test Mitarbeiter", target=20, daily_target_cents=None):
    user = User(email=f"{name.replace(' ', '.').lower()}@test.local", full_name=name,
                password_hash="hash", role=Role.EMPLOYEE, must_change_password=False)
    db.add(user)
    db.flush()
    employee = Employee(user_id=user.id, display_name=name, monthly_units_target=target,
                        daily_total_target_cents=daily_target_cents)
    db.add(employee)
    db.flush()
    return employee


def _sale(db, employee_id, cents, on: date):
    c = Customer(employee_id=employee_id, first_name="Kunde", last_name="Test")
    db.add(c)
    p = Product(name=f"Produkt-{cents}-{on}", verified=True, active=True)
    db.add(p)
    db.flush()
    sale = Sale(customer_id=c.id, employee_id=employee_id,
                sold_at=datetime.combine(on, datetime.min.time(), tzinfo=timezone.utc))
    db.add(sale)
    db.flush()
    db.add(SaleItem(sale_id=sale.id, product_id=p.id, product_name_snapshot=p.name,
                    quantity=1, unit_price_cents=cents))


# ------------------------------------------------------------ Kernrechnung

def test_forecast_ohne_umsatzziel_liefert_kein_erfundenes_ziel(db):
    e = _employee(db, target=10)
    db.commit()

    ergebnis = forecast(db, e.id, day=date(2026, 8, 16))
    assert ergebnis["units_target"] == 10
    assert ergebnis["revenue_target_cents"] is None
    assert ergebnis["revenue_missing_cents"] is None
    assert ergebnis["revenue_needed_per_day_cents"] is None


def test_forecast_mit_konfiguriertem_tagesziel_leitet_monatsziel_ab(db):
    e = _employee(db, target=10, daily_target_cents=100000)
    db.commit()

    ergebnis = forecast(db, e.id, day=date(2026, 8, 3))
    # August 2026: Montag 3.8. bis Montag 31.8. - Arbeitstage lassen sich
    # nicht auswendig hinschreiben, deshalb nur die Ableitung selbst pruefen.
    erwartetes_ziel = ergebnis["working_days_total"] * 100000
    assert ergebnis["revenue_target_cents"] == erwartetes_ziel


def test_status_gruen_wenn_projektion_ziel_erreicht(db):
    e = _employee(db, target=4)
    heute = date(2026, 8, 3)  # erster Arbeitstag im Monat
    _sale(db, e.id, 10000, heute)
    db.commit()

    ergebnis = forecast(db, e.id, day=heute)
    # Am ersten Arbeitstag 1 Einheit erreicht, hochgerechnet auf alle
    # Arbeitstage des Monats reicht das locker fuer ein Ziel von 4.
    assert ergebnis["status"] == "green"


def test_status_rot_wenn_praktisch_nichts_erreicht_wurde(db):
    e = _employee(db, target=100)
    heute = date(2026, 8, 28)  # kurz vor Monatsende, kaum noch Arbeitstage
    db.commit()

    ergebnis = forecast(db, e.id, day=heute)
    assert ergebnis["units_achieved"] == 0
    assert ergebnis["status"] == "red"


def test_ziel_null_ist_immer_gruen(db):
    e = _employee(db, target=0)
    db.commit()
    ergebnis = forecast(db, e.id, day=date(2026, 8, 16))
    assert ergebnis["status"] == "green"


# ------------------------------------------------------- Team-Aggregation

def test_forecast_summiert_ueber_mehrere_mitarbeiter(db):
    a = _employee(db, "Anna", target=10, daily_target_cents=50000)
    b = _employee(db, "Bodo", target=20, daily_target_cents=50000)
    heute = date(2026, 8, 10)
    _sale(db, a.id, 20000, heute)
    _sale(db, b.id, 30000, heute)
    db.commit()

    einzel_a = forecast(db, a.id, day=heute)
    einzel_b = forecast(db, b.id, day=heute)
    gruppe = forecast(db, [a.id, b.id], day=heute)

    assert gruppe["units_target"] == einzel_a["units_target"] + einzel_b["units_target"]
    assert gruppe["revenue_achieved_cents"] == einzel_a["revenue_achieved_cents"] + einzel_b["revenue_achieved_cents"]
    assert gruppe["revenue_target_cents"] == einzel_a["revenue_target_cents"] + einzel_b["revenue_target_cents"]
    assert gruppe["employee_count"] == 2


def test_leere_gruppe_liefert_nullen_statt_alle_mitarbeiter(db):
    _employee(db, "Anna", target=10)
    db.commit()
    ergebnis = forecast(db, [], day=date(2026, 8, 16))
    assert ergebnis["employee_count"] == 0
    assert ergebnis["units_target"] == 0
    assert ergebnis["revenue_achieved_cents"] == 0


# --------------------------------------------------------------- Endpunkt

@pytest.fixture
def client():
    CoreBase.metadata.create_all(bind=core_engine)
    yield TestClient(app)
    CoreBase.metadata.drop_all(bind=core_engine)


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def test_mitarbeiter_sieht_eigenen_forecast(client):
    db = SessionLocal()
    try:
        user = User(email="anna@example.com", full_name="Anna Mitarbeiterin",
                    password_hash=hash_password(PASSWORD), role=Role.EMPLOYEE, must_change_password=False)
        db.add(user)
        db.flush()
        db.add(Employee(user_id=user.id, display_name="Anna Mitarbeiterin", monthly_units_target=15))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "anna@example.com")
    daten = client.get("/api/v1/dashboard/forecast", headers=kopf).json()
    assert daten["units_target"] == 15
    assert daten["status"] in ("green", "yellow", "red")
    assert "working_days_left" in daten
