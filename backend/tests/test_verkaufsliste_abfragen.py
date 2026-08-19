"""Die Verkaufsliste darf nicht mit der Anzahl der Verkäufe langsamer werden.

Vorher kostete jeder einzelne Verkauf sechs Abfragen: Kunde, Positionen,
Produkte, K70-Anteil, Einheiten, Mitarbeiter. Das fällt bei zehn Verkäufen
in der Entwicklung nicht auf und macht die Seite nach einem Jahr Betrieb
unbenutzbar. Der Test zählt deshalb die Abfragen und hält fest, dass ihre
Zahl nicht mit dem Bestand wächst.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db"))
os.environ.setdefault("JWT_SECRET", "test-secret-mit-mindestens-32-zeichen-laenge")

from sqlalchemy import create_engine, event, select  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.models import Customer, Employee, Product, Role, Sale, SaleItem, User  # noqa: E402
from app.routers.sales import lade_kontext, serialize  # noqa: E402


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


class Abfragezaehler:
    """Zählt die SQL-Abfragen einer Sitzung."""

    def __init__(self, session):
        self.session = session
        self.anzahl = 0

    def __enter__(self):
        event.listen(self.session.bind, "before_cursor_execute", self._zaehlen)
        return self

    def __exit__(self, *_):
        event.remove(self.session.bind, "before_cursor_execute", self._zaehlen)

    def _zaehlen(self, *_args, **_kwargs):
        self.anzahl += 1


def welt(db, anzahl_verkaeufe):
    user = User(
        email="mira@example.com", full_name="Mira Musterfrau", password_hash="hash",
        role=Role.EMPLOYEE, must_change_password=False,
    )
    db.add(user)
    db.flush()
    employee = Employee(user_id=user.id, display_name="Mira Musterfrau")
    db.add(employee)
    db.flush()
    customer = Customer(employee_id=employee.id, first_name="Anna", last_name="Beispiel")
    db.add(customer)
    produkt = Product(name="Kobold VK7", category="Kobold", verified=True, active=True)
    db.add(produkt)
    db.flush()

    for nummer in range(anzahl_verkaeufe):
        s = Sale(
            customer_id=customer.id,
            employee_id=employee.id,
            sold_at=datetime.now(timezone.utc) - timedelta(hours=nummer),
        )
        db.add(s)
        db.flush()
        db.add(SaleItem(
            sale_id=s.id, product_id=produkt.id, product_name_snapshot=produkt.name,
            quantity=1, unit_price_cents=250000,
        ))
    db.flush()
    db.expire_all()
    return employee


def liste(db, employee):
    sales = list(db.scalars(select(Sale).where(Sale.employee_id == employee.id)).all())
    kontext = lade_kontext(db, sales)
    return [serialize(db, s, kontext) for s in sales]


def test_die_abfragezahl_waechst_nicht_mit_der_zahl_der_verkaeufe(db):
    employee = welt(db, 3)
    with Abfragezaehler(db) as bei_drei:
        assert len(liste(db, employee)) == 3

    db.query(Sale).delete()
    db.flush()
    employee = db.query(Employee).first()
    for nummer in range(30):
        s = Sale(
            customer_id=db.query(Customer).first().id,
            employee_id=employee.id,
            sold_at=datetime.now(timezone.utc) - timedelta(hours=nummer),
        )
        db.add(s)
        db.flush()
        db.add(SaleItem(
            sale_id=s.id, product_id=db.query(Product).first().id,
            product_name_snapshot="Kobold VK7", quantity=1, unit_price_cents=250000,
        ))
    db.flush()
    db.expire_all()

    with Abfragezaehler(db) as bei_dreissig:
        assert len(liste(db, employee)) == 30

    assert bei_dreissig.anzahl == bei_drei.anzahl


def test_die_ganze_liste_kommt_mit_wenigen_abfragen_aus(db):
    employee = welt(db, 25)
    with Abfragezaehler(db) as zaehler:
        liste(db, employee)
    # Verkäufe, Positionen, Kunden, Mitarbeiter - mehr braucht es nicht.
    assert zaehler.anzahl <= 5


def test_gebuendelte_und_einzelne_aufbereitung_liefern_dasselbe(db):
    """Der Kontext darf nichts anderes ergeben als der Einzelweg.

    Beim Speichern eines Verkaufs läuft serialize() ohne Kontext. Kämen
    dabei andere Beträge heraus als in der Liste, widersprächen sich zwei
    Ansichten desselben Verkaufs.
    """
    employee = welt(db, 2)
    sales = list(db.scalars(select(Sale).where(Sale.employee_id == employee.id)).all())
    kontext = lade_kontext(db, sales)
    for s in sales:
        assert serialize(db, s, kontext) == serialize(db, s)
