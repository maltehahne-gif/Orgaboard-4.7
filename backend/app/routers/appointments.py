from datetime import datetime
from pydantic import BaseModel, Field, model_validator
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.core.timeutils import utc_aware
from app.models import Appointment, AppointmentProduct, AppointmentStatus, AppointmentType, Customer, Employee, Product, ProductPresentation, Sale, User
from app.services.realtime import manager

router = APIRouter(prefix="/appointments", tags=["appointments"])


class AppointmentIn(BaseModel):
    customer_id: str | None = None
    employee_id: str | None = None
    start_at: datetime
    end_at: datetime | None = None
    appointment_type: AppointmentType = AppointmentType.CUSTOMER
    status: AppointmentStatus = AppointmentStatus.PLANNED
    notes: str | None = None
    product_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_period(self):
        if self.end_at is not None and self.end_at <= self.start_at:
            raise ValueError("Das Terminende muss nach dem Beginn liegen")
        return self


class StatusIn(BaseModel):
    status: AppointmentStatus


def serialize(db: Session, a: Appointment):
    c = db.get(Customer, a.customer_id) if a.customer_id else None
    product_ids = db.scalars(select(AppointmentProduct.product_id).where(AppointmentProduct.appointment_id == a.id)).all()
    products = db.scalars(select(Product).where(Product.id.in_(product_ids))).all() if product_ids else []
    return {
        "id": a.id,
        "customer_id": a.customer_id,
        "customer_name": f"{c.first_name} {c.last_name}" if c else None,
        "employee_id": a.employee_id,
        "start_at": utc_aware(a.start_at),
        "end_at": utc_aware(a.end_at) if a.end_at else None,
        "appointment_type": a.appointment_type.value,
        "status": a.status.value,
        "notes": a.notes,
        "address": a.address_snapshot,
        "phone": a.phone_snapshot,
        "email": a.email_snapshot,
        "products": [{"id": p.id, "name": p.name} for p in products],
    }


def snapshot_from_customer(a: Appointment, c: Customer | None):
    if not c:
        a.address_snapshot = None
        a.phone_snapshot = None
        a.email_snapshot = None
        return
    a.address_snapshot = " ".join(x for x in [c.street, c.house_number, c.postal_code, c.city] if x)
    a.phone_snapshot = c.phone
    a.email_snapshot = c.email


def customer_for_employee(db: Session, customer_id: str | None, employee_id: str) -> Customer | None:
    if not customer_id:
        return None
    customer = db.get(Customer, customer_id)
    if not customer or customer.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    if customer.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Kunde gehört nicht zum ausgewählten Mitarbeiter")
    return customer


def require_employee(db: Session, employee_id: str | None) -> str:
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen Mitarbeiter auswählen")
    if not db.get(Employee, employee_id):
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")
    return employee_id


@router.get("")
def list_appointments(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Appointment).order_by(Appointment.start_at)
    if scope:
        stmt = stmt.where(Appointment.employee_id == scope)
    if start:
        stmt = stmt.where(Appointment.start_at >= start)
    if end:
        stmt = stmt.where(Appointment.start_at < end)
    return [serialize(db, a) for a in db.scalars(stmt).all()]


@router.get("/next")
def next_appointment(employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Appointment).where(Appointment.start_at >= datetime.now().astimezone(), Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED])).order_by(Appointment.start_at)
    if scope:
        stmt = stmt.where(Appointment.employee_id == scope)
    a = db.scalar(stmt)
    return None if not a else serialize(db, a)


@router.post("", dependencies=[Depends(require_csrf)])
async def create_appointment(data: AppointmentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee_id = require_employee(db, scoped_employee_id(db, user, data.employee_id))
    c = customer_for_employee(db, data.customer_id, employee_id)
    a = Appointment(
        customer_id=data.customer_id, employee_id=employee_id, start_at=data.start_at, end_at=data.end_at,
        appointment_type=data.appointment_type, status=data.status, notes=data.notes,
    )
    snapshot_from_customer(a, c)
    db.add(a); db.flush()
    for pid in data.product_ids:
        if db.get(Product, pid):
            db.add(AppointmentProduct(appointment_id=a.id, product_id=pid))
    audit(db, user, "appointment.created", "appointment", a.id, after=serialize(db, a))
    db.commit()
    await manager.publish({"type":"data.changed","entity":"appointment"}, employee_id=employee_id)
    return serialize(db, a)


@router.put("/{appointment_id}", dependencies=[Depends(require_csrf)])
async def update_appointment(appointment_id: str, data: AppointmentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Appointment, appointment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Termin nicht gefunden")
    scoped_employee_id(db, user, a.employee_id)
    before = serialize(db, a)
    employee_id = require_employee(db, scoped_employee_id(db, user, data.employee_id or a.employee_id))
    customer = customer_for_employee(db, data.customer_id, employee_id)
    a.employee_id = employee_id
    a.customer_id = data.customer_id
    a.start_at = data.start_at; a.end_at = data.end_at; a.appointment_type = data.appointment_type; a.status = data.status; a.notes = data.notes
    snapshot_from_customer(a, customer)
    db.query(AppointmentProduct).filter(AppointmentProduct.appointment_id == a.id).delete()
    for pid in data.product_ids:
        if db.get(Product, pid):
            db.add(AppointmentProduct(appointment_id=a.id, product_id=pid))
    db.flush()
    audit(db, user, "appointment.updated", "appointment", a.id, before=before, after=serialize(db, a))
    db.commit()
    await manager.publish({"type":"data.changed","entity":"appointment"}, employee_id=a.employee_id)
    return serialize(db, a)


@router.patch("/{appointment_id}/status", dependencies=[Depends(require_csrf)])
async def set_status(appointment_id: str, data: StatusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Appointment, appointment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Termin nicht gefunden")
    scoped_employee_id(db, user, a.employee_id)
    before = {"status": a.status.value}
    a.status = data.status
    audit(db, user, "appointment.status_changed", "appointment", a.id, before=before, after={"status": a.status.value})
    db.commit()
    await manager.publish({"type":"data.changed","entity":"appointment"}, employee_id=a.employee_id)
    return serialize(db, a)


@router.delete("/{appointment_id}", status_code=204, dependencies=[Depends(require_csrf)])
async def delete_appointment(appointment_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Appointment, appointment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Termin nicht gefunden")
    scoped_employee_id(db, user, a.employee_id)
    employee_id = a.employee_id
    before = serialize(db, a)
    db.query(Sale).filter(Sale.appointment_id == a.id).update({Sale.appointment_id: None}, synchronize_session="fetch")
    db.query(ProductPresentation).filter(ProductPresentation.appointment_id == a.id).update({ProductPresentation.appointment_id: None}, synchronize_session="fetch")
    db.query(AppointmentProduct).filter(AppointmentProduct.appointment_id == a.id).delete(synchronize_session=False)
    audit(db, user, "appointment.deleted", "appointment", a.id, before=before)
    db.delete(a)
    db.commit()
    await manager.publish({"type":"data.changed","entity":"appointment"}, employee_id=employee_id)
