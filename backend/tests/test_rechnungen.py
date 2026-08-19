"""Rechnungen: entstehen, rechnen, sichtbar sein.

Der Durchstich läuft über die HTTP-Schnittstelle, weil hier drei Dinge
zusammenkommen, die einzeln richtig und zusammen falsch sein können: der
Verkauf legt die Rechnung an, die Beträge stammen aus den Positionen, und
die Sichtbarkeit folgt der Rolle.
"""
import os
import tempfile
from datetime import datetime, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.ratelimit import login_limiter  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Customer,
    Employee,
    Invoice,
    Product,
    ProductPrice,
    Role,
    User,
)
from app.services.rechnung import betraege, naechste_nummer  # noqa: E402

PASSWORT = "Testpasswort-2026!"


@pytest.fixture
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    login_limiter._versuche.clear() if hasattr(login_limiter, "_versuche") else None
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def anlegen(email, name, rolle=Role.EMPLOYEE, **benutzerfelder):
    db = SessionLocal()
    try:
        user = User(
            email=email,
            full_name=name,
            password_hash=hash_password(PASSWORT),
            role=rolle,
            must_change_password=False,
            **benutzerfelder,
        )
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name)
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
            phone="0170/1234567",
            email="anna@example.test",
        )
        db.add(customer)
        db.flush()
        db.commit()
        return {"user": user.id, "employee": employee.id, "customer": customer.id}
    finally:
        db.close()


def produkt(name="Kobold VK7", preis=250000):
    db = SessionLocal()
    try:
        p = Product(name=name, category="Kobold", verified=True, active=True)
        db.add(p)
        db.flush()
        db.add(ProductPrice(
            product_id=p.id, amount_cents=preis, source_url="https://example.test", verified=True
        ))
        db.commit()
        return p.id
    finally:
        db.close()


def anmelden(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORT})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def verkaufen(client, kopf, customer_id, product_id, menge=1, preis=250000):
    return client.post(
        "/api/v1/sales",
        headers=kopf,
        json={
            "customer_id": customer_id,
            "sold_at": datetime.now(timezone.utc).isoformat(),
            "channel": "field",
            "items": [{"product_id": product_id, "quantity": menge, "unit_price_cents": preis}],
        },
    )


# ---------------------------------------------------------- Entstehen

def test_ein_gespeicherter_verkauf_erzeugt_eine_rechnung(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    antwort = verkaufen(client, kopf, p["customer"], produkt())
    assert antwort.status_code == 200, antwort.text
    assert antwort.json()["invoice_number"].startswith("RE-")

    rechnungen = client.get("/api/v1/invoices").json()
    assert len(rechnungen) == 1
    assert rechnungen[0]["sale_id"] == antwort.json()["id"]


def test_rechnungsnummern_laufen_fortlaufend(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    pid = produkt()
    erste = verkaufen(client, kopf, p["customer"], pid).json()["invoice_number"]
    zweite = verkaufen(client, kopf, p["customer"], pid).json()["invoice_number"]
    assert erste != zweite
    assert int(zweite.rsplit("-", 1)[1]) == int(erste.rsplit("-", 1)[1]) + 1


def test_nummernkreis_vergibt_keine_nummer_zweimal_nach_einer_loeschung(client):
    """Gezählt wird über die höchste Nummer, nicht über die Anzahl.

    Sonst bekäme die nächste Rechnung nach einer Löschung die Nummer der
    gelöschten - zwei Belege mit derselben Nummer, und im Zweifel steht
    Aussage gegen Aussage.
    """
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    pid = produkt()
    verkaufen(client, kopf, p["customer"], pid)
    zweite = verkaufen(client, kopf, p["customer"], pid).json()["invoice_number"]

    db = SessionLocal()
    try:
        erste = db.query(Invoice).order_by(Invoice.number).first()
        db.delete(erste)
        db.commit()
        assert naechste_nummer(db, int(zweite.split("-")[1])) != zweite
    finally:
        db.close()


def test_zweiter_aufruf_erzeugt_keine_zweite_rechnung(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    verkauf = verkaufen(client, kopf, p["customer"], produkt()).json()

    antwort = client.post(f"/api/v1/invoices/aus-verkauf/{verkauf['id']}", headers=kopf)
    assert antwort.status_code == 200
    assert antwort.json()["number"] == verkauf["invoice_number"]
    assert len(client.get("/api/v1/invoices").json()) == 1


def test_auch_ein_ueber_die_ki_angelegter_verkauf_bekommt_eine_rechnung(client):
    """Sonst hätte derselbe Verkauf über die Maske einen Beleg und über die
    KI keinen - und niemand merkte es, bis der Kunde danach fragt."""
    from datetime import date

    from app.services.assistant_tools import execute_tool

    p = anlegen("mira@example.com", "Mira Musterfrau")
    pid = produkt()
    db = SessionLocal()
    try:
        user = db.get(User, p["user"])
        ergebnis = execute_tool(
            db, user, "create_sale",
            {
                "customer_id": p["customer"],
                "sold_at": datetime.combine(date.today(), datetime.min.time()).isoformat(),
                "channel": "field",
                "items": [{"product_id": pid, "quantity": 1, "unit_price_cents": 250000}],
            },
            # Der Bestaetigungsschritt gehoert dem Endpunkt, nicht diesem Test.
            bestaetigt=True,
        )
    finally:
        db.close()

    assert ergebnis.get("created") is True, ergebnis
    assert ergebnis["invoice_number"].startswith("RE-")

    anmelden(client, "mira@example.com")
    rechnungen = client.get("/api/v1/invoices").json()
    assert len(rechnungen) == 1
    assert rechnungen[0]["sale_id"] == ergebnis["sale_id"]


# ---------------------------------------------------------- Inhalt

def test_rechnung_traegt_den_ausstellenden_mitarbeiter_mit_anschrift(client):
    p = anlegen(
        "bjoern@example.com", "Björn Hahne",
        phone="0176/20204188", street="Schiffbrücke", house_number="5",
        postal_code="24340", city="Eckernförde",
    )
    kopf = anmelden(client, "bjoern@example.com")
    verkaufen(client, kopf, p["customer"], produkt())

    aussteller = client.get("/api/v1/invoices").json()[0]["issuer"]
    assert aussteller["name"] == "Björn Hahne"
    assert aussteller["street"] == "Schiffbrücke 5"
    assert aussteller["postal_code"] == "24340"
    assert aussteller["city"] == "Eckernförde"
    assert aussteller["phone"] == "0176/20204188"


def test_erfasst_eine_fuehrungsrolle_fuer_jemanden_bleibt_dessen_name_auf_der_rechnung(client):
    """Auf dem Beleg steht der Berater, der beim Kunden war.

    Erfasst eine Teamleitung einen Verkauf für einen Mitarbeiter nach, hat
    der Kunde trotzdem den Mitarbeiter vor sich gehabt - er unterschreibt
    unten rechts als Kundenberater. Stünde dort die Teamleitung, wäre der
    Beleg schlicht falsch.
    """
    mitarbeiter = anlegen(
        "anna@example.com", "Anna Mitarbeiterin",
        street="Musterweg", house_number="3", postal_code="24340", city="Eckernförde",
    )
    anlegen("chefin@example.com", "Clara Chefin", rolle=Role.TEAM_LEADER)
    kopf = anmelden(client, "chefin@example.com")

    antwort = client.post(
        "/api/v1/sales",
        headers=kopf,
        json={
            "customer_id": mitarbeiter["customer"],
            "employee_id": mitarbeiter["employee"],
            "sold_at": datetime.now(timezone.utc).isoformat(),
            "channel": "field",
            "items": [{"product_id": produkt(), "quantity": 1, "unit_price_cents": 250000}],
        },
    )
    assert antwort.status_code == 200, antwort.text

    rechnung = client.get("/api/v1/invoices").json()[0]
    assert rechnung["issuer"]["name"] == "Anna Mitarbeiterin"
    assert rechnung["issuer"]["street"] == "Musterweg 3"


def test_rechnung_traegt_kunde_positionen_und_datum(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    verkaufen(client, kopf, p["customer"], produkt("Kobold VK7"), menge=2, preis=250000)

    rechnung = client.get("/api/v1/invoices").json()[0]
    assert rechnung["customer"]["name"] == "Anna Beispiel"
    assert rechnung["customer"]["street"] == "Musterweg 1"
    assert rechnung["issued_on"]
    assert rechnung["service_on"]
    assert rechnung["items"][0]["name"] == "Kobold VK7"
    assert rechnung["items"][0]["quantity"] == 2
    assert rechnung["items"][0]["total_cents"] == 500000


def test_mehrwertsteuer_steckt_im_bruttopreis(client):
    """Der Katalogpreis ist der Preis, den der Kunde zahlt.

    Würde die Steuer daraufgeschlagen, stünde auf der Rechnung ein höherer
    Betrag als abgemacht.
    """
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    verkaufen(client, kopf, p["customer"], produkt(), menge=1, preis=119000)

    rechnung = client.get("/api/v1/invoices").json()[0]
    assert rechnung["total_cents"] == 119000
    assert rechnung["vat_cents"] == 19000
    assert rechnung["subtotal_cents"] == 100000
    assert rechnung["subtotal_cents"] + rechnung["vat_cents"] == rechnung["total_cents"]


def test_betraege_summieren_ueber_mehrere_positionen():
    class Position:
        def __init__(self, menge, preis, satz=19):
            self.quantity = menge
            self.unit_price_cents = preis
            self.vat_percent = satz

    ergebnis = betraege([Position(2, 119000), Position(1, 11900)])
    assert ergebnis["total_cents"] == 249900
    assert ergebnis["subtotal_cents"] + ergebnis["vat_cents"] == 249900


# ---------------------------------------------------------- Öffnen und PDF

def test_rechnung_laesst_sich_einzeln_oeffnen(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    verkaufen(client, kopf, p["customer"], produkt())

    rechnung = client.get("/api/v1/invoices").json()[0]
    einzeln = client.get(f"/api/v1/invoices/{rechnung['id']}")
    assert einzeln.status_code == 200
    assert einzeln.json()["number"] == rechnung["number"]


def test_pdf_wird_erzeugt_und_zum_download_angeboten(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    verkaufen(client, kopf, p["customer"], produkt())

    rechnung = client.get("/api/v1/invoices").json()[0]
    antwort = client.get(f"/api/v1/invoices/{rechnung['id']}/pdf")
    assert antwort.status_code == 200
    assert antwort.headers["content-type"] == "application/pdf"
    assert "attachment" in antwort.headers["content-disposition"]
    assert rechnung["number"] in antwort.headers["content-disposition"]
    assert antwort.content.startswith(b"%PDF")


def test_zahlungsart_und_bemerkung_lassen_sich_nachtragen(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    verkaufen(client, kopf, p["customer"], produkt())

    rechnung = client.get("/api/v1/invoices").json()[0]
    antwort = client.patch(
        f"/api/v1/invoices/{rechnung['id']}",
        headers=kopf,
        json={"payment_method": "card", "notes": "Lieferung nächste Woche"},
    )
    assert antwort.status_code == 200
    assert antwort.json()["payment_method"] == "card"
    assert antwort.json()["payment_method_label"] == "Kartenzahlung"
    assert antwort.json()["notes"] == "Lieferung nächste Woche"


def test_betraege_bleiben_beim_nachtragen_unveraendert(client):
    p = anlegen("mira@example.com", "Mira Musterfrau")
    kopf = anmelden(client, "mira@example.com")
    verkaufen(client, kopf, p["customer"], produkt(), preis=119000)

    rechnung = client.get("/api/v1/invoices").json()[0]
    nachher = client.patch(
        f"/api/v1/invoices/{rechnung['id']}",
        headers=kopf,
        json={"payment_method": "cash"},
    ).json()
    assert nachher["total_cents"] == rechnung["total_cents"]
    assert nachher["items"] == rechnung["items"]
