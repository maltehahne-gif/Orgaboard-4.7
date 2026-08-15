"""Tests fuer die Wochen- und Monatsberichte.

Der Bericht rechnet ohne Sprachmodell und wird bei jedem Abruf neu erstellt.
Geprueft werden vor allem die Zeitraumgrenzen (ein Verkauf aus der Vorwoche
darf nicht in den Wochenbericht rutschen), die Sichtbarkeit und die Saetze
unter "Auffaelligkeiten" - jeder haengt an einer Zahl aus demselben Bericht
und muss mit ihr uebereinstimmen.
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
from app.core.timeutils import local_today, month_bounds, week_bounds  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentStatus,
    AppointmentType,
    Customer,
    Employee,
    Product,
    Rental,
    RentalStatus,
    Role,
    Sale,
    SaleItem,
    User,
)
from app.services.report import zeitraum  # noqa: E402

PASSWORD = "PasswortPasswort1"


@pytest.fixture(autouse=True)
def _schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def _clear_rate_limiter():
    login_limiter.clear()
    yield
    login_limiter.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _person(email, name, role=Role.EMPLOYEE, ziel=20):
    db = SessionLocal()
    try:
        user = User(
            email=email,
            full_name=name,
            password_hash=hash_password(PASSWORD),
            role=role,
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        employee = Employee(user_id=user.id, display_name=name, monthly_units_target=ziel)
        db.add(employee)
        db.flush()
        kunde = Customer(employee_id=employee.id, first_name="Karl", last_name=name.split()[0])
        db.add(kunde)
        db.commit()
        return {"user": user.id, "employee": employee.id, "customer": kunde.id}
    finally:
        db.close()


@pytest.fixture
def anna():
    return _person("anna@example.com", "Anna Mitarbeiterin")


@pytest.fixture
def bodo():
    return _person("bodo@example.com", "Bodo Kollege")


@pytest.fixture
def chefin():
    return _person("chefin@example.com", "Clara Chefin", Role.TEAM_LEADER)


@pytest.fixture
def produkt():
    db = SessionLocal()
    try:
        p = Product(name="Kobold VK7", category="Staubsauger", verified=True, active=True)
        db.add(p)
        db.commit()
        return p.id
    finally:
        db.close()


def _login(client, email):
    antwort = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert antwort.status_code == 200, antwort.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _verkauf(person, produkt_id, wann: datetime, cent=100000, menge=1, name="Kobold VK7"):
    db = SessionLocal()
    try:
        s = Sale(customer_id=person["customer"], employee_id=person["employee"], sold_at=wann)
        db.add(s)
        db.flush()
        db.add(SaleItem(sale_id=s.id, product_id=produkt_id, product_name_snapshot=name,
                        quantity=menge, unit_price_cents=cent))
        db.commit()
        return s.id
    finally:
        db.close()


def _termin(person, wann: datetime, status=AppointmentStatus.COMPLETED, outcome=None):
    db = SessionLocal()
    try:
        db.add(Appointment(
            customer_id=person["customer"],
            employee_id=person["employee"],
            start_at=wann,
            appointment_type=AppointmentType.CUSTOMER,
            status=status,
            outcome=outcome,
        ))
        db.commit()
    finally:
        db.close()


def _in_dieser_woche() -> datetime:
    """Ein Zeitpunkt sicher innerhalb der laufenden Woche."""
    start, _ = week_bounds()
    return start + timedelta(hours=10)


def _in_letzter_woche() -> datetime:
    start, _ = week_bounds(local_today() - timedelta(weeks=1))
    return start + timedelta(hours=10)


# ------------------------------------------------------- Zeitraumgrenzen

def test_woche_und_vorwoche_haben_verschiedene_grenzen():
    jetzt_start, jetzt_ende, jetzt_label = zeitraum("week", 0)
    vor_start, vor_ende, vor_label = zeitraum("week", 1)

    assert vor_ende == jetzt_start
    assert jetzt_ende - jetzt_start == timedelta(days=7)
    assert jetzt_label != vor_label
    assert jetzt_label.startswith("KW ")


def test_monatsbezeichnung_ist_deutsch():
    _, _, label = zeitraum("month", 0, heute=date(2026, 3, 15))
    assert label == "März 2026"


def test_monatsoffset_springt_ueber_den_jahreswechsel():
    _, _, label = zeitraum("month", 1, heute=date(2026, 1, 20))
    assert label == "Dezember 2025"


def test_unbekannter_zeitraum_wirft():
    with pytest.raises(ValueError):
        zeitraum("quartal", 0)


# ------------------------------------------------------------ Kennzahlen

def test_wochenbericht_zaehlt_nur_die_eigene_woche(client, anna, produkt):
    _verkauf(anna, produkt, _in_dieser_woche(), cent=120000)
    _verkauf(anna, produkt, _in_letzter_woche(), cent=500000)

    kopf = _login(client, "anna@example.com")
    bericht = client.get("/api/v1/reports/week", headers=kopf).json()

    assert bericht["metrics"]["revenue_cents"] == 120000
    assert bericht["metrics"]["revenue_previous_cents"] == 500000
    assert bericht["metrics"]["sales"] == 1


def test_vorwochenbericht_ueber_offset(client, anna, produkt):
    _verkauf(anna, produkt, _in_dieser_woche(), cent=120000)
    _verkauf(anna, produkt, _in_letzter_woche(), cent=500000)

    kopf = _login(client, "anna@example.com")
    bericht = client.get("/api/v1/reports/week", params={"offset": 1}, headers=kopf).json()

    assert bericht["metrics"]["revenue_cents"] == 500000


def test_stornierter_verkauf_zaehlt_nicht(client, anna, produkt):
    verkauf = _verkauf(anna, produkt, _in_dieser_woche(), cent=120000)

    db = SessionLocal()
    try:
        s = db.get(Sale, verkauf)
        s.cancelled_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "anna@example.com")
    bericht = client.get("/api/v1/reports/week", headers=kopf).json()

    assert bericht["metrics"]["revenue_cents"] == 0
    assert bericht["metrics"]["sales"] == 0


def test_abschlussquote_und_umsatz_je_termin(client, anna, produkt):
    wann = _in_dieser_woche()
    _verkauf(anna, produkt, wann, cent=100000)
    _termin(anna, wann, outcome="sale")
    _termin(anna, wann + timedelta(hours=2), outcome="none")

    kopf = _login(client, "anna@example.com")
    m = client.get("/api/v1/reports/week", headers=kopf).json()["metrics"]

    assert m["appointments_done"] == 2
    assert m["appointments_with_sale"] == 1
    assert m["close_rate_percent"] == 50.0
    assert m["revenue_per_appointment_cents"] == 50000


def test_laufender_zeitraum_ist_als_zwischenstand_markiert(client, anna):
    kopf = _login(client, "anna@example.com")
    laufend = client.get("/api/v1/reports/month", headers=kopf).json()
    abgeschlossen = client.get("/api/v1/reports/month", params={"offset": 1}, headers=kopf).json()

    assert laufend["is_complete"] is False
    assert abgeschlossen["is_complete"] is True


# -------------------------------------------------------------- Produkte

def test_produktrangliste_im_bericht(client, anna, produkt):
    wann = _in_dieser_woche()
    _verkauf(anna, produkt, wann, cent=100000, name="Kobold VK7")
    _verkauf(anna, produkt, wann, cent=300000, name="Thermomix TM6")

    kopf = _login(client, "anna@example.com")
    produkte = client.get("/api/v1/reports/week", headers=kopf).json()["products"]

    assert produkte[0]["name"] == "Thermomix TM6"
    assert produkte[0]["share_percent"] == 75.0


# ------------------------------------------------------ Auffaelligkeiten

def test_auffaelligkeit_nennt_umsatzrueckgang(client, anna, produkt):
    _verkauf(anna, produkt, _in_dieser_woche(), cent=100000)
    _verkauf(anna, produkt, _in_letzter_woche(), cent=500000)

    kopf = _login(client, "anna@example.com")
    bericht = client.get("/api/v1/reports/week", headers=kopf).json()

    text = " ".join(bericht["highlights"])
    assert "unter" in text
    assert "80" in text, "80 % Rueckgang muss genannt werden"


def test_auffaelligkeit_haelt_sich_bei_zu_wenig_terminen_zurueck(client, anna, produkt):
    _termin(anna, _in_dieser_woche(), outcome="sale")

    kopf = _login(client, "anna@example.com")
    text = " ".join(client.get("/api/v1/reports/week", headers=kopf).json()["highlights"])

    assert "zu wenig" in text
    assert "Quote" not in text


def test_auffaelligkeit_meldet_ueberfaelliges_verleihgeraet(client, anna, produkt):
    db = SessionLocal()
    try:
        db.add(Rental(
            product_id=produkt,
            customer_id=anna["customer"],
            employee_id=anna["employee"],
            issued_at=datetime.now(timezone.utc) - timedelta(days=30),
            due_at=datetime.now(timezone.utc) - timedelta(days=20),
            status=RentalStatus.RENTED,
        ))
        db.commit()
    finally:
        db.close()

    kopf = _login(client, "anna@example.com")
    text = " ".join(client.get("/api/v1/reports/week", headers=kopf).json()["highlights"])

    assert "überfällig" in text


def test_ohne_termine_sagt_der_bericht_das_auch(client, anna):
    kopf = _login(client, "anna@example.com")
    text = " ".join(client.get("/api/v1/reports/week", headers=kopf).json()["highlights"])

    assert "kein Termin" in text


# ----------------------------------------------------------- Sichtbarkeit

def test_mitarbeiter_sieht_nur_die_eigenen_zahlen(client, anna, bodo, produkt):
    _verkauf(anna, produkt, _in_dieser_woche(), cent=100000)
    _verkauf(bodo, produkt, _in_dieser_woche(), cent=900000)

    kopf = _login(client, "anna@example.com")
    bericht = client.get("/api/v1/reports/week", headers=kopf).json()

    assert bericht["metrics"]["revenue_cents"] == 100000
    assert bericht["team"] is None


def test_mitarbeiter_kann_nicht_auf_fremde_zahlen_umschalten(client, anna, bodo, produkt):
    _verkauf(bodo, produkt, _in_dieser_woche(), cent=900000)

    kopf = _login(client, "anna@example.com")
    antwort = client.get("/api/v1/reports/week",
                         params={"employee_id": bodo["employee"]}, headers=kopf)

    assert antwort.status_code == 403, "Fremde Zahlen duerfen nicht durchscheinen"


def test_teamleiter_bekommt_die_teamtabelle(client, anna, bodo, chefin, produkt):
    _verkauf(anna, produkt, _in_dieser_woche(), cent=100000)
    _verkauf(bodo, produkt, _in_dieser_woche(), cent=900000)

    kopf = _login(client, "chefin@example.com")
    bericht = client.get("/api/v1/reports/week", headers=kopf).json()

    namen = [z["name"] for z in bericht["team"]]
    assert namen[0] == "Bodo Kollege", "Nach Umsatz sortiert, staerkster zuerst"
    assert "Anna Mitarbeiterin" in namen
    assert bericht["metrics"]["revenue_cents"] == 1000000


def test_teamleiter_auf_eine_person_eingegrenzt_hat_keine_teamtabelle(client, anna, chefin, produkt):
    _verkauf(anna, produkt, _in_dieser_woche(), cent=100000)

    kopf = _login(client, "chefin@example.com")
    bericht = client.get("/api/v1/reports/week",
                         params={"employee_id": anna["employee"]}, headers=kopf).json()

    assert bericht["metrics"]["revenue_cents"] == 100000
    assert bericht["team"] is None, "Eine Teamtabelle mit einer Zeile waere irrefuehrend"


def test_bericht_braucht_anmeldung(client):
    assert client.get("/api/v1/reports/week").status_code == 401


# ----------------------------------------------------------------- Text

def test_textfassung_enthaelt_die_kennzahlen(client, anna, produkt):
    wann = _in_dieser_woche()
    _verkauf(anna, produkt, wann, cent=129900)
    _termin(anna, wann, outcome="sale")

    kopf = _login(client, "anna@example.com")
    antwort = client.get("/api/v1/reports/week/text", headers=kopf)

    assert antwort.status_code == 200
    assert antwort.headers["content-type"].startswith("text/plain")
    text = antwort.text
    assert "Wochenbericht" in text
    assert "1.299,00 €" in text, "Deutsche Zahlenschreibweise"
    assert "Abschlussquote" in text


def test_textfassung_weist_auf_zwischenstand_hin(client, anna):
    kopf = _login(client, "anna@example.com")
    text = client.get("/api/v1/reports/month/text", headers=kopf).text

    assert "Zwischenstand" in text


def test_textfassung_des_monatsberichts(client, anna, produkt):
    _verkauf(anna, produkt, month_bounds()[0] + timedelta(hours=10), cent=50000)

    kopf = _login(client, "anna@example.com")
    text = client.get("/api/v1/reports/month/text", headers=kopf).text

    assert "Monatsbericht" in text
    assert "Stornierte Verkäufe sind nicht enthalten" in text


# --------------------------------------------------------------- Grenzen

def test_unbekannter_zeitraum_ist_404(client, anna):
    kopf = _login(client, "anna@example.com")
    assert client.get("/api/v1/reports/quartal", headers=kopf).status_code == 404


def test_negativer_offset_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    assert client.get("/api/v1/reports/week", params={"offset": -1}, headers=kopf).status_code == 400


def test_zu_weit_zurueck_wird_abgelehnt(client, anna):
    kopf = _login(client, "anna@example.com")
    assert client.get("/api/v1/reports/week", params={"offset": 500}, headers=kopf).status_code == 400
