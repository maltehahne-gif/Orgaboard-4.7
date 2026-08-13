from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.core.timeutils import utc_aware
from app.models import Appointment, AppointmentProduct, AppointmentStatus, AppointmentType, Customer, Employee, Product, ProductPresentation, Rental, RentalStatus, Sale, SaleChannel, SaleItem, User
from app.services.realtime import manager
from app.services.stats import refresh_weekly_stat

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


class CompletionSaleItemIn(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=999)
    unit_price_cents: int = Field(ge=0)


class CompleteAppointmentIn(BaseModel):
    outcome: Literal["sale", "rental", "none"]

    sale_sold_at: datetime | None = None
    sale_channel: SaleChannel = SaleChannel.FIELD
    sale_notes: str | None = None
    sale_items: list[CompletionSaleItemIn] = Field(default_factory=list)

    rental_product_id: str | None = None
    rental_serial_number: str | None = None
    rental_issued_at: datetime | None = None
    rental_due_at: datetime | None = None
    rental_notes: str | None = None


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



@router.post(
    "/{appointment_id}/complete",
    dependencies=[Depends(require_csrf)],
)
async def complete_appointment(
    appointment_id: str,
    data: CompleteAppointmentIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    a = db.get(Appointment, appointment_id)

    if not a:
        raise HTTPException(
            status_code=404,
            detail="Termin nicht gefunden",
        )

    scoped_employee_id(db, user, a.employee_id)

    if a.status == AppointmentStatus.COMPLETED:
        raise HTTPException(
            status_code=409,
            detail="Dieser Termin wurde bereits durchgeführt",
        )

    customer = (
        db.get(Customer, a.customer_id)
        if a.customer_id
        else None
    )

    sale_id = None
    rental_id = None

    if data.outcome in {"sale", "rental"}:
        if not customer or customer.deleted_at:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Für Verkauf oder Verleih muss dem Termin "
                    "ein Kunde zugeordnet sein"
                ),
            )

        if customer.employee_id != a.employee_id:
            raise HTTPException(
                status_code=403,
                detail="Kunde gehört nicht zum Termin-Mitarbeiter",
            )

    if data.outcome == "sale":
        if not data.sale_items:
            raise HTTPException(
                status_code=400,
                detail="Bitte mindestens ein verkauftes Produkt auswählen",
            )

        existing_sale = db.scalar(
            select(Sale.id).where(
                Sale.appointment_id == a.id
            )
        )

        if existing_sale:
            raise HTTPException(
                status_code=409,
                detail="Für diesen Termin existiert bereits ein Verkauf",
            )

        resolved = []

        for item in data.sale_items:
            product = db.get(Product, item.product_id)

            if not product or not product.verified or not product.active:
                raise HTTPException(
                    status_code=400,
                    detail="Nur aktive verifizierte Produkte dürfen verkauft werden",
                )

            resolved.append((product, item))

        sold_at = (
            data.sale_sold_at
            or datetime.now().astimezone()
        )

        sale = Sale(
            customer_id=customer.id,
            employee_id=a.employee_id,
            appointment_id=a.id,
            sold_at=sold_at,
            channel=data.sale_channel,
            notes=data.sale_notes,
        )

        db.add(sale)
        db.flush()

        for product, item in resolved:
            db.add(
                SaleItem(
                    sale_id=sale.id,
                    product_id=product.id,
                    product_name_snapshot=product.name,
                    quantity=item.quantity,
                    unit_price_cents=item.unit_price_cents,
                )
            )

        db.flush()

        refresh_weekly_stat(
            db,
            a.employee_id,
            sold_at.date(),
        )

        sale_id = sale.id

    elif data.outcome == "rental":
        if not data.rental_product_id:
            raise HTTPException(
                status_code=400,
                detail="Bitte ein Gerät auswählen",
            )

        product = db.get(
            Product,
            data.rental_product_id,
        )

        if not product or not product.verified or not product.active:
            raise HTTPException(
                status_code=400,
                detail="Verleihgerät nicht gefunden",
            )

        issued_at = (
            data.rental_issued_at
            or datetime.now().astimezone()
        )

        if not data.rental_due_at:
            raise HTTPException(
                status_code=400,
                detail="Bitte das geplante Rückgabedatum angeben",
            )

        if data.rental_due_at <= issued_at:
            raise HTTPException(
                status_code=400,
                detail="Die Rückgabe muss nach der Ausgabe liegen",
            )

        rental = Rental(
            product_id=product.id,
            customer_id=customer.id,
            employee_id=a.employee_id,
            serial_number=(
                data.rental_serial_number.strip()
                if data.rental_serial_number
                else None
            ),
            issued_at=issued_at,
            due_at=data.rental_due_at,
            returned_at=None,
            status=RentalStatus.RENTED,
            notes=data.rental_notes,
        )

        db.add(rental)
        db.flush()

        rental_id = rental.id

    before_status = a.status.value
    a.status = AppointmentStatus.COMPLETED

    audit(
        db,
        user,
        "appointment.completed",
        "appointment",
        a.id,
        before={
            "status": before_status,
        },
        after={
            "status": AppointmentStatus.COMPLETED.value,
            "outcome": data.outcome,
            "sale_id": sale_id,
            "rental_id": rental_id,
        },
    )

    db.commit()

    await manager.publish(
        {
            "type": "data.changed",
            "entity": "appointment",
            "action": "completed",
        },
        employee_id=a.employee_id,
    )

    if sale_id:
        await manager.publish(
            {
                "type": "data.changed",
                "entity": "sale",
                "action": "created",
            },
            employee_id=a.employee_id,
        )

    if rental_id:
        await manager.publish(
            {
                "type": "data.changed",
                "entity": "rental",
                "action": "created",
            },
            employee_id=a.employee_id,
        )

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
