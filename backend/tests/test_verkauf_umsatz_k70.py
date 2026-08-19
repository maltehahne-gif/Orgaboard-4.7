"""Was ein gespeicherter Verkauf an Zahlen liefert.

Umsatz ist Menge x Verkaufspreis. K70 ist davon der Teil, der aus
K70-Produkten stammt - er zaehlt nicht als Einheit, sondern als eigener
Umsatz. Genau diese Abgrenzung benutzen Dashboard, Buntewoche und
Verkaufstabelle; laufen sie auseinander, widersprechen sich die Zahlen an
drei Stellen gleichzeitig.
"""
import os
import tempfile
from datetime import datetime, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.models import Customer, Employee, Product, Role, Sale, SaleItem, User  # noqa: E402
from app.routers.sales import serialize  # noqa: E402


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def verkaufsdaten(db):
    user = User(
        email="mira@test.local",
        full_name="Mira Musterfrau",
        password_hash="hash",
        role=Role.EMPLOYEE,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    employee = Employee(user_id=user.id, display_name="Mira Musterfrau")
    db.add(employee)
    db.flush()
    customer = Customer(employee_id=employee.id, first_name="Anna", last_name="Beispiel")
    db.add(customer)
    db.flush()
    return employee, customer


def produkt(db, name, kategorie=""):
    p = Product(name=name, category=kategorie, verified=True, active=True)
    db.add(p)
    db.flush()
    return p


def verkauf(db, employee, customer, positionen):
    s = Sale(customer_id=customer.id, employee_id=employee.id, sold_at=datetime.now(timezone.utc))
    db.add(s)
    db.flush()
    for p, menge, preis in positionen:
        db.add(SaleItem(
            sale_id=s.id,
            product_id=p.id,
            product_name_snapshot=p.name,
            quantity=menge,
            unit_price_cents=preis,
        ))
    db.flush()
    return s


def test_umsatz_ist_menge_mal_verkaufspreis(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [(produkt(db, "SP7"), 3, 25000)])
    daten = serialize(db, s)
    assert daten["total_cents"] == 3 * 25000
    assert daten["items"][0]["total_cents"] == 3 * 25000


def test_umsatz_summiert_ueber_alle_positionen(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [
        (produkt(db, "VK7"), 1, 250000),
        (produkt(db, "SP7"), 2, 30000),
    ])
    assert serialize(db, s)["total_cents"] == 250000 + 60000


def test_k70_umsatz_kommt_ausschliesslich_aus_k70_produkten(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [
        (produkt(db, "VK7"), 1, 250000),
        (produkt(db, "K70 Reiniger", kategorie="K70"), 4, 1500),
    ])
    daten = serialize(db, s)
    assert daten["k70_total_cents"] == 4 * 1500
    assert daten["product_total_cents"] == 250000
    assert daten["total_cents"] == 250000 + 6000


def test_k70_zaehlt_nicht_als_einheit(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [
        (produkt(db, "VK7"), 1, 250000),
        (produkt(db, "K70 Reiniger", kategorie="K70"), 4, 1500),
    ])
    assert serialize(db, s)["units"] == 1


def test_ohne_k70_produkt_bleibt_der_k70_umsatz_null(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [(produkt(db, "VK7"), 1, 250000)])
    daten = serialize(db, s)
    assert daten["k70_total_cents"] == 0
    assert daten["product_total_cents"] == daten["total_cents"]


def test_k70_erkennung_ignoriert_gross_und_kleinschreibung(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [(produkt(db, "Reiniger", kategorie=" k70 "), 2, 1000)])
    assert serialize(db, s)["k70_total_cents"] == 2000


def test_verkauf_liefert_die_spalten_der_verkaufstabelle(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [(produkt(db, "VK7"), 1, 250000)])
    daten = serialize(db, s)
    assert daten["customer_name"] == "Anna Beispiel"
    assert daten["employee_name"] == "Mira Musterfrau"
    assert daten["sold_at"] == s.sold_at
    assert daten["items"][0]["name"] == "VK7"
    assert daten["units"] == 1
    assert daten["total_cents"] == 250000
    assert daten["k70_total_cents"] == 0


def test_storno_nimmt_umsatz_einheiten_und_k70_aus_der_wertung(db, verkaufsdaten):
    employee, customer = verkaufsdaten
    s = verkauf(db, employee, customer, [
        (produkt(db, "VK7"), 1, 250000),
        (produkt(db, "K70 Reiniger", kategorie="K70"), 4, 1500),
    ])
    s.cancelled_at = datetime.now(timezone.utc)
    db.flush()
    daten = serialize(db, s)
    assert daten["counts_total_cents"] == 0
    assert daten["counts_units"] == 0
    assert daten["counts_k70_cents"] == 0
    # Die ursprünglichen Beträge bleiben sichtbar.
    assert daten["total_cents"] == 256000
    assert daten["k70_total_cents"] == 6000
