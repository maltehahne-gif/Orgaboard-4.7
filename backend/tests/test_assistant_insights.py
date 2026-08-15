"""Tests fuer die Auswertungen des Vertriebsassistenten.

Zwei Schwerpunkte:

1. Sichtbarkeit. Jede Auswertung laeuft ueber scoped_employee_id - ein
   Mitarbeiter darf durch keine Frage an fremde Zahlen kommen.

2. Nachvollziehbarkeit. Jede Priorisierung und jeder Befund nennt die
   Tatsache, aus der er folgt. Ein Hinweis ohne Begruendung waere geraten,
   und genau das soll hier nicht passieren.
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
from app.core.timeutils import local_today  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentStatus,
    AppointmentType,
    Customer,
    CustomerNote,
    Employee,
    FollowUp,
    FollowUpReason,
    FollowUpStatus,
    Product,
    ProductPresentation,
    Rental,
    RentalStatus,
    Role,
    Sale,
    SaleItem,
    User,
)

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


def _person(email, name, role=Role.EMPLOYEE):
    db = SessionLocal()
    try:
        u = User(email=email, full_name=name, password_hash=hash_password(PASSWORD),
                 role=role, must_change_password=False)
        db.add(u)
        db.flush()
        e = Employee(user_id=u.id, display_name=name, monthly_units_target=20)
        db.add(e)
        db.flush()
        c = Customer(employee_id=e.id, first_name="Karl", last_name=name.split()[0],
                     street="Bergweg", house_number="12", postal_code="30161", city="Hannover",
                     phone="0511 123456")
        db.add(c)
        db.commit()
        return {"user": u.id, "employee": e.id, "customer": c.id}
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


def _login(client, email="anna@example.com"):
    a = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert a.status_code == 200, a.text
    return {"X-CSRF-Token": client.cookies.get("orgaboard_csrf")}


def _hole(client, kopf, was, **params):
    antwort = client.get(f"/api/v1/assistant/insights/{was}", params=params, headers=kopf)
    assert antwort.status_code == 200, antwort.text
    return antwort.json()


def _wiedervorlage(person, faellig, note=None):
    db = SessionLocal()
    try:
        f = FollowUp(customer_id=person["customer"], employee_id=person["employee"],
                     due_on=faellig, reason=FollowUpReason.MANUAL,
                     status=FollowUpStatus.OPEN, note=note)
        db.add(f)
        db.commit()
        return f.id
    finally:
        db.close()


def _vorfuehrung(person, produkt_id, wann):
    db = SessionLocal()
    try:
        db.add(ProductPresentation(customer_id=person["customer"], employee_id=person["employee"],
                                   product_id=produkt_id, presented_at=wann))
        db.commit()
    finally:
        db.close()


def _verkauf(person, produkt_id, wann, cent=100000):
    db = SessionLocal()
    try:
        s = Sale(customer_id=person["customer"], employee_id=person["employee"], sold_at=wann)
        db.add(s)
        db.flush()
        db.add(SaleItem(sale_id=s.id, product_id=produkt_id,
                        product_name_snapshot="Kobold VK7", quantity=1, unit_price_cents=cent))
        db.commit()
        return s.id
    finally:
        db.close()


def _termin(person, wann, status=AppointmentStatus.PLANNED, outcome=None):
    db = SessionLocal()
    try:
        a = Appointment(customer_id=person["customer"], employee_id=person["employee"],
                        start_at=wann, appointment_type=AppointmentType.CUSTOMER,
                        status=status, outcome=outcome)
        db.add(a)
        db.commit()
        return a.id
    finally:
        db.close()


# ============================================================= Prioritäten

def test_ohne_daten_steht_das_auch_so_da(client, anna):
    kopf = _login(client)
    daten = _hole(client, kopf, "priorities")

    assert daten["items"] == []
    assert "nichts Dringendes" in daten["note"]


def test_ueberfaellige_wiedervorlage_steht_auf_hoch(client, anna):
    _wiedervorlage(anna, local_today() - timedelta(days=5), note="Angebot nachfassen")
    kopf = _login(client)

    eintrag = _hole(client, kopf, "priorities")["items"][0]
    assert eintrag["level"] == "hoch"
    assert "Karl Anna" in eintrag["title"]
    # Jeder Eintrag nennt die Tatsache, aus der er folgt.
    assert any("überfällig" in g for g in eintrag["reasons"])
    assert "Angebot nachfassen" in eintrag["reasons"]


def test_vorfuehrung_ohne_verkauf_wird_erkannt(client, anna, produkt):
    _vorfuehrung(anna, produkt, datetime.now(timezone.utc) - timedelta(days=5))
    kopf = _login(client)

    treffer = [e for e in _hole(client, kopf, "priorities")["items"]
               if e["kind"] == "presentation_without_sale"]
    assert treffer
    assert any("kein Verkauf" in g for g in treffer[0]["reasons"])


def test_vorfuehrung_mit_verkauf_taucht_nicht_auf(client, anna, produkt):
    vor = datetime.now(timezone.utc) - timedelta(days=5)
    _vorfuehrung(anna, produkt, vor)
    _verkauf(anna, produkt, vor + timedelta(days=1))
    kopf = _login(client)

    assert not [e for e in _hole(client, kopf, "priorities")["items"]
                if e["kind"] == "presentation_without_sale"]


def test_ueberfaelliges_verleihgeraet_steht_drin(client, anna, produkt):
    db = SessionLocal()
    try:
        db.add(Rental(product_id=produkt, customer_id=anna["customer"],
                      employee_id=anna["employee"],
                      issued_at=datetime.now(timezone.utc) - timedelta(days=20),
                      due_at=datetime.now(timezone.utc) - timedelta(days=3),
                      status=RentalStatus.RENTED))
        db.commit()
    finally:
        db.close()

    kopf = _login(client)
    treffer = [e for e in _hole(client, kopf, "priorities")["items"] if e["kind"] == "rental_due"]
    assert treffer
    assert treffer[0]["level"] == "hoch"


def test_prioritaeten_zeigen_keine_fremden_kunden(client, anna, bodo):
    _wiedervorlage(bodo, local_today() - timedelta(days=5))
    kopf = _login(client, "anna@example.com")

    assert _hole(client, kopf, "priorities")["items"] == []


# ======================================================= Terminvorbereitung

def test_ohne_termin_sagt_die_auswertung_das(client, anna):
    kopf = _login(client)
    daten = _hole(client, kopf, "next-appointment")

    assert daten["appointment"] is None
    assert "kein Termin" in daten["note"]


def test_terminvorbereitung_bringt_die_kundenakte_mit(client, anna, produkt):
    _termin(anna, datetime.now(timezone.utc) + timedelta(days=1))
    _vorfuehrung(anna, produkt, datetime.now(timezone.utc) - timedelta(days=10))
    _verkauf(anna, produkt, datetime.now(timezone.utc) - timedelta(days=200))

    db = SessionLocal()
    try:
        db.add(CustomerNote(customer_id=anna["customer"], employee_id=anna["employee"],
                            body="Preis war der Haupt-Einwand"))
        db.commit()
    finally:
        db.close()

    kopf = _login(client)
    daten = _hole(client, kopf, "next-appointment")

    assert daten["customer"]["name"] == "Karl Anna"
    assert daten["customer"]["phone"] == "0511 123456"
    assert daten["appointment"]["address"] is not None
    assert daten["presented"][0]["product"] == "Kobold VK7"
    assert daten["purchased"][0]["product"] == "Kobold VK7"
    assert daten["notes"][0]["body"] == "Preis war der Haupt-Einwand"
    assert any("Zuletzt vorgeführt" in h for h in daten["hints"])
    assert any("Besitzt bereits" in h for h in daten["hints"])


def test_terminvorbereitung_sagt_wenn_nichts_bekannt_ist(client, anna):
    _termin(anna, datetime.now(timezone.utc) + timedelta(days=1))
    kopf = _login(client)

    hinweise = _hole(client, kopf, "next-appointment")["hints"]
    assert any("noch keine Vorführung" in h for h in hinweise)


def test_terminvorbereitung_zeigt_keinen_fremden_termin(client, anna, bodo):
    _termin(bodo, datetime.now(timezone.utc) + timedelta(days=1))
    kopf = _login(client, "anna@example.com")

    assert _hole(client, kopf, "next-appointment")["appointment"] is None


# ============================================================== Nachfassen

def test_nachfassliste_begruendet_jeden_eintrag(client, anna, produkt):
    _vorfuehrung(anna, produkt, datetime.now(timezone.utc) - timedelta(days=8))
    _wiedervorlage(anna, local_today() - timedelta(days=2))
    kopf = _login(client)

    kunden = _hole(client, kopf, "follow-ups")["customers"]
    assert kunden
    assert len(kunden[0]["reasons"]) >= 2
    assert kunden[0]["phone"] == "0511 123456"


def test_nachfassliste_ist_leer_wenn_nichts_ansteht(client, anna):
    kopf = _login(client)
    daten = _hole(client, kopf, "follow-ups")

    assert daten["customers"] == []
    assert "keinen offenen Nachfassbedarf" in daten["note"]


def test_nachfassliste_zeigt_keine_fremden_kunden(client, anna, bodo, produkt):
    _vorfuehrung(bodo, produkt, datetime.now(timezone.utc) - timedelta(days=8))
    kopf = _login(client, "anna@example.com")

    assert _hole(client, kopf, "follow-ups")["customers"] == []


# =========================================================== Nachbetreuung

def test_nachbetreuung_schlaegt_nach_sieben_tagen_vor(client, anna, produkt):
    _verkauf(anna, produkt, datetime.now(timezone.utc) - timedelta(days=8))
    kopf = _login(client)

    daten = _hole(client, kopf, "aftercare")
    assert daten["suggestions"]
    assert daten["suggestions"][0]["stage_days"] == 7
    assert "Zufriedenheit" in daten["suggestions"][0]["suggestion"]


def test_nachbetreuung_legt_nichts_an(client, anna, produkt):
    """Ein System, das ungefragt Wiedervorlagen erzeugt, fuellt die Liste."""
    _verkauf(anna, produkt, datetime.now(timezone.utc) - timedelta(days=8))
    kopf = _login(client)
    _hole(client, kopf, "aftercare")

    db = SessionLocal()
    try:
        assert db.query(FollowUp).count() == 0
    finally:
        db.close()


def test_nachbetreuung_schweigt_bei_offener_wiedervorlage(client, anna, produkt):
    _verkauf(anna, produkt, datetime.now(timezone.utc) - timedelta(days=8))
    _wiedervorlage(anna, local_today() + timedelta(days=3))
    kopf = _login(client)

    assert _hole(client, kopf, "aftercare")["suggestions"] == []


# =========================================================== Verkaufscoach

def test_coach_haelt_sich_bei_zu_wenig_terminen_zurueck(client, anna):
    _termin(anna, datetime.now(timezone.utc) - timedelta(days=1),
            status=AppointmentStatus.COMPLETED, outcome="sale")
    kopf = _login(client)

    daten = _hole(client, kopf, "coaching")
    assert "zu wenig" in " ".join(daten["findings"])
    assert "Mehr Termine" in daten["biggest_lever"]


def test_coach_nennt_den_hebel_bei_gesunkener_quote(client, anna, produkt):
    jetzt = datetime.now(timezone.utc)
    for i in range(5):
        _termin(anna, jetzt - timedelta(hours=i + 1),
                status=AppointmentStatus.COMPLETED, outcome="none")
    kopf = _login(client)

    daten = _hole(client, kopf, "coaching")
    assert daten["metrics"]["appointments_done"] == 5
    assert daten["biggest_lever"] is not None


def test_zielprognose_rechnet_auf_arbeitstage(client, anna):
    kopf = _login(client)
    daten = _hole(client, kopf, "goal")

    assert daten["units_target"] == 20
    assert daten["units_missing"] == 20
    assert daten["working_days_left"] >= 0
    if daten["working_days_left"]:
        assert daten["units_per_working_day"] > 0


# ================================================================ Trichter

def test_trichter_zaehlt_jede_erreichte_stufe(client, anna, produkt):
    _termin(anna, datetime.now(timezone.utc) - timedelta(days=2),
            status=AppointmentStatus.COMPLETED)
    _vorfuehrung(anna, produkt, datetime.now(timezone.utc) - timedelta(days=2))
    kopf = _login(client)

    daten = _hole(client, kopf, "funnel")
    nach_stufe = {z["stage"]: z["count"] for z in daten["stages"]}

    # Wer die Vorfuehrung erreicht hat, hat alle Stufen davor auch erreicht.
    assert nach_stufe["contact"] == 1
    assert nach_stufe["presentation"] == 1
    assert nach_stufe["sale"] == 0


def test_trichter_nennt_den_groessten_abfall(client, anna, produkt):
    _vorfuehrung(anna, produkt, datetime.now(timezone.utc) - timedelta(days=2))
    kopf = _login(client)

    abfall = _hole(client, kopf, "funnel")["biggest_drop"]
    assert abfall is not None
    assert abfall["lost"] >= 1


def test_trichter_zaehlt_keine_fremden_kunden(client, anna, bodo):
    kopf = _login(client, "anna@example.com")
    assert _hole(client, kopf, "funnel")["customers"] == 1


# ========================================================= Produktanalyse

def test_produktanalyse_nutzt_echte_verkaufsdaten(client, anna, produkt):
    _verkauf(anna, produkt, datetime.now(timezone.utc) - timedelta(days=3), cent=129900)
    kopf = _login(client)

    daten = _hole(client, kopf, "products")
    assert daten["products"][0]["name"] == "Kobold VK7"
    assert daten["products"][0]["revenue_cents"] == 129900


def test_produktanalyse_nennt_nie_verkaufte_produkte(client, anna, produkt):
    kopf = _login(client)
    daten = _hole(client, kopf, "products")

    assert "Kobold VK7" in daten["never_sold"]
    assert "nichts verkauft" in daten["note"]


# ============================================================ Sichtbarkeit

@pytest.mark.parametrize("was", [
    "priorities", "next-appointment", "follow-ups", "aftercare",
    "coaching", "goal", "funnel", "products",
])
def test_jede_auswertung_braucht_anmeldung(client, was):
    assert client.get(f"/api/v1/assistant/insights/{was}").status_code == 401


def test_unbekannte_auswertung_ist_404(client, anna):
    kopf = _login(client)
    assert client.get("/api/v1/assistant/insights/gibtesnicht", headers=kopf).status_code == 404


def test_mitarbeiter_kann_nicht_auf_fremde_zahlen_umschalten(client, anna, bodo, produkt):
    _verkauf(bodo, produkt, datetime.now(timezone.utc) - timedelta(days=3), cent=900000)
    kopf = _login(client, "anna@example.com")

    antwort = client.get("/api/v1/assistant/insights/products",
                         params={"employee_id": bodo["employee"]}, headers=kopf)
    assert antwort.status_code == 403


def test_teamleiter_sieht_das_team(client, anna, bodo, chefin, produkt):
    _verkauf(anna, produkt, datetime.now(timezone.utc) - timedelta(days=3), cent=100000)
    _verkauf(bodo, produkt, datetime.now(timezone.utc) - timedelta(days=3), cent=900000)
    kopf = _login(client, "chefin@example.com")

    daten = _hole(client, kopf, "products")
    assert daten["products"][0]["revenue_cents"] == 1000000
