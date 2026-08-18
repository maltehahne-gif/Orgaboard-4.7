from datetime import datetime, timezone
from pydantic import BaseModel, Field, model_validator
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.timeutils import local_today, to_business_tz
from app.core.security import get_current_user, require_csrf
from app.models import Customer, Product, Rental, RentalStatus, User
from app.services.realtime import manager

router = APIRouter(prefix="/rentals", tags=["rentals"])




class RentalStatusIn(BaseModel):
    status: RentalStatus
    returned_at: datetime | None = None

class RentalIn(BaseModel):
    product_id: str
    customer_id: str
    employee_id: str | None = None
    serial_number: str | None = Field(default=None, max_length=120)
    issued_at: datetime
    due_at: datetime | None = None
    returned_at: datetime | None = None
    status: RentalStatus = RentalStatus.RENTED
    notes: str | None = Field(default=None, max_length=10_000)

    @model_validator(mode="after")
    def zeitfolge_pruefen(self):
        """Ausgabe, Faelligkeit und Rueckgabe muessen in dieser Reihenfolge liegen.

        Eine Faelligkeit vor der Ausgabe macht das Geraet im selben Moment
        ueberfaellig: Es taucht sofort in der Mahnliste, im Zaehler und in den
        Tagesprioritaeten auf, obwohl es gerade erst herausgegeben wurde.
        """
        if self.due_at is not None and self.due_at <= self.issued_at:
            raise ValueError("Die Rückgabefrist muss nach der Ausgabe liegen")
        if self.returned_at is not None and self.returned_at < self.issued_at:
            raise ValueError("Die Rückgabe kann nicht vor der Ausgabe liegen")
        return self


# Ab so vielen Tagen vor der Rueckgabe wird erinnert.
ERINNERUNG_TAGE = 3


def _normalisiertes_rueckgabedatum(status: RentalStatus, returned_at: datetime | None) -> datetime | None:
    """Erzwingt die Datenregel unabhaengig vom Frontend.

    status == RETURNED verlangt ein gesetztes returned_at - fehlt es, gilt
    der Zeitpunkt dieser Anfrage. Jeder andere Status macht returned_at
    bedeutungslos: ein Geraet, das wieder als "verliehen" gefuehrt wird,
    darf kein Rueckgabedatum aus einer frueheren Rueckgabe mitschleppen.
    """
    if status == RentalStatus.RETURNED:
        return returned_at or datetime.now(timezone.utc)
    return None


def due_state(r: Rental) -> dict:
    """Faelligkeit eines Verleihs.

    Wird hier berechnet, nicht in der Oberflaeche: sonst muesste jede
    Darstellung ihre eigene Zeitzonenrechnung machen und sie wuerden
    auseinanderlaufen.
    """
    offen = r.status in {RentalStatus.RENTED, RentalStatus.DUE}
    if not offen or not r.due_at:
        return {"is_overdue": False, "due_soon": False, "days_until_due": None, "days_overdue": 0}

    faellig = to_business_tz(r.due_at).date()
    heute = local_today()
    tage = (faellig - heute).days

    return {
        "is_overdue": tage < 0,
        "due_soon": 0 <= tage <= ERINNERUNG_TAGE,
        "days_until_due": tage,
        "days_overdue": -tage if tage < 0 else 0,
    }


def serialize(db: Session, r: Rental):
    c = db.get(Customer, r.customer_id); p = db.get(Product, r.product_id)
    return {
        "id": r.id, "product_id": r.product_id, "product_name": p.name if p else None,
        "customer_id": r.customer_id, "customer_name": f"{c.first_name} {c.last_name}" if c else None,
        "customer_phone": c.phone if c else None,
        "employee_id": r.employee_id, "serial_number": r.serial_number, "issued_at": r.issued_at,
        "due_at": r.due_at, "returned_at": r.returned_at, "status": r.status.value, "notes": r.notes,
        **due_state(r),
    }


def _geraeteschluessel(r: Rental) -> str | None:
    """Erkennungsmerkmal eines physischen Geraets.

    Produkt allein reicht nicht - davon gibt es viele Exemplare. Erst die
    Seriennummer macht ein einzelnes Geraet unterscheidbar. Ohne sie laesst
    sich keine Historie fuehren, deshalb faellt so ein Verleih hier raus.

    Gross-/Kleinschreibung und Leerzeichen werden angeglichen: "vk7-1234"
    und "VK7-1234 " sind dasselbe Geraet, nur unterschiedlich eingetippt.
    """
    if not r.serial_number or not r.serial_number.strip():
        return None
    return f"{r.product_id}:{r.serial_number.strip().upper()}"


def _tage_draussen(r: Rental) -> int:
    """Wie lange das Geraet bei diesem Verleih ausser Haus war/ist."""
    ende = r.returned_at or datetime.now(timezone.utc)
    tage = (to_business_tz(ende).date() - to_business_tz(r.issued_at).date()).days
    return max(tage, 0)


def _verleihe_im_zugriff(db: Session, user: User, employee_id: str | None):
    """Alle Verleihe, die der Anfragende sehen darf - aelteste zuerst."""
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Rental).order_by(Rental.issued_at.asc())
    if scope:
        stmt = stmt.where(Rental.employee_id == scope)
    return db.scalars(stmt).all()


@router.get("/devices")
def list_devices(
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Geraete statt Vorgaenge: ein Eintrag je Seriennummer.

    Die Verleihliste zeigt einzelne Ausgaben. Wer wissen will, wie oft ein
    bestimmtes Geraet schon unterwegs war und wie es zurueckkam, muss sonst
    die Liste im Kopf zusammenrechnen.
    """
    geraete: dict[str, dict] = {}

    for r in _verleihe_im_zugriff(db, user, employee_id):
        key = _geraeteschluessel(r)
        if key is None:
            continue

        eintrag = geraete.get(key)
        if eintrag is None:
            produkt = db.get(Product, r.product_id)
            eintrag = geraete[key] = {
                "key": key,
                "product_id": r.product_id,
                "product_name": produkt.name if produkt else None,
                "serial_number": r.serial_number.strip(),
                "loans": 0,
                "days_out": 0,
                "late_returns": 0,
                "customer_ids": set(),
                "first_issued_at": r.issued_at,
                "last_issued_at": r.issued_at,
                "current": None,
            }

        eintrag["loans"] += 1
        eintrag["days_out"] += _tage_draussen(r)
        eintrag["customer_ids"].add(r.customer_id)
        eintrag["last_issued_at"] = r.issued_at
        # Schreibweise der juengsten Ausgabe gewinnt - die ist am ehesten aktuell.
        eintrag["serial_number"] = r.serial_number.strip()

        if r.returned_at and r.due_at and r.returned_at > r.due_at:
            eintrag["late_returns"] += 1

        if r.status in {RentalStatus.RENTED, RentalStatus.DUE}:
            c = db.get(Customer, r.customer_id)
            eintrag["current"] = {
                "rental_id": r.id,
                "customer_id": r.customer_id,
                "customer_name": f"{c.first_name} {c.last_name}" if c else None,
                "issued_at": r.issued_at,
                "due_at": r.due_at,
                **due_state(r),
            }

    ausgabe = []
    for eintrag in geraete.values():
        kunden = eintrag.pop("customer_ids")
        ausgabe.append({**eintrag, "customers": len(kunden), "in_use": eintrag["current"] is not None})

    # Geraete, die gerade draussen sind, zuerst - danach die zuletzt benutzten.
    ausgabe.sort(key=lambda d: (not d["in_use"], -d["last_issued_at"].timestamp()))
    return ausgabe


@router.get("/devices/history")
def device_history(
    product_id: str,
    serial_number: str,
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lebenslauf eines Geraets: jede Ausgabe, neueste zuerst."""
    gesucht = f"{product_id}:{serial_number.strip().upper()}"
    treffer = [r for r in _verleihe_im_zugriff(db, user, employee_id) if _geraeteschluessel(r) == gesucht]

    if not treffer:
        raise HTTPException(status_code=404, detail="Zu diesem Gerät ist nichts erfasst")

    produkt = db.get(Product, product_id)
    verlauf = []
    for r in reversed(treffer):
        verlauf.append({
            **serialize(db, r),
            "days_out": _tage_draussen(r),
            "returned_late": bool(r.returned_at and r.due_at and r.returned_at > r.due_at),
        })

    return {
        "product_id": product_id,
        "product_name": produkt.name if produkt else None,
        "serial_number": treffer[-1].serial_number.strip(),
        "loans": len(treffer),
        "days_out": sum(_tage_draussen(r) for r in treffer),
        "customers": len({r.customer_id for r in treffer}),
        "late_returns": len([r for r in treffer if r.returned_at and r.due_at and r.returned_at > r.due_at]),
        "first_issued_at": treffer[0].issued_at,
        "history": verlauf,
    }


@router.get("/summary")
def rental_summary(
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zähler für Dashboard und Warnhinweis."""
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Rental).where(Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]))
    if scope:
        stmt = stmt.where(Rental.employee_id == scope)
    rows = db.scalars(stmt).all()
    zustaende = [due_state(r) for r in rows]

    return {
        "active": len(rows),
        "overdue": len([z for z in zustaende if z["is_overdue"]]),
        "due_soon": len([z for z in zustaende if z["due_soon"]]),
        "reminder_days": ERINNERUNG_TAGE,
    }


@router.get("")
def list_rentals(employee_id: str | None = None, active_only: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Rental).order_by(Rental.due_at.asc().nullslast(), Rental.issued_at.desc())
    if scope:
        stmt = stmt.where(Rental.employee_id == scope)
    if active_only:
        stmt = stmt.where(Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]))
    return [serialize(db, r) for r in db.scalars(stmt).all()]


@router.post("", dependencies=[Depends(require_csrf)])
async def create_rental(data: RentalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Mitarbeiter fehlt")
    c = db.get(Customer, data.customer_id); p = db.get(Product, data.product_id)
    if not c or not p or not p.verified or not p.active:
        raise HTTPException(status_code=400, detail="Kunde oder aktives, verifiziertes Produkt nicht gefunden")
    payload = data.model_dump(exclude={"employee_id"})
    payload["returned_at"] = _normalisiertes_rueckgabedatum(data.status, data.returned_at)
    r = Rental(employee_id=employee_id, **payload)
    db.add(r); db.flush(); audit(db, user, "rental.created", "rental", r.id, after=serialize(db, r)); db.commit()
    await manager.publish({"type":"data.changed","entity":"rental"}, employee_id=employee_id)
    return serialize(db, r)


@router.put("/{rental_id}", dependencies=[Depends(require_csrf)])
async def update_rental(rental_id: str, data: RentalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Rental, rental_id)
    if not r:
        raise HTTPException(status_code=404, detail="Verleih nicht gefunden")
    scoped_employee_id(db, user, r.employee_id)
    before = serialize(db, r)
    payload = data.model_dump(exclude={"employee_id"})
    payload["returned_at"] = _normalisiertes_rueckgabedatum(data.status, data.returned_at)
    for key, value in payload.items():
        setattr(r, key, value)
    audit(db, user, "rental.updated", "rental", r.id, before=before, after=serialize(db, r)); db.commit()
    await manager.publish({"type":"data.changed","entity":"rental"}, employee_id=r.employee_id)
    return serialize(db, r)


@router.patch("/{rental_id}/status", dependencies=[Depends(require_csrf)])
async def update_rental_status(rental_id: str, data: RentalStatusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Rental, rental_id)
    if not r:
        raise HTTPException(status_code=404, detail="Verleih nicht gefunden")
    scoped_employee_id(db, user, r.employee_id)
    before = {"status": r.status.value, "returned_at": r.returned_at.isoformat() if r.returned_at else None}
    r.status = data.status
    r.returned_at = _normalisiertes_rueckgabedatum(data.status, data.returned_at)
    audit(db, user, "rental.status_changed", "rental", r.id, before=before, after={"status": r.status.value, "returned_at": r.returned_at.isoformat() if r.returned_at else None})
    db.commit()
    await manager.publish({"type":"data.changed","entity":"rental"}, employee_id=r.employee_id)
    return serialize(db, r)
