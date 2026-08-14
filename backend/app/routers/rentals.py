from datetime import datetime, timezone
from pydantic import BaseModel
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
    serial_number: str | None = None
    issued_at: datetime
    due_at: datetime | None = None
    returned_at: datetime | None = None
    status: RentalStatus = RentalStatus.RENTED
    notes: str | None = None


# Ab so vielen Tagen vor der Rueckgabe wird erinnert.
ERINNERUNG_TAGE = 3


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
    r = Rental(employee_id=employee_id, **data.model_dump(exclude={"employee_id"}))
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
    for key, value in data.model_dump(exclude={"employee_id"}).items():
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
    if data.status == RentalStatus.RETURNED:
        r.returned_at = data.returned_at or datetime.now(timezone.utc)
    elif data.returned_at is not None:
        r.returned_at = data.returned_at
    audit(db, user, "rental.status_changed", "rental", r.id, before=before, after={"status": r.status.value, "returned_at": r.returned_at.isoformat() if r.returned_at else None})
    db.commit()
    await manager.publish({"type":"data.changed","entity":"rental"}, employee_id=r.employee_id)
    return serialize(db, r)
