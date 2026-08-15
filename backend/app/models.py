from __future__ import annotations
import enum
import uuid
from datetime import date, datetime, timezone
from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def uid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    """Berechtigungsstufen, aufsteigend.

    Die Reihenfolge ist die Aussage: eine hoehere Stufe darf alles, was eine
    niedrigere darf. Geprueft wird deshalb nirgends auf Gleichheit, sondern
    ueber rang() - sonst muesste jede neue Rolle in jeder einzelnen Abfrage
    nachgetragen werden, und die eine vergessene Stelle faellt niemandem auf.

    Die beiden urspruenglichen Werte behalten ihre Schreibweise. Ein
    bestehender Datensatz bleibt damit gueltig, ohne angefasst zu werden.
    """

    EMPLOYEE = "EMPLOYEE"
    TEAM_LEADER = "TEAM_LEADER"
    REGIONAL_LEAD = "REGIONAL_LEAD"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"

    @property
    def rang(self) -> int:
        return _ROLLEN_RANG[self]

    def mindestens(self, andere: "Role") -> bool:
        """Ob diese Rolle mindestens so weit reicht wie die andere."""
        return self.rang >= andere.rang


# Getrennt von der Enum, damit sich die Rangfolge aendern laesst, ohne die
# gespeicherten Werte anzufassen.
_ROLLEN_RANG: dict[Role, int] = {
    Role.EMPLOYEE: 0,
    Role.TEAM_LEADER: 10,
    Role.REGIONAL_LEAD: 20,
    Role.SYSTEM_ADMIN: 100,
}

ROLLEN_BEZEICHNUNG: dict[Role, str] = {
    Role.EMPLOYEE: "Mitarbeiter",
    Role.TEAM_LEADER: "Teamleiter",
    Role.REGIONAL_LEAD: "Regionalleiter",
    Role.SYSTEM_ADMIN: "Systemadministrator",
}


class AppointmentStatus(str, enum.Enum):
    PLANNED = "planned"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"


class AppointmentType(str, enum.Enum):
    CUSTOMER = "customer"
    PROMOTION = "promotion"
    RECOMMENDATION = "recommendation"
    PREMIUM_CHECKIN = "premium_checkin"
    TEAM = "team"
    TELEPHONE = "telephone"
    OTHER = "other"


class RentalStatus(str, enum.Enum):
    AVAILABLE = "available"
    RENTED = "rented"
    DUE = "due"
    RETURNED = "returned"


class SaleChannel(str, enum.Enum):
    FIELD = "field"
    PROMOTION = "promotion"
    K70 = "k70"
    OTHER = "other"


class FollowUpStatus(str, enum.Enum):
    OPEN = "open"
    DONE = "done"
    CANCELLED = "cancelled"


class FollowUpReason(str, enum.Enum):
    """Warum nachgefasst wird. Steuert den Vorschlagstext in der Oberflaeche."""

    NO_RESULT = "no_result"          # Termin ohne Abschluss
    AFTER_SALE = "after_sale"        # Nachbetreuung nach Verkauf
    RENTAL_RETURN = "rental_return"  # Geraet zurueckholen
    OFFER = "offer"                  # Angebot nachfassen
    MANUAL = "manual"                # von Hand angelegt


class FunnelStage(str, enum.Enum):
    """Stufen des Verkaufstrichters.

    Die Stufe wird nicht gespeichert, sondern aus den Ereignissen des Kunden
    abgeleitet - sonst laufen Stufe und Wirklichkeit auseinander, sobald jemand
    einen Termin oder Verkauf nachtraegt.
    """

    CONTACT = "contact"
    APPOINTMENT_SET = "appointment_set"
    APPOINTMENT_DONE = "appointment_done"
    PRESENTATION = "presentation"
    OFFER = "offer"
    SALE = "sale"
    AFTERCARE = "aftercare"


class Region(Base):
    """Oberste Ebene der Vertriebsstruktur unterhalb des Unternehmens."""

    __tablename__ = "regions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    # Die Leitung ist ein Benutzer, kein Mitarbeiterprofil: ein Regionalleiter
    # muss nicht selbst im Aussendienst arbeiten.
    lead_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class District(Base):
    """Bezirk innerhalb einer Region."""

    __tablename__ = "districts"
    __table_args__ = (UniqueConstraint("region_id", "name", name="uq_district_name_in_region"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    region_id: Mapped[str] = mapped_column(ForeignKey("regions.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    lead_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Team(Base):
    """Team innerhalb eines Bezirks - die Ebene, an der Mitarbeiter haengen."""

    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("district_id", "name", name="uq_team_name_in_district"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    district_id: Mapped[str] = mapped_column(ForeignKey("districts.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    lead_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Permission(str, enum.Enum):
    """Einzelrechte, die sich je Benutzer abweichend von der Rolle setzen lassen.

    Die Rolle legt fest, was ueblich ist. Ein Eintrag in user_permissions
    weicht davon bewusst ab - in beide Richtungen. Ohne Eintrag gilt die
    Rolle, damit eine neue Rolle nicht bedeutet, dass jeder Benutzer einzeln
    nachgepflegt werden muss.
    """

    KUNDEN_SEHEN = "customers.view"
    KUNDEN_BEARBEITEN = "customers.edit"
    KUNDEN_LOESCHEN = "customers.delete"

    TERMINE_SEHEN = "appointments.view"
    TERMINE_ERSTELLEN = "appointments.create"
    TERMINE_BEARBEITEN = "appointments.edit"
    TERMINE_LOESCHEN = "appointments.delete"

    VERKAEUFE_SEHEN = "sales.view"
    VERKAEUFE_ERSTELLEN = "sales.create"
    VERKAEUFE_LOESCHEN = "sales.delete"

    PRODUKTE_VERWALTEN = "products.manage"
    CHAT_NUTZEN = "chat.use"
    DASHBOARD_SEHEN = "dashboard.view"
    STATISTIK_SEHEN = "stats.view"
    EXPORT = "export.run"


class UserPermission(Base):
    """Abweichung vom Rollenstandard fuer einen einzelnen Benutzer."""

    __tablename__ = "user_permissions"
    __table_args__ = (UniqueConstraint("user_id", "permission", name="uq_user_permission"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    permission: Mapped[Permission] = mapped_column(Enum(Permission), index=True)
    # True = ausdruecklich erlaubt, False = ausdruecklich entzogen. Kein
    # Eintrag heisst: es gilt, was die Rolle vorsieht.
    allowed: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class SystemSetting(Base):
    """Betreibereinstellungen als Schluessel-Wert-Paare.

    Bewusst keine Spalte je Einstellung: eine neue Einstellung soll keine
    Migration brauchen. Der Wert liegt als JSON, damit auch Listen und
    Zahlen ohne Umwege hineinpassen.
    """

    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    updated_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # full_name bleibt die eine Quelle fuer die Anzeige - jede Liste, jede
    # Nachricht und jeder Bericht liest sie. Vor- und Nachname stehen
    # zusaetzlich fuer die Verwaltungsmaske; beim Speichern dort wird
    # full_name daraus zusammengesetzt, damit beide nicht auseinanderlaufen.
    full_name: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(500))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.EMPLOYEE, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    employee: Mapped[Employee | None] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), index=True)
    position: Mapped[str] = mapped_column(String(120), default="Vertriebspartner")
    monthly_units_target: Mapped[int] = mapped_column(Integer, default=30)
    weekly_revenue_target_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_area_target_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_total_target_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Nur das Team wird gespeichert. Bezirk und Region ergeben sich daraus -
    # zwei Angaben, die dasselbe meinen, laufen sonst frueher oder spaeter
    # auseinander.
    team_id: Mapped[str | None] = mapped_column(
        ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True
    )
    employee_number: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    hired_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    location: Mapped[str | None] = mapped_column(String(160), nullable=True)

    user: Mapped[User] = relationship(back_populates="employee")


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    first_name: Mapped[str] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120), index=True)
    street: Mapped[str] = mapped_column(String(180), default="")
    house_number: Mapped[str] = mapped_column(String(30), default="")
    postal_code: Mapped[str] = mapped_column(String(20), default="")
    city: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Gesetzt, sobald die personenbezogenen Felder unwiderruflich entfernt
    # wurden (Loeschanfrage nach Art. 17 DSGVO). Der Datensatz selbst bleibt,
    # damit Verkaeufe und Umsatzzahlen nicht nachtraeglich verschwinden.
    anonymized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CustomerNote(Base):
    """Notiz mit Verlauf.

    Customer.notes bleibt als Kurzinfo bestehen. Wer den Gespraechsverlauf
    nachvollziehen will, braucht aber datierte Eintraege statt eines Feldes,
    das beim naechsten Bearbeiten ueberschrieben wird.
    """

    __tablename__ = "customer_notes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)


class FollowUp(Base):
    """Wiedervorlage: was wann bei welchem Kunden ansteht."""

    __tablename__ = "follow_ups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)

    due_on: Mapped[date] = mapped_column(Date, index=True)
    reason: Mapped[FollowUpReason] = mapped_column(Enum(FollowUpReason), default=FollowUpReason.MANUAL)
    status: Mapped[FollowUpStatus] = mapped_column(Enum(FollowUpStatus), default=FollowUpStatus.OPEN, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Woraus die Wiedervorlage entstanden ist, damit die Timeline den
    # Zusammenhang zeigen kann.
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id", ondelete="SET NULL"), nullable=True)
    sale_id: Mapped[str | None] = mapped_column(ForeignKey("sales.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    category: Mapped[str] = mapped_column(String(120), default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    functions_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    technical_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    variants_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    accessories_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    official_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_kind: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    prices: Mapped[list[ProductPrice]] = relationship(back_populates="product", cascade="all, delete-orphan")
    images: Mapped[list[ProductImage]] = relationship(back_populates="product", cascade="all, delete-orphan")


class ProductPrice(Base):
    __tablename__ = "product_prices"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    source_url: Mapped[str] = mapped_column(String(1000))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    product: Mapped[Product] = relationship(back_populates="prices")


class ProductImage(Base):
    __tablename__ = "product_images"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(1500))
    alt_text: Mapped[str | None] = mapped_column(String(300), nullable=True)
    source_url: Mapped[str] = mapped_column(String(1000))
    usage_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    product: Mapped[Product] = relationship(back_populates="images")


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id"), nullable=True, index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    appointment_type: Mapped[AppointmentType] = mapped_column(Enum(AppointmentType), default=AppointmentType.CUSTOMER)
    status: Mapped[AppointmentStatus] = mapped_column(Enum(AppointmentStatus), default=AppointmentStatus.PLANNED)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    address_snapshot: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone_snapshot: Mapped[str | None] = mapped_column(String(80), nullable=True)
    email_snapshot: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Ergebnis der Durchfuehrung: sale | rental | none. Wurde bisher nur
    # ausgewertet und verworfen; Trichter und Nachfassvorschlag brauchen es.
    outcome: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    # Nur gesetzt, wenn outcome == "none": warum es nicht zum Abschluss kam.
    no_result_reason: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class AppointmentProduct(Base):
    __tablename__ = "appointment_products"
    __table_args__ = (UniqueConstraint("appointment_id", "product_id", name="uq_appointment_product"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    appointment_id: Mapped[str] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)


class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id"), nullable=True)
    sold_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    channel: Mapped[SaleChannel] = mapped_column(Enum(SaleChannel), default=SaleChannel.OTHER)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    # Storno statt Loeschen. Ein stornierter Verkauf bleibt vollstaendig
    # erhalten - mit Positionen, Kunde und Datum - zaehlt aber in keiner
    # Auswertung mehr. Loeschen wuerde die Nachvollziehbarkeit zerstoeren,
    # gerade wenn Provisionen daran haengen.
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    cancelled_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class SaleItem(Base):
    __tablename__ = "sale_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sale_id: Mapped[str] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    product_name_snapshot: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price_cents: Mapped[int] = mapped_column(Integer)


class ProductPresentation(Base):
    __tablename__ = "product_presentations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    appointment_id: Mapped[str | None] = mapped_column(ForeignKey("appointments.id"), nullable=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    presented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Rental(Base):
    __tablename__ = "rentals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"), index=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[RentalStatus] = mapped_column(Enum(RentalStatus), default=RentalStatus.RENTED, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class TradeInCondition(str, enum.Enum):
    """Zustand des hereingenommenen Altgeraets."""

    WORKING = "working"        # laeuft
    DEFECTIVE = "defective"    # defekt
    PARTS = "parts"            # nur als Ersatzteile
    UNKNOWN = "unknown"        # noch nicht geprueft


class TradeInStatus(str, enum.Enum):
    """Wo das Altgeraet gerade steht."""

    RECEIVED = "received"      # angenommen
    STORED = "stored"          # eingelagert
    RETURNED = "returned"      # an den Kunden zurueck
    DISPOSED = "disposed"      # entsorgt
    SOLD = "sold"              # weiterverkauft


class TradeIn(Base):
    """Altgeraet, das bei einem Kunden hereingenommen wurde.

    Bewusst ein eigener Datensatz und keine Spalte am Verkauf: ein Altgeraet
    kann auch ohne Verkauf anfallen, und umgekehrt koennen bei einem Verkauf
    mehrere Geraete hereinkommen. Die Verbindung zum Verkauf bleibt deshalb
    optional.
    """

    __tablename__ = "trade_ins"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    # Wird der Verkauf spaeter geloescht, soll das Altgeraet erhalten bleiben.
    sale_id: Mapped[str | None] = mapped_column(
        ForeignKey("sales.id", ondelete="SET NULL"), nullable=True, index=True
    )
    model: Mapped[str] = mapped_column(String(255), index=True)
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    condition: Mapped[TradeInCondition] = mapped_column(
        Enum(TradeInCondition), default=TradeInCondition.UNKNOWN, index=True
    )
    status: Mapped[TradeInStatus] = mapped_column(
        Enum(TradeInStatus), default=TradeInStatus.RECEIVED, index=True
    )
    received_on: Mapped[date] = mapped_column(Date, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    sender_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MessageHidden(Base):
    __tablename__ = "message_hidden"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_message_hidden_user"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"),
        index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_utc
    )


class MessageRead(Base):
    __tablename__ = "message_reads"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_message_read_user"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    message_id: Mapped[str] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"),
        index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_utc
    )


class MessageAttachment(Base):
    __tablename__ = "message_attachments"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=uid
    )
    message_id: Mapped[str] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"),
        index=True
    )
    kind: Mapped[str] = mapped_column(String(30), index=True)
    file_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )
    content_type: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True
    )
    size_bytes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    storage_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        unique=True
    )
    metadata_json: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=now_utc,
        index=True
    )


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Neue Unterhaltung")
    last_entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)


class WeeklyStatistic(Base):
    __tablename__ = "weekly_statistics"
    __table_args__ = (UniqueConstraint("employee_id", "week_start", name="uq_week_stat"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    employee_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    week_start: Mapped[date] = mapped_column(Date, index=True)
    revenue_cents: Mapped[int] = mapped_column(Integer, default=0)
    units: Mapped[int] = mapped_column(Integer, default=0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    entity_type: Mapped[str] = mapped_column(String(120), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    before_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
