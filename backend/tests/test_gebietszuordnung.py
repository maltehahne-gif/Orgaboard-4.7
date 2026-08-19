"""Tests fuer die Gebietszuordnung (app/tools/gebietszuordnung.py).

Der Schwerpunkt liegt nicht darauf, moeglichst viele Kunden zuzuordnen,
sondern darauf, keinen falsch zuzuordnen. Deshalb pruefen die meisten Tests,
dass in einem Zweifelsfall gerade nichts passiert - und dass ausser
employee_id kein einziges Feld angefasst wird.
"""
import os
import tempfile
from datetime import datetime, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.core.timeutils import utc_aware  # noqa: E402
from app.models import (  # noqa: E402
    Appointment,
    AppointmentStatus,
    Customer,
    Employee,
    Role,
    Sale,
    SaleChannel,
    User,
)
from app.tools.gebietszuordnung import (  # noqa: E402
    Analyse,
    MitarbeiterNichtEindeutig,
    analysiere,
    anwenden,
    bericht,
    bewerte,
    finde_mitarbeiter,
    normalisieren,
    sicherung_schreiben,
)

PASSWORD = "PasswortPasswort1"


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    sitzung = SessionLocal()
    try:
        yield sitzung
    finally:
        sitzung.close()
        Base.metadata.drop_all(bind=engine)


def _mitarbeiter(db, name="Joachim Hansen", email=None, aktiv=True):
    user = User(
        email=email or f"{normalisieren(name).replace(' ', '.')}@example.com",
        full_name=name,
        password_hash=hash_password(PASSWORD),
        role=Role.EMPLOYEE,
        must_change_password=False,
        is_active=aktiv,
    )
    db.add(user)
    db.flush()
    employee = Employee(user_id=user.id, display_name=name)
    db.add(employee)
    db.flush()
    return user, employee


def _kunde(db, employee_id, **felder):
    werte = {
        "first_name": "Vorname",
        "last_name": "Nachname",
        "street": "Musterweg",
        "house_number": "1",
        "postal_code": "24960",
        "city": "Sörup",
    }
    werte.update(felder)
    kunde = Customer(employee_id=employee_id, **werte)
    db.add(kunde)
    db.flush()
    return kunde


# ------------------------------------------------------- Normalisierung

@pytest.mark.parametrize("eingabe,erwartet", [
    ("Glücksburg (Ostsee)", "glucksburg ostsee"),
    ("Glücksburg (ostsee)", "glucksburg ostsee"),
    ("Glücksburg", "glucksburg"),
    ("  SÖRUP  ", "sorup"),
    ("Esgrüs", "esgrus"),
    ("Steinbergkirche", "steinbergkirche"),
    (None, ""),
    ("", ""),
])
def test_ortsschreibweisen_werden_vereinheitlicht(eingabe, erwartet):
    assert normalisieren(eingabe) == erwartet


def test_glucksburg_schreibweisen_meinen_denselben_ort(db):
    """Drei Schreibweisen, ein Ort - sonst waeren es drei Gebiete."""
    _, employee = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    for schreibweise in ("Glücksburg (Ostsee)", "Glücksburg (ostsee)", "Glücksburg"):
        _kunde(db, fremd.id, city=schreibweise)
    db.commit()

    ergebnis = analysiere(db, employee.id)
    assert len(ergebnis.zu_aendern) == 3


# --------------------------------------------------------- Mitarbeiter

def test_findet_genau_einen_joachim_hansen(db):
    user, employee = _mitarbeiter(db)
    db.commit()

    gefunden_user, gefunden_employee = finde_mitarbeiter(db)
    assert gefunden_user.id == user.id
    assert gefunden_employee.id == employee.id


def test_bricht_ab_wenn_es_zwei_gleichnamige_gibt(db):
    """Nicht raten: eine falsche Zuweisung liesse sich kaum entwirren."""
    _mitarbeiter(db, email="joachim1@example.com")
    _mitarbeiter(db, email="joachim2@example.com")
    db.commit()

    with pytest.raises(MitarbeiterNichtEindeutig, match="2 aktive Konten"):
        finde_mitarbeiter(db)


def test_bricht_ab_wenn_es_niemanden_gibt(db):
    db.commit()
    with pytest.raises(MitarbeiterNichtEindeutig, match="Kein aktives Benutzerkonto"):
        finde_mitarbeiter(db)


def test_inaktives_konto_zaehlt_nicht(db):
    _mitarbeiter(db, email="alt@example.com", aktiv=False)
    db.commit()
    with pytest.raises(MitarbeiterNichtEindeutig):
        finde_mitarbeiter(db)


def test_ein_aktiver_neben_einem_inaktiven_ist_eindeutig(db):
    _mitarbeiter(db, email="alt@example.com", aktiv=False)
    user, _ = _mitarbeiter(db, email="aktuell@example.com")
    db.commit()

    gefunden, _ = finde_mitarbeiter(db)
    assert gefunden.id == user.id


def test_ohne_mitarbeiterprofil_wird_abgebrochen(db):
    user = User(email="ohne@example.com", full_name="Joachim Hansen",
                password_hash=hash_password(PASSWORD), role=Role.EMPLOYEE,
                must_change_password=False)
    db.add(user)
    db.commit()

    with pytest.raises(MitarbeiterNichtEindeutig, match="kein Mitarbeiterprofil"):
        finde_mitarbeiter(db)


# ------------------------------------------------------------ Bewertung

@pytest.mark.parametrize("ort,gebiet", [
    ("Sörup", "Sörup"),
    ("Steinbergkirche", "Steinbergkirche"),
    ("Langballig", "Langballig"),
    ("Wees", "Wees / Munkbrarup"),
    ("Munkbrarup", "Wees / Munkbrarup"),
    ("Ahneby", "Ahneby / Esgrüs / Niesgrau"),
    ("Esgrüs", "Ahneby / Esgrüs / Niesgrau"),
    ("Niesgrau", "Ahneby / Esgrüs / Niesgrau"),
])
def test_eindeutige_orte_werden_zugeordnet(ort, gebiet):
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city=ort, postal_code="24960")
    assert bewerte(kunde) == (gebiet, "Ort eindeutig im Gebiet")


def test_wees_und_munkbrarup_bleiben_unterscheidbar_im_ortsfeld():
    """Das kombinierte Gebiet, aber je Kunde der tatsaechliche Ort."""
    wees = Customer(employee_id="x", first_name="A", last_name="B", city="Wees")
    munk = Customer(employee_id="x", first_name="A", last_name="B", city="Munkbrarup")
    assert bewerte(wees)[0] == bewerte(munk)[0] == "Wees / Munkbrarup"
    assert wees.city != munk.city


def test_glucksburg_wird_nicht_in_nord_und_sued_geraten():
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Glücksburg (Ostsee)", postal_code="24960")
    gebiet, _ = bewerte(kunde)
    assert gebiet is not None
    assert "Nord" not in gebiet.replace("Nord/Süd nicht unterscheidbar", "")
    assert "nicht unterscheidbar" in gebiet


# ------------------------------------------------------------ Flensburg

def test_flensburg_ohne_stadtteil_wird_nicht_zugeordnet():
    """219 Datensätze heißen Flensburg - die Listen decken nur zwei Stadtteile."""
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Flensburg", postal_code="24943")
    gebiet, grund = bewerte(kunde)
    assert gebiet is None
    assert grund.startswith("unklar")
    assert "Mürwik/Engelsby" in grund


@pytest.mark.parametrize("ort,gebiet", [
    ("Flensburg-Mürwik", "Mürwik"),
    ("Flensburg Engelsby", "Engelsby"),
])
def test_flensburg_mit_stadtteil_im_ortsfeld_wird_zugeordnet(ort, gebiet):
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city=ort, postal_code="24944")
    assert bewerte(kunde) == (gebiet, "Stadtteil im Ortsfeld")


@pytest.mark.parametrize("notiz,gebiet", [
    ("Gebiet: Mürwik", "Mürwik"),
    ("CRM-Liste Engelsby", "Engelsby"),
])
def test_flensburg_mit_gebietsvermerk_in_den_notizen_wird_zugeordnet(notiz, gebiet):
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Flensburg", postal_code="24943", notes=notiz)
    assert bewerte(kunde) == (gebiet, "Gebietskennung in den Notizen")


def test_widerspruechlicher_gebietsvermerk_zaehlt_nicht_als_beleg():
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Flensburg", notes="früher Mürwik, jetzt Engelsby")
    gebiet, grund = bewerte(kunde)
    assert gebiet is None
    assert grund.startswith("unklar")


def test_aehnlich_klingende_strasse_ist_kein_beleg():
    """Der Auftrag ist hier ausdrücklich: keine Vermutung über die Straße."""
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Flensburg", street="Mürwiker Straße", house_number="12",
                     postal_code="24944")
    assert bewerte(kunde)[0] is None


# ------------------------------------------------------------- Randorte

@pytest.mark.parametrize("ort", [
    "Sterup", "Steinberg", "Dollerup", "Westerholz",
    "Ringsberg", "Stangheck", "Mittelangeln", "Süderhackstedt",
])
def test_randorte_ohne_gebietskennung_werden_nicht_zugeordnet(ort):
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city=ort, postal_code="24996")
    gebiet, grund = bewerte(kunde)
    assert gebiet is None
    assert grund == "unklar: Randort ohne Gebietskennung"


def test_randort_mit_gebietskennung_wird_zugeordnet():
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Sterup", postal_code="24996", notes="Gebietsliste Sörup")
    assert bewerte(kunde) == ("Sörup", "Gebietskennung in den Notizen")


# ------------------------------------------------------------------ PLZ

def test_fehlende_plz_verhindert_die_zuordnung_nicht():
    """Datenlücken dürfen die Zuordnung nicht blockieren."""
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Sörup", postal_code="")
    assert bewerte(kunde)[0] == "Sörup"


def test_fehlende_telefonnummer_verhindert_die_zuordnung_nicht():
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Sörup", postal_code="24966", phone=None)
    assert bewerte(kunde)[0] == "Sörup"


def test_gleichnamiger_ort_ausserhalb_der_region_wird_nicht_zugeordnet():
    """"Steinberg" gibt es auch anderswo - die PLZ ist die Gegenprobe."""
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Sörup", postal_code="80331")
    gebiet, grund = bewerte(kunde)
    assert gebiet is None
    assert "außerhalb der Region" in grund


def test_ort_ausserhalb_des_gebiets_bleibt_unberuehrt():
    kunde = Customer(employee_id="x", first_name="A", last_name="B",
                     city="Kiel", postal_code="24103")
    assert bewerte(kunde) == (None, "außerhalb des Gebiets")


def test_kunde_ohne_ort_wird_nicht_geraten():
    kunde = Customer(employee_id="x", first_name="A", last_name="B", city="")
    gebiet, grund = bewerte(kunde)
    assert gebiet is None
    assert grund == "unklar: kein Ort hinterlegt"


# ------------------------------------------------------------- Trockenlauf

def test_trockenlauf_aendert_nichts(db):
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    kunde = _kunde(db, fremd.id, city="Sörup")
    db.commit()

    ergebnis = analysiere(db, joachim.id)
    assert len(ergebnis.zu_aendern) == 1

    db.expire_all()
    assert db.get(Customer, kunde.id).employee_id == fremd.id


def test_bereits_zugeordnete_kunden_werden_nicht_erneut_geschrieben(db):
    _, joachim = _mitarbeiter(db)
    _kunde(db, joachim.id, city="Sörup")
    db.commit()

    ergebnis = analysiere(db, joachim.id)
    assert len(ergebnis.bereits_zugeordnet) == 1
    assert ergebnis.zu_aendern == []


def test_fremdzuordnung_kann_vollstaendig_geschont_werden(db):
    """Der Schalter für "erst manuell prüfen"."""
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    _kunde(db, fremd.id, city="Sörup")
    db.commit()

    ergebnis = analysiere(db, joachim.id, fremdzuordnung_uebernehmen=False)
    assert ergebnis.zu_aendern == []
    assert any("manuelle Prüfung" in e.grund for e in ergebnis.entscheidungen)


def test_geloeschte_kunden_bleiben_aussen_vor(db):
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    kunde = _kunde(db, fremd.id, city="Sörup")
    kunde.deleted_at = datetime.now(timezone.utc)
    db.commit()

    ergebnis = analysiere(db, joachim.id)
    assert ergebnis.zu_aendern == []


# ---------------------------------------------------------------- Anwenden

def test_anwenden_setzt_nur_employee_id(db):
    """Der Kern der Zusicherung: kein anderes Feld wird angefasst."""
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    kunde = _kunde(
        db, fremd.id,
        city="Sörup", first_name="Anna", last_name="Andersen",
        street="Dorfstraße", house_number="7", postal_code="24966",
        phone="04635 12345", email="anna@example.com", notes="Bitte vormittags anrufen",
    )
    vorher = {
        "first_name": kunde.first_name, "last_name": kunde.last_name,
        "street": kunde.street, "house_number": kunde.house_number,
        "postal_code": kunde.postal_code, "city": kunde.city,
        "phone": kunde.phone, "email": kunde.email, "notes": kunde.notes,
        "created_at": kunde.created_at, "deleted_at": kunde.deleted_at,
        "anonymized_at": kunde.anonymized_at,
    }
    kunde_id = kunde.id
    db.commit()

    ergebnis = analysiere(db, joachim.id)
    assert anwenden(db, ergebnis) == 1

    db.expire_all()
    nachher = db.get(Customer, kunde_id)
    assert nachher.employee_id == joachim.id
    for feld, wert in vorher.items():
        jetzt = getattr(nachher, feld)
        # SQLite gibt Zeitstempel ohne Zone zurueck, auch bei timezone=True -
        # dieselbe Stelle, die auch core/timeutils.utc_aware behandelt. Der
        # Vergleich meint den Zeitpunkt, nicht seine Darstellung.
        if isinstance(wert, datetime):
            jetzt, wert = utc_aware(jetzt), utc_aware(wert)
        assert jetzt == wert, f"{feld} wurde verändert"


def test_anwenden_loescht_und_dupliziert_keine_kunden(db):
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    for ort in ("Sörup", "Flensburg", "Kiel", "Wees"):
        _kunde(db, fremd.id, city=ort)
    db.commit()

    vorher = db.query(Customer).count()
    anwenden(db, analysiere(db, joachim.id))
    assert db.query(Customer).count() == vorher


def test_anwenden_laesst_verkaeufe_und_termine_unberuehrt(db):
    """Zuordnung heißt Zuordnung - nicht Umbuchen der Historie."""
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    kunde = _kunde(db, fremd.id, city="Sörup")
    db.add(Sale(customer_id=kunde.id, employee_id=fremd.id,
                sold_at=datetime.now(timezone.utc), channel=SaleChannel.FIELD))
    db.add(Appointment(customer_id=kunde.id, employee_id=fremd.id,
                       start_at=datetime.now(timezone.utc),
                       status=AppointmentStatus.PLANNED))
    db.commit()

    verkaeufe_vorher = db.query(Sale).count()
    termine_vorher = db.query(Appointment).count()

    anwenden(db, analysiere(db, joachim.id))

    db.expire_all()
    assert db.query(Sale).count() == verkaeufe_vorher
    assert db.query(Appointment).count() == termine_vorher
    # Der Verkauf bleibt beim bisherigen Mitarbeiter - die Umsatzhistorie
    # der Vergangenheit darf sich nicht rückwirkend verschieben.
    assert db.query(Sale).one().employee_id == fremd.id
    assert db.query(Appointment).one().employee_id == fremd.id


def test_gesperrter_kunde_wird_zugeordnet_aber_nicht_entsperrt(db):
    """Sperrvermerke sind in OrgaBoard die Anonymisierung nach Art. 17."""
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    kunde = _kunde(db, fremd.id, city="Sörup")
    gesperrt_seit = datetime.now(timezone.utc)
    kunde.anonymized_at = gesperrt_seit
    kunde_id = kunde.id
    db.commit()

    anwenden(db, analysiere(db, joachim.id))

    db.expire_all()
    nachher = db.get(Customer, kunde_id)
    assert nachher.employee_id == joachim.id
    assert nachher.anonymized_at is not None


def test_zweiter_lauf_aendert_nichts_mehr(db):
    """Wiederholbar ohne Nebenwirkung - ein Lauf zu viel schadet nicht."""
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    _kunde(db, fremd.id, city="Sörup")
    db.commit()

    assert anwenden(db, analysiere(db, joachim.id)) == 1
    assert anwenden(db, analysiere(db, joachim.id)) == 0


def test_zahlen_gehen_nach_dem_lauf_auf(db):
    """eindeutig + bereits + unklar muss die betrachtete Menge ergeben."""
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    _kunde(db, joachim.id, city="Wees")                       # bereits
    _kunde(db, fremd.id, city="Sörup")                        # eindeutig
    _kunde(db, fremd.id, city="Flensburg", postal_code="24943")  # unklar
    _kunde(db, fremd.id, city="Sterup", postal_code="24996")     # unklar
    _kunde(db, fremd.id, city="Kiel", postal_code="24103")       # außerhalb
    db.commit()

    ergebnis = analysiere(db, joachim.id)
    assert len(ergebnis.zu_aendern) == 1
    assert len(ergebnis.bereits_zugeordnet) == 1
    offen = [e for e in ergebnis.unklar if e.grund.startswith("unklar")]
    assert len(offen) == 2
    assert len(ergebnis.zu_aendern) + len(ergebnis.bereits_zugeordnet) + len(offen) == 4


# ----------------------------------------------------------- Sicherung

def test_sicherung_haelt_den_weg_zurueck_fest(db, tmp_path):
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    kunde = _kunde(db, fremd.id, city="Sörup")
    kunde_id = kunde.id
    db.commit()

    ergebnis = analysiere(db, joachim.id)
    pfad = tmp_path / "vorher.csv"
    assert sicherung_schreiben(db, ergebnis, str(pfad)) == 1

    zeilen = pfad.read_text(encoding="utf-8").strip().splitlines()
    assert zeilen[0] == "customer_id;employee_id_vorher;employee_id_nachher"
    assert zeilen[1] == f"{kunde_id};{fremd.id};{joachim.id}"


def test_sicherung_enthaelt_keine_personenbezogenen_daten(db, tmp_path):
    _, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    _kunde(db, fremd.id, city="Sörup", first_name="Anna", last_name="Andersen",
           phone="04635 12345", email="anna@example.com", street="Dorfstraße")
    db.commit()

    pfad = tmp_path / "vorher.csv"
    sicherung_schreiben(db, analysiere(db, joachim.id), str(pfad))
    inhalt = pfad.read_text(encoding="utf-8")

    for geheim in ("Anna", "Andersen", "04635", "anna@example.com", "Dorfstraße"):
        assert geheim not in inhalt


# ------------------------------------------------------------- Bericht

def test_bericht_nennt_keine_personenbezogenen_daten(db):
    user, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    _kunde(db, fremd.id, city="Sörup", first_name="Anna", last_name="Andersen",
           phone="04635 12345", email="anna@example.com", street="Dorfstraße")
    db.commit()

    text = bericht(analysiere(db, joachim.id), user)

    for geheim in ("Anna", "Andersen", "04635", "anna@example.com", "Dorfstraße"):
        assert geheim not in text


def test_bericht_zeigt_alle_verlangten_kennzahlen(db):
    user, joachim = _mitarbeiter(db)
    _, fremd = _mitarbeiter(db, "Fremde Kollegin")
    _kunde(db, joachim.id, city="Wees")
    _kunde(db, fremd.id, city="Sörup")
    _kunde(db, fremd.id, city="Flensburg", postal_code="24943")
    db.commit()

    text = bericht(analysiere(db, joachim.id), user)

    for ueberschrift in (
        "Benutzer-ID", "Employee-ID", "Kunden gesamt",
        "aktuell Joachim Hansen zugeordnet", "davon innerhalb des Gebiets",
        "eindeutig zuordenbar",
        "unklar / nicht verändert", "vorher anderem Mitarbeiter zugeordnet",
        "ZUORDNUNG NACH GEBIET", "ZUORDNUNG NACH ORT", "UNKLARE FÄLLE NACH GRUND",
    ):
        assert ueberschrift in text

    assert user.id in text
    assert joachim.id in text


def test_bericht_laeuft_auch_ohne_jeden_treffer(db):
    user, joachim = _mitarbeiter(db)
    db.commit()
    text = bericht(analysiere(db, joachim.id), user)
    assert "(keine)" in text
