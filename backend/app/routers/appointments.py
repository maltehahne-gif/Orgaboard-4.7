from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.models import Appointment, AppointmentProduct, AppointmentStatus, AppointmentType, Customer, Product, User
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
    product_ids: list[str] = []


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
        "start_at": a.start_at,
        "end_at": a.end_at,
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
        return
    a.address_snapshot = " ".join(x for x in [c.street, c.house_number, c.postal_code, c.city] if x)
    a.phone_snapshot = c.phone
    a.email_snapshot = c.email


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
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen Mitarbeiter auswählen")
    c = None
    if data.customer_id:
        c = db.get(Customer, data.customer_id)
        if not c or c.deleted_at:
            raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
        if user.role.value != "TEAM_LEADER" and c.employee_id != employee_id:
            raise HTTPException(status_code=403, detail="Kunde gehört nicht zu diesem Mitarbeiter")
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
    employee_id = scoped_employee_id(db, user, data.employee_id or a.employee_id)
    a.employee_id = employee_id or a.employee_id
    a.customer_id = data.customer_id
    a.start_at = data.start_at; a.end_at = data.end_at; a.appointment_type = data.appointment_type; a.status = data.status; a.notes = data.notes
    snapshot_from_customer(a, db.get(Customer, data.customer_id) if data.customer_id else None)
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



# ORGABOARD APPOINTMENT DELETE

@router.delete(
    "/{appointment_id}",
    status_code=204,
    dependencies=[Depends(require_csrf)],
)
def delete_appointment(
    appointment_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    appointment = db.get(
        Appointment,
        appointment_id,
    )

    if not appointment:
        raise HTTPException(
            status_code=404,
            detail="Termin nicht gefunden",
        )

    # Mitarbeiter dürfen nur ihre eigenen Termine löschen.
    # Teamleiter dürfen Termine des Teams löschen.
    if user.role.value != "TEAM_LEADER":
        employee_id = scoped_employee_id(
            db,
            user,
            None,
        )

        if appointment.employee_id != employee_id:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Du darfst diesen Termin "
                    "nicht löschen"
                ),
            )

    db.delete(appointment)
    db.commit()

    return None
