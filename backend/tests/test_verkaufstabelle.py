"""Das Wochenblatt der Verkaufstabelle.

Die Vorlage hat feste Spalten. Geprueft wird, dass ein Verkauf in der
richtigen landet - eine Zahl in der falschen Produktspalte faellt beim
Lesen nicht auf, verfaelscht aber jede Auswertung, die daraus entsteht.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.core.timeutils import BUSINESS_TZ  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentType,
    Customer,
    Employee,
    Product,
    ProductPresentation,
    Role,
    Sale,
    SaleChannel,
    SaleItem,
    TradeIn,
    User,
)
from app.services.verkaufstabelle import PRODUKTSPALTEN, produktspalte, wochentabelle  # noqa: E402


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
def daten(db):
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
    customer = Customer(
        employee_id=employee.id,
        first_name="Anna",
        last_name="Beispiel",
        street="Musterweg",
        house_number="1",
        postal_code="24340",
        city="Eckernförde",
    )
    db.add(customer)
    db.flush()
    return employee, customer


def montag():
    heute = datetime.now(BUSINESS_TZ).date()
    return heute - timedelta(days=heute.weekday())


def produkt(db, name, kategorie=""):
    p = Product(name=name, category=kategorie, verified=True, active=True)
    db.add(p)
    db.flush()
    return p


def verkauf(db, employee, customer, positionen, tag_versatz=0, stunde=10,
            channel=SaleChannel.FIELD, appointment=None):
    lokal = datetime.combine(
        montag() + timedelta(days=tag_versatz), datetime.min.time(), tzinfo=BUSINESS_TZ
    ) + timedelta(hours=stunde)
    s = Sale(
        customer_id=customer.id,
        employee_id=employee.id,
        appointment_id=appointment.id if appointment else None,
        sold_at=lokal.astimezone(timezone.utc),
        channel=channel,
    )
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


def termin(db, employee, customer, art):
    a = Appointment(
        customer_id=customer.id,
        employee_id=employee.id,
        start_at=datetime.now(timezone.utc),
        appointment_type=art,
    )
    db.add(a)
    db.flush()
    return a


def blatt(db, employee):
    return wochentabelle(db, employee.id, montag())


def erste_zeile(db, employee, tag=0):
    return blatt(db, employee)["days"][tag]["rows"][0]


# ------------------------------------------------------------ Produktspalten

@pytest.mark.parametrize("name,erwartet", [
    ("Kobold VR7 Saugroboter + RB7 Servicestation", "roboter"),
    ("Kobold VK7 Akku-Staubsauger inkl. EB7", "kobold"),
    ("Kobold VT300 Bodenstaubsauger Grundgerät", "tiger"),
    ("Kobold EB7 Elektrobürste", "elektrobuerste"),
    ("Kobold SP7 Saugwischer Universal Basis-Set", "saugwischer"),
    ("Kobold PB7 Matratzen- und Polster Set", "polsterbuerste"),
    ("Demotücher 10er Pack", "demotuecher"),
    ("Service und Wartung", "service"),
])
def test_produkt_landet_in_der_richtigen_spalte(name, erwartet):
    assert produktspalte(name) == erwartet


def test_kombiniertes_set_zaehlt_zum_grundgeraet():
    """Ein VK7-Set mit Buerste und Saugwischer ist ein Kobold-Verkauf.

    Landete es in der Spalte "Elektrobürste", stuende der Staubsauger in
    keiner Spalte - und die Wochensumme zeigte einen Verkauf zu wenig beim
    Geraet und einen zu viel beim Zubehoer.
    """
    assert produktspalte("Kobold VK7 + SP7 Saugwischer + EB7") == "kobold"


def test_unbekanntes_produkt_bekommt_keine_spalte():
    assert produktspalte("Grußkarte") is None


# ------------------------------------------------------------------- Zeilen

def test_zeile_traegt_uhrzeit_kunde_und_anschrift(db, daten):
    employee, customer = daten
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)], stunde=14)
    z = erste_zeile(db, employee)
    assert z["time"] == "14:00"
    assert z["customer_name"] == "Anna Beispiel"
    assert z["customer_address"] == "Musterweg 1, 24340 Eckernförde"


def test_verkaufte_menge_steht_in_der_produktspalte(db, daten):
    employee, customer = daten
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7 Akku-Staubsauger"), 2, 250000)])
    z = erste_zeile(db, employee)
    assert z["products"]["kobold"]["sold"] == 2
    assert z["products"]["roboter"]["sold"] == 0


def test_vorgefuehrtes_produkt_wird_als_vorgefuehrt_gefuehrt(db, daten):
    employee, customer = daten
    a = termin(db, employee, customer, AppointmentType.CUSTOMER)
    gezeigt = produkt(db, "Kobold VR7 Saugroboter")
    db.add(ProductPresentation(
        customer_id=customer.id,
        employee_id=employee.id,
        appointment_id=a.id,
        product_id=gezeigt.id,
    ))
    db.flush()
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)], appointment=a)
    z = erste_zeile(db, employee)
    assert z["products"]["roboter"] == {"sold": 0, "presented": True}
    assert z["products"]["kobold"]["sold"] == 1


def test_kontaktweg_kommt_aus_der_terminart(db, daten):
    employee, customer = daten
    a = termin(db, employee, customer, AppointmentType.PROMOTION)
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)], appointment=a)
    assert erste_zeile(db, employee)["contact_way"] == "promotion"


def test_verkauf_ohne_termin_bleibt_ohne_kontaktweg(db, daten):
    employee, customer = daten
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)])
    assert erste_zeile(db, employee)["contact_way"] is None


def test_gebiet_folgt_dem_verkaufskanal(db, daten):
    employee, customer = daten
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)], channel=SaleChannel.FIELD)
    verkauf(db, employee, customer, [(produkt(db, "Kobold SP7"), 1, 30000)],
            tag_versatz=1, channel=SaleChannel.PROMOTION)
    tage = blatt(db, employee)["days"]
    assert tage[0]["rows"][0]["area"] == "field"
    assert tage[1]["rows"][0]["area"] == "white"


def test_altgeraet_wird_angekreuzt(db, daten):
    employee, customer = daten
    s = verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)])
    db.add(TradeIn(
        customer_id=customer.id,
        employee_id=employee.id,
        sale_id=s.id,
        model="VK200",
        received_on=montag(),
    ))
    db.flush()
    assert erste_zeile(db, employee)["trade_in"] is True


def test_k70_steht_in_einer_eigenen_spalte_und_zaehlt_nicht_als_einheit(db, daten):
    employee, customer = daten
    verkauf(db, employee, customer, [
        (produkt(db, "Kobold VK7"), 1, 250000),
        (produkt(db, "K70 Reiniger", kategorie="K70"), 4, 1500),
    ])
    z = erste_zeile(db, employee)
    assert z["product_revenue_cents"] == 250000
    assert z["k70_revenue_cents"] == 6000
    assert z["units"] == 1


# ------------------------------------------------------------------- Summen

def test_wochensumme_zaehlt_ueber_alle_tage(db, daten):
    employee, customer = daten
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)], tag_versatz=0)
    verkauf(db, employee, customer, [(produkt(db, "Kobold SP7 Saugwischer"), 2, 30000)], tag_versatz=3)
    summe = blatt(db, employee)["totals"]
    assert summe["product_revenue_cents"] == 250000 + 60000
    assert summe["products"]["kobold"] == 1
    assert summe["products"]["saugwischer"] == 2


def test_tagessumme_steht_je_wochentag(db, daten):
    employee, customer = daten
    verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)], tag_versatz=2)
    tage = blatt(db, employee)["days"]
    assert tage[2]["totals"]["product_revenue_cents"] == 250000
    assert tage[0]["totals"]["product_revenue_cents"] == 0


def test_stornierter_verkauf_bleibt_sichtbar_zaehlt_aber_nicht_mit(db, daten):
    employee, customer = daten
    s = verkauf(db, employee, customer, [(produkt(db, "Kobold VK7"), 1, 250000)])
    s.cancelled_at = datetime.now(timezone.utc)
    db.flush()
    ergebnis = blatt(db, employee)
    assert ergebnis["days"][0]["rows"][0]["cancelled"] is True
    assert ergebnis["totals"]["product_revenue_cents"] == 0


def test_blatt_fuehrt_immer_alle_sieben_wochentage(db, daten):
    employee, _ = daten
    ergebnis = blatt(db, employee)
    assert [tag["weekday"] for tag in ergebnis["days"]] == [
        "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"
    ]


def test_blatt_nennt_alle_spalten_der_vorlage(db, daten):
    employee, _ = daten
    spalten = blatt(db, employee)["columns"]
    assert [s["key"] for s in spalten["products"]] == [k for k, _ in PRODUKTSPALTEN]
    assert [s["key"] for s in spalten["contact_ways"]] == [
        "promotion", "recommendation", "premium", "kd_daten", "adm"
    ]
    assert [s["key"] for s in spalten["profi"]] == ["job_ticket", "recommendation", "premium"]
